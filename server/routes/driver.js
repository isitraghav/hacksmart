const express = require('express');
const router = express.Router();
const driverService = require('../services/driverService');
const partnersModel = require('../models/partners');
const osrmService = require('../services/osrm');
const driversModel = require('../models/drivers');
const batteriesModel = require('../models/batteries');
const dailySwapHistoryModel = require('../models/dailySwapHistory');
const { notificationsModel, NotificationTypes } = require('../models/notifications');
const { pricingModel, PRICING } = require('../models/pricing');
const { inventoryRebalancer } = require('../services/inventoryRebalancer');

/**
 * GET /:driverId/info
 * Get driver info including current battery
 */
router.get('/:driverId/info', async (req, res) => {
    try {
        const { driverId } = req.params;

        let driver = await driversModel.getById(driverId);
        if (!driver) {
            // Auto-create driver if not exists (for demo)
            driver = await driversModel.create({
                id: driverId,
                name: 'Driver ' + driverId,
                phone: '0000000000',
                lat: 26.8467,
                lon: 80.9462
            });
        }

        // Get driver's current batteries (from batteries table)
        const batteries = await batteriesModel.getAllByDriver(driverId);

        // Also check if driver has a battery assigned via current_battery_id
        let currentBattery = null;
        if (driver.current_battery_id) {
            currentBattery = await batteriesModel.getById(driver.current_battery_id);
        }

        // Merge: prefer batteries from batteries table, but include current_battery_id if different
        let allBatteries = batteries || [];
        if (currentBattery && !allBatteries.find(b => b.id === currentBattery.id)) {
            allBatteries.push(currentBattery);
        }

        res.json({
            success: true,
            driver: {
                id: driver.id,
                name: driver.name,
                phone: driver.phone,
                status: driver.status,
                latitude: driver.current_latitude,
                longitude: driver.current_longitude,
                current_battery_id: driver.current_battery_id
            },
            batteries: allBatteries.map(b => ({
                id: b.id,
                soc: b.soc,
                status: b.status,
                updated_at: b.updated_at
            }))
        });
    } catch (e) {
        console.error('Error getting driver info:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /find-best-station
 * Find nearest/best station with stock
 * Body: { lat, lon, radius? }
 */
router.post('/find-best-station', async (req, res) => {
    try {
        const { lat, lon, radius } = req.body;
        if (!lat || !lon) return res.status(400).json({ error: 'lat, lon required' });

        const station = await driverService.findBestStation(lat, lon, radius);
        if (!station) return res.status(404).json({ error: 'No suitable station found nearby' });

        res.json({ success: true, station });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /start-route
 * Driver initiates route to station
 * Body: { driverId, stationId, lat, lon }
 */
router.post('/start-route', async (req, res) => {
    try {
        const { driverId, stationId, lat, lon } = req.body;
        if (!driverId || !stationId) return res.status(400).json({ error: 'driverId, stationId required' });

        // Get route geometry from OSRM
        const station = await partnersModel.getById(stationId);
        if (!station) return res.status(404).json({ error: 'Station not found' });

        const routeData = await osrmService.getRoute(lon, lat, station.longitude, station.latitude);

        // Register active route
        await driverService.startRoute(driverId, stationId, lat, lon);

        res.json({ success: true, route: routeData });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /swap
 * Execute battery swap - transfers actual batteries between driver and station
 * Includes pricing calculation with leave penalties and service charges
 * Body: { driverId, stationId, driverSoc?, currentBatteryId?, isSecondary? }
 */
router.post('/swap', async (req, res) => {
    try {
        const { driverId, stationId, driverSoc, currentBatteryId, isSecondary } = req.body;
        if (!stationId || !driverId) return res.status(400).json({ error: 'stationId and driverId required' });

        const station = await partnersModel.getById(stationId);
        if (!station) return res.status(404).json({ error: 'Station not found' });

        // Auto-create driver if not exists (for demo purposes)
        let driver = await driversModel.getById(driverId);
        if (!driver) {
            driver = await driversModel.create({
                id: driverId,
                name: 'Driver ' + driverId,
                phone: '0000000000',
                lat: station.latitude || 26.8467,
                lon: station.longitude || 80.9462
            });
            console.log(`[Swap] Auto-created driver: ${driverId}`);
        }

        // 1. Find the best battery at the station (highest SOC)
        const newBattery = await batteriesModel.getBestAtStation(stationId);
        if (!newBattery) {
            return res.status(400).json({
                success: false,
                error: 'No batteries available at this station'
            });
        }

        // 2. Get driver's current battery (if any)
        // Priority: 1) Battery in batteries table with driver_id, 2) From request, 3) From driver record
        let oldBattery = await batteriesModel.getByDriver(driverId);

        // If driver has no battery in DB, try from request or driver record
        if (!oldBattery && currentBatteryId) {
            oldBattery = await batteriesModel.getById(currentBatteryId);
            console.log(`[Swap] Found battery from request: ${currentBatteryId}`);
        }
        if (!oldBattery && driver.current_battery_id) {
            oldBattery = await batteriesModel.getById(driver.current_battery_id);
            console.log(`[Swap] Found battery from driver record: ${driver.current_battery_id}`);
        }

        // 3. Calculate swap payment with penalties and service charges
        const zone = station.zone || 'URBAN';

        // Calculate SOC once to use consistently
        // Use actual SOC from request if provided, otherwise use a realistic low value
        const actualOldSoc = driverSoc != null ? parseInt(driverSoc) : null;
        const savedOldBatterySoc = actualOldSoc ?? Math.max(5, Math.floor(Math.random() * 30));

        let paymentDetails;
        if (req.body.paymentMode === 'DYNAMIC' || PRICING.DYNAMIC_MODE_ENABLED) {
            // Dynamic Pricing: Pay for energy consumed (New SOC - Old SOC)
            // Assuming New Battery is ~100% or explicitly newBattery.soc
            paymentDetails = await pricingModel.calculateDynamicSwapPayment(
                driverId,
                zone,
                newBattery.soc || 100,
                savedOldBatterySoc
            );
        } else {
            // Fixed Pricing
            paymentDetails = await pricingModel.calculateSwapPayment(driverId, zone, isSecondary || false);
        }

        paymentDetails.stationId = stationId;

        // 4. Transfer old battery from Driver -> Station (for charging)
        if (oldBattery) {
            await batteriesModel.updateSoc(oldBattery.id, savedOldBatterySoc);
            // Move to station for charging
            await batteriesModel.updateStatus(oldBattery.id, 'CHARGING', 'STATION', stationId);
            console.log(`[Swap] Returned battery ${oldBattery.id} (SOC: ${savedOldBatterySoc}%) to station ${stationId}`);
        } else {
            console.log(`[Swap] Driver ${driverId} had no battery to return (first swap)`);
        }

        // 4. Transfer new battery from Station -> Driver
        await batteriesModel.updateStatus(newBattery.id, 'IN_USE', 'DRIVER', driverId);
        await driversModel.assignBattery(driverId, newBattery.id);
        console.log(`[Swap] Assigned battery ${newBattery.id} (SOC: ${newBattery.soc}%) to driver ${driverId}`);

        // 5. Recalculate station metrics from actual battery data
        const stationBatteries = await batteriesModel.getByStation(stationId);
        const totalAtStation = stationBatteries.length;
        const chargedAtStation = stationBatteries.filter(b => b.soc >= 80).length;

        await partnersModel.updateMetrics(stationId, totalAtStation, chargedAtStation);

        // 6. Increment Swap Frequency and record daily swap history for time series analysis
        await partnersModel.incrementTotalSwaps(stationId);
        await dailySwapHistoryModel.recordSwap(stationId);
        console.log(`[Swap] Station ${stationId} swap recorded for time series analysis`);

        // 7. Record swap payment transaction
        await pricingModel.recordSwapPayment(driverId, paymentDetails);
        console.log(`[Swap] Payment recorded: ₹${paymentDetails.totalPayment} Mode: ${paymentDetails.paymentMode}`);

        // 8. Send notifications
        // Notify driver about swap completion with payment breakdown
        await notificationsModel.create({
            recipientType: 'DRIVER',
            recipientId: driverId,
            type: NotificationTypes.SWAP_COMPLETE,
            title: 'Battery Swap Complete',
            message: `Battery ${newBattery.id} (${newBattery.soc}%) received. Payment: ₹${paymentDetails.totalPayment}`,
            data: {
                batteryId: newBattery.id,
                soc: newBattery.soc,
                stationId,
                payment: paymentDetails
            }
        });

        // Notify partner about battery received/dispatched
        await notificationsModel.create({
            recipientType: 'PARTNER',
            recipientId: stationId,
            type: NotificationTypes.BATTERY_DISPATCHED,
            title: 'Battery Dispatched',
            message: `Battery ${newBattery.id} (${newBattery.soc}%) was picked up by driver ${driverId}`,
            data: { batteryId: newBattery.id, driverId, soc: newBattery.soc }
        });

        if (oldBattery) {
            await notificationsModel.create({
                recipientType: 'PARTNER',
                recipientId: stationId,
                type: NotificationTypes.BATTERY_RECEIVED,
                title: 'Battery Received',
                message: `Battery ${oldBattery.id} received from driver ${driverId} with ${driverSoc || 'low'}% charge`,
                data: { batteryId: oldBattery.id, driverId, soc: driverSoc }
            });
        }

        // 9. Check for low inventory and trigger auto-rebalancing if needed
        const lowThreshold = station?.low_inventory_threshold || 3;
        if (chargedAtStation <= lowThreshold) {
            const isCritical = chargedAtStation === 0;
            const urgencyLevel = isCritical ? 'CRITICAL' : chargedAtStation <= 1 ? 'URGENT' : 'LOW';

            await notificationsModel.create({
                recipientType: 'PARTNER',
                recipientId: stationId,
                type: NotificationTypes.LOW_INVENTORY,
                title: isCritical ? '🚨 CRITICAL: No Batteries!' : '⚠️ Low Inventory Alert',
                message: isCritical
                    ? `Station is EMPTY! No charged batteries available for drivers. Auto-rebalancing initiated - searching for nearest supply source...`
                    : `Only ${chargedAtStation} charged batteries remaining (threshold: ${lowThreshold}). Auto-rebalancing initiated - searching for supply source...`,
                data: {
                    chargedCount: chargedAtStation,
                    totalCount: totalAtStation,
                    threshold: lowThreshold,
                    urgency: urgencyLevel,
                    action: 'AUTO_REBALANCING_STARTED',
                    triggeredBy: 'SWAP_EVENT'
                }
            });

            // Trigger AI-based auto-rebalancing
            inventoryRebalancer.onSwapComplete(stationId, chargedAtStation);
        }

        // End active route
        driverService.endRoute(driverId);

        res.json({
            success: true,
            message: 'Swap successful',
            batteryReceived: { id: newBattery.id, soc: newBattery.soc },
            batteryReturned: oldBattery ? { id: oldBattery.id, soc: savedOldBatterySoc } : null,
            payment: {
                total: paymentDetails.totalPayment,
                swapPrice: paymentDetails.swapPrice,
                zone: paymentDetails.zone,
                penaltyDeduction: paymentDetails.penaltyDeduction,
                serviceDeduction: paymentDetails.serviceDeduction,
                breakdown: paymentDetails.breakdown
            },
            stationStats: {
                total: totalAtStation,
                charged: chargedAtStation
            }
        });
    } catch (e) {
        console.error('Swap Error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * GET /pricing
 * Get current pricing constants
 */
router.get('/pricing', (req, res) => {
    res.json({ success: true, pricing: PRICING });
});

/**
 * GET /balance/:driverId
 * Get driver's balance and pending charges
 */
router.get('/balance/:driverId', async (req, res) => {
    try {
        const { driverId } = req.params;
        const balance = await pricingModel.getDriverBalance(driverId);
        res.json({ success: true, ...balance });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /leave
 * Record driver leave/absence
 * Body: { driverId }
 */
router.post('/leave', async (req, res) => {
    try {
        const { driverId } = req.body;
        if (!driverId) return res.status(400).json({ error: 'driverId required' });

        const result = await pricingModel.recordLeave(driverId);
        res.json({ success: true, ...result });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /service-charge
 * Add service charge to driver account
 * Body: { driverId, amount? }
 */
router.post('/service-charge', async (req, res) => {
    try {
        const { driverId, amount } = req.body;
        if (!driverId) return res.status(400).json({ error: 'driverId required' });

        const result = await pricingModel.addServiceCharge(driverId, amount);
        res.json({ success: true, ...result });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * GET /transactions/:driverId
 * Get driver's transaction history
 */
router.get('/transactions/:driverId', async (req, res) => {
    try {
        const { driverId } = req.params;
        const limit = parseInt(req.query.limit) || 20;
        const transactions = await pricingModel.getTransactionHistory(driverId, limit);
        res.json({ success: true, transactions });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /return
 * Return a battery and get refund based on remaining charge
 * Body: { driverId, stationId, batteryId }
 */
router.post('/return', async (req, res) => {
    try {
        const { driverId, stationId, batteryId } = req.body;
        if (!stationId || !driverId) {
            return res.status(400).json({ error: 'stationId and driverId required' });
        }

        const station = await partnersModel.getById(stationId);
        if (!station) return res.status(404).json({ error: 'Station not found' });

        const driver = await driversModel.getById(driverId);
        if (!driver) return res.status(404).json({ error: 'Driver not found' });

        // Get the battery to return
        let batteryToReturn;
        if (batteryId) {
            batteryToReturn = await batteriesModel.getById(batteryId);
        } else {
            // Get driver's current battery
            batteryToReturn = await batteriesModel.getByDriver(driverId);
        }

        if (!batteryToReturn) {
            return res.status(400).json({
                success: false,
                error: 'No battery found to return'
            });
        }

        // Verify the battery belongs to the driver
        if (batteryToReturn.current_driver_id !== driverId) {
            return res.status(403).json({
                success: false,
                error: 'Battery does not belong to this driver'
            });
        }

        const currentSoc = batteryToReturn.soc || 0;
        
        // Calculate refund based on remaining charge
        // Refund = (Current SOC / 100) * Base Swap Price
        // Using dynamic pricing: kWh remaining * rate per kWh
        const batteryCapacity = PRICING.BATTERY_CAPACITY_KWH;
        const kwhRemaining = (currentSoc / 100) * batteryCapacity;
        const refundAmount = Math.round(kwhRemaining * PRICING.KWH_RATE);

        // Minimum SOC to get any refund (e.g., at least 20% charge)
        const minRefundSoc = 20;
        const actualRefund = currentSoc >= minRefundSoc ? refundAmount : 0;

        // Transfer battery from Driver -> Station
        await batteriesModel.updateStatus(batteryToReturn.id, 'IDLE', 'STATION', stationId);
        
        // Remove battery from driver
        await driversModel.assignBattery(driverId, null);
        
        // Recalculate station metrics
        const stationBatteries = await batteriesModel.getByStation(stationId);
        const totalAtStation = stationBatteries.length;
        const chargedAtStation = stationBatteries.filter(b => b.soc >= 80).length;
        await partnersModel.updateMetrics(stationId, totalAtStation, chargedAtStation);

        // Record refund transaction
        if (actualRefund > 0) {
            await pricingModel.recordRefund(driverId, {
                amount: actualRefund,
                batteryId: batteryToReturn.id,
                soc: currentSoc,
                stationId,
                kwhReturned: kwhRemaining
            });
        }

        console.log(`[Return] Driver ${driverId} returned battery ${batteryToReturn.id} (SOC: ${currentSoc}%) - Refund: ₹${actualRefund}`);

        // Send notifications
        await notificationsModel.create({
            recipientType: 'DRIVER',
            recipientId: driverId,
            type: 'BATTERY_RETURNED',
            title: actualRefund > 0 ? '✅ Battery Returned - Refund Issued' : '✅ Battery Returned',
            message: actualRefund > 0 
                ? `Battery ${batteryToReturn.id} returned with ${currentSoc}% charge. Refund: ₹${actualRefund} credited to your account.`
                : `Battery ${batteryToReturn.id} returned with ${currentSoc}% charge. No refund (below ${minRefundSoc}% threshold).`,
            data: {
                batteryId: batteryToReturn.id,
                soc: currentSoc,
                stationId,
                refund: actualRefund,
                kwhReturned: kwhRemaining
            }
        });

        await notificationsModel.create({
            recipientType: 'PARTNER',
            recipientId: stationId,
            type: 'BATTERY_RECEIVED',
            title: '🔋 Battery Returned by Driver',
            message: `Battery ${batteryToReturn.id} (${currentSoc}%) returned by driver ${driverId}`,
            data: { 
                batteryId: batteryToReturn.id, 
                driverId, 
                soc: currentSoc 
            }
        });

        res.json({
            success: true,
            message: 'Battery returned successfully',
            refund: actualRefund,
            battery: {
                id: batteryToReturn.id,
                soc: currentSoc,
                kwhReturned: kwhRemaining
            },
            station: {
                id: stationId,
                name: station.id
            }
        });
    } catch (error) {
        console.error('Error returning battery:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;

