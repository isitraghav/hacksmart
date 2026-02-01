const express = require('express');
const router = express.Router();
const balancingAgent = require('../services/balancingAgent');
const logisticsAgent = require('../services/logisticsAgent');
const { inventoryRebalancer } = require('../services/inventoryRebalancer');
const { congestionDetector } = require('../services/congestionDetector');
const forecastingService = require('../services/forecastingService');
const dailySwapHistoryModel = require('../models/dailySwapHistory');
const transferTasksModel = require('../models/transferTasks');
const ticketsModel = require('../models/tickets');
const partnersModel = require('../models/partners');
const eventBus = require('../utils/eventBus');
const { notificationsModel, NotificationTypes } = require('../models/notifications');
const batteriesModel = require('../models/batteries');
const warehousesModel = require('../models/warehouses');
const { agentActions } = require('../services/ai/agent');

// Helper: Calculate distance between two points in km (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * GET /forecast/:stationId
 * Get demand forecast for a station using time series analysis
 */
router.get('/forecast/:stationId', async (req, res) => {
    try {
        const { stationId } = req.params;
        const days = parseInt(req.query.days) || 30;

        const forecast = await forecastingService.predictDemand(stationId, days);
        res.json({ success: true, data: forecast });
    } catch (error) {
        console.error('Error getting forecast:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /swap-history/:stationId
 * Get swap history for a station
 */
router.get('/swap-history/:stationId', async (req, res) => {
    try {
        const { stationId } = req.params;
        const days = parseInt(req.query.days) || 30;

        const history = await dailySwapHistoryModel.getHistory(stationId, days);
        const stats = await dailySwapHistoryModel.getStats(stationId, days);
        const hourlyPattern = await dailySwapHistoryModel.getHourlyPattern(stationId, 14);

        res.json({
            success: true,
            data: {
                history,
                stats,
                hourlyPattern
            }
        });
    } catch (error) {
        console.error('Error getting swap history:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /swap-history/backfill
 * Backfill swap history from existing partner data
 */
router.post('/swap-history/backfill', async (req, res) => {
    try {
        await dailySwapHistoryModel.backfillFromPartners();
        res.json({ success: true, message: 'Backfill completed' });
    } catch (error) {
        console.error('Error backfilling swap history:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /rebalance/check
 * Check if a station needs rebalancing and trigger if needed
 */
router.post('/rebalance/check', async (req, res) => {
    try {
        const { stationId } = req.body;
        if (!stationId) {
            return res.status(400).json({ success: false, error: 'stationId required' });
        }

        const result = await inventoryRebalancer.processStation(stationId);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Error checking rebalancing:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /rebalance/status
 * Get rebalancing status for all stations
 */
router.get('/rebalance/status', async (req, res) => {
    try {
        const result = await inventoryRebalancer.checkAllStations();
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Error getting rebalancing status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /agent/rebalance-plan
 * Get autonomous rebalancing recommendations
 */
router.get('/agent/rebalance-plan', async (req, res) => {
    try {
        const plan = await balancingAgent.getRebalancingPlan();
        res.json({ success: true, data: plan });
    } catch (error) {
        console.error('Error generating plan:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /run
 * Phase A + B: Detect and Resolve
 */
router.post('/run', async (req, res) => {
    try {
        const result = await logisticsAgent.runProtocol();
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Error running agent:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /tickets/scan
 * Detect deficits and raise tickets
 */
router.post('/tickets/scan', async (req, res) => {
    try {
        const count = await logisticsAgent.detectDeficits();
        res.json({ success: true, ticketsRaised: count });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * GET /tickets
 * Get open tickets
 */
router.get('/tickets', async (req, res) => {
    try {
        const tickets = await ticketsModel.getOpen();
        res.json({ success: true, data: tickets });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * POST /debug/spike
 * Simulate a demand spike
 */
router.post('/debug/spike', async (req, res) => {
    try {
        // Pick a random station to "sabotage"
        const partners = await partnersModel.getAll();
        const active = partners.filter(p => p.is_active_dsk);
        const victim = active[Math.floor(Math.random() * active.length)];

        // 1. Drain battery to 1
        await partnersModel.updateMetrics(victim.id, {
            total_batteries: 10,
            fully_charged_batteries: 1
        });

        // 2. Spike demand to 50
        await partnersModel.updateDemand(victim.id, 50);

        res.json({ success: true, message: `Simulated Critical Spike at ${victim.id}`, station: victim.id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * GET /tasks
 * Get list of tasks
 */
router.get('/tasks', async (req, res) => {
    try {
        const tasks = await transferTasksModel.getAll();
        res.json({ success: true, data: tasks });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /tasks/:id/complete
 * Mark task as completed (Simulate delivery)
 */
router.post('/tasks/:id/complete', async (req, res) => {
    try {
        const result = await logisticsAgent.completeTask(req.params.id);
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /tasks/:id/approve
 * Approve a pending transfer task (Only source/sender approves)
 */
router.post('/tasks/:id/approve', async (req, res) => {
    try {
        const { approverId, notes } = req.body;
        const taskId = req.params.id;

        // Get task details before updating
        const tasks = await transferTasksModel.getAll();
        const task = tasks.find(t => String(t.id) === String(taskId));

        if (!task) {
            return res.status(404).json({ success: false, error: 'Task not found' });
        }

        // Update task status to IN_PROGRESS
        const result = await transferTasksModel.updateStatus(taskId, 'approved', {
            approvedBy: approverId,
            approvedAt: new Date().toISOString(),
            notes: notes
        });

        // Notify the receiving station that batteries are on the way
        const distanceKm = task.distance_km ? parseFloat(task.distance_km) : 0;
        await notificationsModel.create({
            recipientType: task.target_type === 'WAREHOUSE' ? 'WAREHOUSE' : 'PARTNER',
            recipientId: task.target_id,
            type: NotificationTypes.TRANSFER_APPROVED || 'TRANSFER_APPROVED',
            title: '✅ Transfer Approved - Batteries On The Way!',
            message: `Good news! ${task.amount} batteries have been approved and are now being dispatched from ${task.source_type === 'WAREHOUSE' ? 'Warehouse' : 'Partner'} ${task.source_id}!\n\n🚚 Status: IN TRANSIT\n⏱️ ETA: 30-60 minutes\n📍 Distance: ${distanceKm.toFixed(1)} km`,
            data: {
                taskId: task.id,
                sourceId: task.source_id,
                sourceType: task.source_type,
                quantity: task.amount,
                status: 'IN_PROGRESS',
                approvedBy: approverId
            }
        });

        console.log(`[Logistics] Task ${taskId} approved by ${approverId} - batteries in transit to ${task.target_id}`);

        res.json({ success: true, message: 'Transfer approved - batteries dispatched', data: result });
    } catch (error) {
        console.error('Error approving transfer:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /tasks/:id/reject
 * Reject a pending transfer task (Source rejects the request)
 * Automatically triggers search for alternative source
 */
router.post('/tasks/:id/reject', async (req, res) => {
    try {
        const { rejectedBy, reason } = req.body;
        const taskId = req.params.id;

        // Get task details before updating
        const tasks = await transferTasksModel.getAll();
        const task = tasks.find(t => String(t.id) === String(taskId));

        if (!task) {
            return res.status(404).json({ success: false, error: 'Task not found' });
        }

        // Parse financials to get urgency and reason
        let financials = {};
        try {
            financials = typeof task.financials === 'string' ? JSON.parse(task.financials) : (task.financials || {});
        } catch (e) {
            financials = {};
        }

        // Update task status
        const result = await transferTasksModel.updateStatus(taskId, 'rejected', {
            rejectedBy: rejectedBy,
            rejectedAt: new Date().toISOString(),
            reason: reason
        });

        console.log(`[Logistics] Task ${taskId} rejected by ${rejectedBy} - reason: ${reason}`);

        // Trigger automatic search for alternative source
        let retryResult = null;
        if (financials.rebalancing && financials.autoGenerated) {
            console.log(`[Logistics] Auto-generated task rejected - searching for alternative source...`);

            try {
                retryResult = await inventoryRebalancer.handleRejectionAndRetry(
                    taskId,
                    task.source_id,
                    task.target_id,
                    task.amount,
                    financials.urgency || 'URGENT',
                    financials.reason || 'Low inventory'
                );

                if (retryResult.success) {
                    console.log(`[Logistics] Alternative source found: Task ${retryResult.newTaskId} created`);
                } else {
                    console.log(`[Logistics] No alternative source available`);
                }
            } catch (retryError) {
                console.error('[Logistics] Error finding alternative:', retryError.message);
            }
        } else {
            // Manual task - just notify receiver
            await notificationsModel.create({
                recipientType: task.target_type === 'WAREHOUSE' ? 'WAREHOUSE' : 'PARTNER',
                recipientId: task.target_id,
                type: NotificationTypes.TRANSFER_REJECTED || 'TRANSFER_REJECTED',
                title: '❌ Transfer Request Declined',
                message: `${task.source_id} was unable to fulfill your request for ${task.amount} batteries.\n\n📝 Reason: ${reason || 'No reason provided'}`,
                data: {
                    taskId: task.id,
                    sourceId: task.source_id,
                    quantity: task.amount,
                    status: 'REJECTED',
                    rejectedBy: rejectedBy,
                    reason: reason
                }
            });
        }

        res.json({
            success: true,
            message: 'Transfer rejected',
            data: result,
            alternativeSource: retryResult
        });
    } catch (error) {
        console.error('Error rejecting transfer:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /battery/:id/fault
 * Trigger a fault on a battery and request replacement from nearest warehouse
 */
router.post('/battery/:id/fault', async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        console.log(`[Logistics] Triggering fault for battery ${id}`);

        // 1. Get battery details to find location
        const battery = await batteriesModel.getById(id);
        if (!battery) {
            return res.status(404).json({ success: false, error: 'Battery not found' });
        }

        // We need the location. If it's at a station (Partner), we use that.
        // If it's with a driver, we might use their last location (but replacement usually happens at a station).
        // For simplicity, handle STATION location primarily.
        let sourceLat, sourceLon, sourceId, sourceType;

        if (battery.current_station_id) {
            sourceId = battery.current_station_id;
            sourceType = 'PARTNER'; // Assuming almost all stations are partners for now
            // Get partner location
            const partner = await partnersModel.getById(sourceId);
            if (partner) {
                sourceLat = partner.latitude;
                sourceLon = partner.longitude;
            }
        } else if (battery.current_driver_id) {
            // If with driver, we use battery's last known location or driver's
            sourceId = battery.current_driver_id;
            sourceType = 'DRIVER';
            sourceLat = battery.last_lat;
            sourceLon = battery.last_lon;
        }

        if (!sourceLat || !sourceLon) {
            // Fallback: If we can't determine location, we can't find nearest warehouse easily.
            // But we might default to a central warehouse or error out.
            // Let's try to get ANY warehouse if location is missing (edge case)
            sourceLat = 0;
            sourceLon = 0;
        }

        // 2. Mark battery as faulty
        await batteriesModel.updateHealth(id, {
            healthStatus: 'Faulty',
            soh: battery.soh > 50 ? 50 : battery.soh // Degrade SOH if it was high
        });

        // Also update status to trigger UI changes if needed
        // await batteriesModel.updateStatus(id, 'MAINTENANCE_REQUIRED', sourceType === 'PARTNER' ? 'STATION' : 'DRIVER', sourceId);

        // 3. Find nearest warehouse
        const warehouses = await warehousesModel.getAll();
        let nearestWarehouse = null;
        let minDistance = Infinity;

        for (const wh of warehouses) {
            const dist = calculateDistance(sourceLat, sourceLon, wh.latitude, wh.longitude);
            if (dist < minDistance) {
                minDistance = dist;
                nearestWarehouse = wh;
            }
        }

        if (!nearestWarehouse) {
            return res.status(500).json({ success: false, error: 'No warehouses available for replacement' });
        }

        console.log(`[Logistics] Nearest warehouse to ${sourceType} ${sourceId} is ${nearestWarehouse.name} (${minDistance.toFixed(1)}km)`);

        // 4. Create Replacement Task
        // Task: Warehouse -> Partner (Replacement Battery)
        // AND/OR Partner -> Warehouse (Faulty Battery)
        // Usually, the warehouse sends a replacement.

        const task = await transferTasksModel.create({
            type: 'WAREHOUSE_DISPATCH', // dispatch replacement
            status: 'PENDING',
            source_id: nearestWarehouse.id,
            source_type: 'WAREHOUSE',
            target_id: sourceId || 'UNKNOWN', // If driver, might be tricky, but assuming station for now
            target_type: sourceType,
            amount: 1,
            distance_km: minDistance,
            financials: JSON.stringify({
                reason: reason || 'Battery Fault - Replacement Required',
                urgency: 'CRITICAL',
                faultyBatteryId: id,
                autoGenerated: true,
                createdAt: new Date().toISOString()
            })
        });

        // 5. Notify Warehouse (Source) - Pending List
        await notificationsModel.create({
            recipientType: 'WAREHOUSE',
            recipientId: nearestWarehouse.id,
            type: NotificationTypes.TRANSFER_REQUEST, // Or similar
            title: '🚨 FAULT REPORT: Replacement Required',
            message: `Battery ${id} reported faulty at ${sourceType} ${sourceId}. \n\nPLEASE DISPATCH REPLACEMENT IMMEDIATELEY.\n\n📍 Destination: ${sourceType} ${sourceId} (${minDistance.toFixed(1)}km)`,
            data: {
                taskId: task.id,
                faultyBatteryId: id,
                targetId: sourceId,
                urgency: 'CRITICAL',
                action: 'DISPATCH_REPLACEMENT'
            }
        });

        // 6. Notify Partner (Target)
        if (sourceType === 'PARTNER') {
            await notificationsModel.create({
                recipientType: 'PARTNER',
                recipientId: sourceId,
                type: NotificationTypes.SYSTEM_ALERT,
                title: '⚠️ Battery Marked Faulty',
                message: `Battery ${id} has been marked as faulty. A replacement request has been sent to ${nearestWarehouse.name}.`,
                data: {
                    batteryId: id,
                    replacementTaskId: task.id,
                    warehouseId: nearestWarehouse.id
                }
            });
        }

        res.json({
            success: true,
            message: 'Fault reported and replacement requested',
            taskId: task.id,
            source: nearestWarehouse.name,
            distance: minDistance
        });

    } catch (error) {
        console.error('Error triggering battery fault:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ CONGESTION DETECTION ENDPOINTS ============

/**
 * GET /congestion
 * Detect congestion at all stations based on driver battery locations
 * Only considers batteries IN_USE (with drivers)
 */
router.get('/congestion', async (req, res) => {
    try {
        const congestionReport = await congestionDetector.detectCongestion();
        const currentState = congestionDetector.getCongestionState();

        res.json({
            success: true,
            data: {
                congestedStations: congestionReport,
                stationStates: currentState,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Error detecting congestion:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /congestion/:stationId
 * Check congestion at a specific station
 */
router.get('/congestion/:stationId', async (req, res) => {
    try {
        const { stationId } = req.params;
        const congestion = await congestionDetector.checkStation(stationId);

        if (!congestion) {
            return res.status(404).json({ success: false, error: 'Station not found' });
        }

        res.json({ success: true, data: congestion });
    } catch (error) {
        console.error('Error checking station congestion:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /swap-event
 * Emit a swap event (called by driver app after swap)
 * This triggers event-driven rebalancing check
 */
router.post('/swap-event', async (req, res) => {
    try {
        const { stationId, driverId, oldBatteryId, newBatteryId, oldBatterySoc, newBatterySoc } = req.body;

        if (!stationId || !driverId) {
            return res.status(400).json({ success: false, error: 'stationId and driverId required' });
        }

        // Emit the swap event - this triggers rebalancing and congestion checks
        eventBus.emit(eventBus.EVENTS.BATTERY_SWAP_COMPLETED, {
            stationId,
            driverId,
            oldBatteryId,
            newBatteryId,
            oldBatterySoc: oldBatterySoc || 0,
            newBatterySoc: newBatterySoc || 100,
            timestamp: new Date().toISOString()
        });

        res.json({
            success: true,
            message: 'Swap event emitted - rebalancing check triggered',
            data: { stationId, driverId }
        });
    } catch (error) {
        console.error('Error emitting swap event:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /driver-locations
 * Update driver locations in batch (from mobile app GPS)
 * This triggers congestion detection
 */
router.post('/driver-locations', async (req, res) => {
    try {
        const { drivers } = req.body;

        if (!drivers || !Array.isArray(drivers)) {
            return res.status(400).json({ success: false, error: 'drivers array required' });
        }

        // Emit batch location update event
        eventBus.emit(eventBus.EVENTS.DRIVERS_BATCH_LOCATION_UPDATE, {
            drivers,
            timestamp: new Date().toISOString()
        });

        res.json({
            success: true,
            message: 'Driver locations updated - congestion detection triggered',
            driversUpdated: drivers.length
        });
    } catch (error) {
        console.error('Error updating driver locations:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /transfers/request
 * Request a transfer from a specific source (e.g. Warehouse 4)
 * Sets status to PENDING_SENDER_APPROVAL
 */
router.post('/transfers/request', async (req, res) => {
    try {
        const { sourceId, targetId, amount, type, reason, sourceType } = req.body;

        if (!sourceId || !targetId || !amount) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        // 1. Get locations for distance calculation
        let sourceLat = 0, sourceLon = 0;
        let targetLat = 0, targetLon = 0;

        // Get Source Location
        if (sourceType === 'WAREHOUSE') {
            // Need to fetch warehouse location. 
            // Since we don't have a direct getById for warehouse in this scope easily without importing model again effectively or using existing list
            // actually we can use warehousesModel imported at top
            const warehouses = await warehousesModel.getAll();
            const warehouse = warehouses.find(w => String(w.id) === String(sourceId) || w.name.includes(sourceId));
            if (warehouse) {
                sourceLat = warehouse.latitude;
                sourceLon = warehouse.longitude;
            }
        } else {
            // Partner
            const partner = await partnersModel.getById(sourceId);
            if (partner) {
                sourceLat = partner.latitude;
                sourceLon = partner.longitude;
            }
        }

        // Get Target Location (Assuming Partner for now as per requirements usually)
        const partner = await partnersModel.getById(targetId);
        if (partner) {
            targetLat = partner.latitude;
            targetLon = partner.longitude;
        }

        const distance = calculateDistance(sourceLat, sourceLon, targetLat, targetLon);

        // 2. Create Task
        const task = await transferTasksModel.create({
            type: type || 'WAREHOUSE_DISPATCH',
            status: 'PENDING_SENDER_APPROVAL',
            source_id: sourceId,
            source_type: sourceType || 'WAREHOUSE',
            target_id: targetId,
            target_type: 'PARTNER',
            amount: amount,
            distance_km: distance,
            financials: JSON.stringify({
                reason: reason || 'Manual Request',
                requestedAt: new Date().toISOString(),
                urgency: 'HIGH'
            })
        });

        console.log(`[Logistics] Transfer requested from ${sourceType} ${sourceId} to Partner ${targetId}. Status: PENDING_SENDER_APPROVAL`);

        // 3. Notify Source (Warehouse or Partner) - This is the sender who needs to approve
        const recipientType = (sourceType === 'WAREHOUSE') ? 'WAREHOUSE' : 'PARTNER';
        const notificationType = (sourceType === 'WAREHOUSE') ? NotificationTypes.DISPATCH_REQUEST : NotificationTypes.TRANSFER_REQUEST;
        
        await notificationsModel.create({
            recipientType: recipientType,
            recipientId: sourceId,
            type: notificationType,
            title: sourceType === 'WAREHOUSE' ? '📦 Battery Dispatch Request' : '🔄 Transfer Request Received',
            message: `Partner ${targetId} is requesting ${amount} batteries.\n\n📍 Distance: ${distance.toFixed(1)} km\n📝 Reason: ${reason || 'Manual Request'}\n\n⏳ Please review and approve/reject this request.`,
            data: {
                taskId: task.id,
                targetId: targetId,
                quantity: amount,
                distance: distance,
                reason: reason || 'Manual Request',
                action: 'APPROVE_TRANSFER'
            }
        });

        // 4. Notify Requester (Target Partner) that request is pending
        await notificationsModel.create({
            recipientType: 'PARTNER',
            recipientId: targetId,
            type: NotificationTypes.TRANSFER_REQUEST,
            title: '📋 Battery Request Submitted',
            message: `Your request for ${amount} batteries from ${sourceType === 'WAREHOUSE' ? 'Warehouse' : 'Partner'} ${sourceId} has been submitted.\n\n⏳ Status: Waiting for sender approval`,
            data: {
                taskId: task.id,
                sourceId: sourceId,
                sourceType: sourceType || 'WAREHOUSE',
                quantity: amount,
                status: 'PENDING_SENDER_APPROVAL'
            }
        });

        res.json({ success: true, message: 'Transfer requested, awaiting sender approval', data: task });
    } catch (error) {
        console.error('Error creating transfer request:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /agent/process-approvals
 * Trigger AI Agent to review PENDING_SENDER_APPROVAL tasks
 */
router.post('/agent/process-approvals', async (req, res) => {
    try {
        console.log('[Logistics] Triggering AI Agent for pending approvals...');

        // This requires updating agent.js to export a method or adding it to local available actions
        // We will assume agent.js/agentActions has 'approvePendingTransfers'

        if (!agentActions.approvePendingTransfers) {
            // If not yet implemented in agentActions, we can try to use general processRequest
            // But better to implement it. For now, let's try generic calling if specific not found
            return res.status(501).json({ success: false, error: 'Agent action not implemented yet' });
        }

        const result = await agentActions.approvePendingTransfers();
        res.json({ success: true, result });
    } catch (error) {
        console.error('Error processing approvals:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /agent/clear-history
 * Clear AI Agent chat history
 */
router.post('/agent/clear-history', async (req, res) => {
    try {
        const { sessionId } = req.body;
        // In this project agentActions.clearHistory is just clearHistory
        // But I exported it as clearHistory in agent.js.
        // Wait, I should check the import.
        const { clearHistory } = require('../services/ai/agent');
        await clearHistory(sessionId || 'system');
        res.json({ success: true, message: 'History cleared' });
    } catch (error) {
        console.error('Error clearing history:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
