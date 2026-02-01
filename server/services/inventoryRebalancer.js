/**
 * Inventory Auto-Rebalancer Service
 * Automatically triggers rebalancing based on time series analysis and demand forecasting
 * 
 * Key assumptions:
 * - Battery charging: 6 hours from 0% to 100% (16.67% per hour)
 * - A battery is "available" for swap if SOC >= 80%
 * - Rebalancing triggered if forecasted demand exceeds available capacity
 * 
 * Rebalancing Sources:
 * - URGENT (no batteries or shortage within 8 hours): Request from nearby PARTNERS
 * - PLANNED (forecasted spike in 1-2 days): Request from WAREHOUSE
 */

const forecastingService = require('./forecastingService');
const { notificationsModel, NotificationTypes } = require('../models/notifications');
const partnersModel = require('../models/partners');
const transferTasksModel = require('../models/transferTasks');
const { query } = require('../config/database');

// Configuration
const CONFIG = {
    CHARGE_TIME_HOURS: 6,               // 6 hours from 0% to 100%
    CHARGE_RATE_PER_HOUR: 100 / 6,      // ~16.67% per hour
    READY_SOC_THRESHOLD: 80,            // Battery ready for swap at 80%+
    FORECAST_HOURS: 8,                  // Look ahead 8 hours for immediate demand
    FORECAST_DAYS: 2,                   // Look ahead 2 days for warehouse planning
    MIN_CONFIDENCE: 30,                 // Minimum forecast confidence to act
    SAFETY_BUFFER: 1.2,                 // 20% safety buffer on demand
    CHECK_INTERVAL_MS: 10 * 60 * 1000,  // Check every 10 minutes
    COOLDOWN_MS: 30 * 60 * 1000,        // Don't re-trigger same station for 30 minutes
    CRITICAL_THRESHOLD: 2,              // If <= 2 batteries available, it's critical
    SPIKE_THRESHOLD: 1.5,               // 50% increase from average = spike
};

// Track recently triggered stations
const recentlyTriggered = new Map();

// AI Agent reference (set by subscriber)
let aiAgentCallback = null;

const inventoryRebalancer = {
    /**
     * Set callback for AI agent integration
     */
    setAIAgentCallback: (callback) => {
        aiAgentCallback = callback;
        console.log('[Rebalancer] AI Agent callback registered');
    },

    /**
     * Calculate hours until a battery reaches 80% SOC
     */
    hoursToReady: (currentSoc) => {
        if (currentSoc >= CONFIG.READY_SOC_THRESHOLD) return 0;
        const socNeeded = CONFIG.READY_SOC_THRESHOLD - currentSoc;
        return socNeeded / CONFIG.CHARGE_RATE_PER_HOUR;
    },

    /**
     * Get current battery inventory with SOC levels
     * Status values: IDLE (available at station), CHARGING, IN_USE
     */
    getBatteryInventory: async (stationId) => {
        try {
            // Get IDLE and CHARGING batteries at this station (both are available for swaps)
            const res = await query(`
                SELECT id, soc, status, updated_at
                FROM batteries
                WHERE current_station_id = $1
                  AND status IN ('IDLE', 'CHARGING')
                ORDER BY soc DESC
            `, [stationId]);
            
            return res.rows.map(row => ({
                id: row.id,
                soc: parseFloat(row.soc) || 0,
                status: row.status,
                updatedAt: row.updated_at
            }));
        } catch (error) {
            console.error('[Rebalancer] Error getting battery inventory:', error.message);
            return [];
        }
    },

    /**
     * Project how many batteries will be ready at each hour
     */
    projectAvailability: (batteries, hoursAhead = 8) => {
        const readyNow = batteries.filter(b => b.soc >= CONFIG.READY_SOC_THRESHOLD).length;
        
        const projections = [];
        for (let hour = 1; hour <= hoursAhead; hour++) {
            const readyByHour = batteries.filter(b => {
                const hoursNeeded = inventoryRebalancer.hoursToReady(b.soc);
                return hoursNeeded <= hour;
            }).length;
            projections.push({ hour, readyCount: readyByHour });
        }
        
        return {
            readyNow,
            projections,
            totalBatteries: batteries.length
        };
    },

    /**
     * Analyze station using time series forecasting
     * Returns urgency level and recommended action
     */
    analyzeStation: async (stationId) => {
        const partner = await partnersModel.getById(stationId);
        if (!partner) {
            return { needsRebalancing: false, reason: 'Station not found' };
        }

        // Get current inventory
        const batteries = await inventoryRebalancer.getBatteryInventory(stationId);
        const availability = inventoryRebalancer.projectAvailability(batteries, CONFIG.FORECAST_HOURS);
        
        // Get time series forecast
        const forecast = await forecastingService.predictDemand(stationId, 30);
        const hourlyForecast = await forecastingService.predictHourlyDemand(stationId, CONFIG.FORECAST_HOURS);
        
        // Calculate 8-hour demand with safety buffer
        const demandIn8Hours = Math.ceil(hourlyForecast.totalDemand * CONFIG.SAFETY_BUFFER);
        const hourlyDemand = demandIn8Hours / CONFIG.FORECAST_HOURS;
        
        // Calculate 2-day demand for spike detection
        const dailyAvg = forecast.stats?.avgDaily || forecast.dailyForecast;
        const forecastedDaily = forecast.dailyForecast;
        const isSpike = forecastedDaily > dailyAvg * CONFIG.SPIKE_THRESHOLD;
        const trend = forecast.trend;
        
        // Simulate hour-by-hour availability vs demand
        let hoursUntilShortage = null;
        let cumulativeDemand = 0;
        
        for (let hour = 1; hour <= CONFIG.FORECAST_HOURS; hour++) {
            cumulativeDemand += hourlyDemand;
            const projection = availability.projections.find(p => p.hour === hour);
            const availableByHour = projection?.readyCount || availability.readyNow;
            
            if (cumulativeDemand > availableByHour) {
                hoursUntilShortage = hour;
                break;
            }
        }
        
        // Calculate deficit
        const maxAvailableIn8Hours = availability.projections[CONFIG.FORECAST_HOURS - 1]?.readyCount || availability.readyNow;
        let deficit = demandIn8Hours - maxAvailableIn8Hours;
        
        // Determine urgency level
        let urgency = 'NONE';
        let source = null;
        let reason = 'Inventory sufficient';
        
        if (availability.readyNow === 0) {
            // CRITICAL: No batteries available right now
            urgency = 'CRITICAL';
            source = 'PARTNER';
            reason = 'No charged batteries available - immediate rebalancing required';
            // Ensure minimum deficit of 3 batteries when critical (station needs stock)
            deficit = Math.max(deficit, 3);
        } else if (availability.readyNow <= CONFIG.CRITICAL_THRESHOLD && deficit > 0) {
            // URGENT: Very low stock and expecting shortage
            urgency = 'URGENT';
            source = 'PARTNER';
            reason = `Only ${availability.readyNow} batteries available, shortage in ~${hoursUntilShortage || '?'}h`;
        } else if (deficit > 0 && hoursUntilShortage && hoursUntilShortage <= 4) {
            // HIGH: Shortage expected within 4 hours
            urgency = 'HIGH';
            source = 'PARTNER';
            reason = `Charging won't keep up: need ${demandIn8Hours} in ${CONFIG.FORECAST_HOURS}h, will have ${maxAvailableIn8Hours}`;
        } else if (isSpike && trend > 0.3) {
            // PLANNED: Forecasted spike in coming days
            urgency = 'PLANNED';
            source = 'WAREHOUSE';
            reason = `Demand spike forecasted: ${forecastedDaily.toFixed(1)}/day vs ${dailyAvg.toFixed(1)} average (trend: +${(trend * 100).toFixed(0)}%)`;
        } else if (deficit > 0 && forecast.confidence >= CONFIG.MIN_CONFIDENCE) {
            // MODERATE: Some shortage expected
            urgency = 'MODERATE';
            source = 'PARTNER';
            reason = `Projected deficit of ${deficit} batteries in ${CONFIG.FORECAST_HOURS} hours`;
        }
        
        const needsRebalancing = urgency !== 'NONE';
        
        return {
            needsRebalancing,
            stationId,
            stationName: `Station ${stationId}`,
            urgency,
            source,
            readyNow: availability.readyNow,
            totalBatteries: availability.totalBatteries,
            projectedAvailableIn8Hours: maxAvailableIn8Hours,
            forecastedDemandIn8Hours: demandIn8Hours,
            dailyForecast: Math.ceil(forecastedDaily),
            dailyAverage: Math.ceil(dailyAvg),
            forecastConfidence: forecast.confidence,
            forecastTrend: trend > 0.1 ? 'increasing' : trend < -0.1 ? 'decreasing' : 'stable',
            forecastMethod: forecast.method,
            isSpike,
            peakHour: forecast.peakHour,
            deficit: Math.max(0, Math.ceil(deficit)),
            hoursUntilShortage,
            chargingProjections: availability.projections,
            stats: forecast.stats,
            reason
        };
    },

    /**
     * Find best partner source for urgent transfers
     */
    findPartnerSource: async (targetStationId, quantityNeeded) => {
        const partners = await partnersModel.getActive();
        const candidates = [];
        
        for (const partner of partners) {
            if (partner.id === targetStationId) continue;
            
            // Check their forecast to avoid taking from stations that need batteries
            const theirForecast = await forecastingService.predictHourlyDemand(partner.id, CONFIG.FORECAST_HOURS);
            const theirBatteries = await inventoryRebalancer.getBatteryInventory(partner.id);
            const readyBatteries = theirBatteries.filter(b => b.soc >= CONFIG.READY_SOC_THRESHOLD);
            
            // Only take from stations with surplus after meeting their own demand
            const theirDemand = Math.ceil(theirForecast.totalDemand * CONFIG.SAFETY_BUFFER);
            const surplus = readyBatteries.length - theirDemand - 3; // Keep 3 buffer
            
            if (surplus > 0) {
                candidates.push({
                    stationId: partner.id,
                    stationName: `Station ${partner.id}`,
                    isWarehouse: false,
                    surplusBatteries: surplus,
                    readyBatteries: readyBatteries.length,
                    theirDemand,
                    canProvide: Math.min(surplus, quantityNeeded),
                    latitude: partner.latitude,
                    longitude: partner.longitude
                });
            }
        }
        
        // Sort by surplus (most surplus first)
        candidates.sort((a, b) => b.surplusBatteries - a.surplusBatteries);
        
        return candidates;
    },

    /**
     * Find warehouse source for planned transfers
     */
    findWarehouseSource: async (quantityNeeded) => {
        try {
            const warehouses = await query(`
                SELECT id, name, latitude, longitude, charged_batteries, uncharged_batteries
                FROM warehouses 
                WHERE charged_batteries > 5
                ORDER BY charged_batteries DESC
            `);
            
            return warehouses.rows.map(wh => ({
                stationId: wh.id,
                stationName: wh.name || `Warehouse ${wh.id}`,
                isWarehouse: true,
                surplusBatteries: (wh.charged_batteries || 0) - 5,
                readyBatteries: wh.charged_batteries || 0,
                canProvide: Math.min((wh.charged_batteries || 0) - 5, quantityNeeded),
                latitude: wh.latitude,
                longitude: wh.longitude
            })).filter(w => w.surplusBatteries > 0);
        } catch (e) {
            console.log('[Rebalancer] Warehouses not available:', e.message);
            return [];
        }
    },

    /**
     * Create transfer task for rebalancing
     * AI Agent auto-approves all rebalancing tasks - no manual approval needed
     */
    createTransferTask: async (sourceId, targetId, quantity, reason, urgency, isWarehouse = false, sourceData = null) => {
        try {
            // Use appropriate task type based on source
            // P2P_TRANSFER: Partner to Partner
            // WAREHOUSE_DISPATCH: Warehouse to Partner
            const taskType = isWarehouse ? 'WAREHOUSE_DISPATCH' : 'P2P_TRANSFER';
            
            // AI Agent auto-approves ALL rebalancing tasks
            // The agent has already verified the source has sufficient inventory
            let autoApproveReason = '';
            
            if (isWarehouse) {
                autoApproveReason = 'Warehouse - AI Agent auto-approved';
            } else if (sourceData) {
                autoApproveReason = `AI Agent approved: Source has ${sourceData.surplusBatteries} surplus batteries`;
            } else {
                autoApproveReason = 'AI Agent auto-approved for rebalancing';
            }
            
            // Always IN_PROGRESS since AI Agent handles all approvals
            const initialStatus = 'IN_PROGRESS';
            
            const task = await transferTasksModel.create({
                type: taskType,
                status: initialStatus,
                source_id: sourceId,
                source_type: isWarehouse ? 'WAREHOUSE' : 'PARTNER',
                target_id: targetId,
                target_type: 'PARTNER',
                amount: quantity,
                distance_km: 0,
                financials: JSON.stringify({ 
                    reason, 
                    urgency,
                    rebalancing: true,
                    autoGenerated: true,
                    autoApproved: true,
                    autoApproveReason: autoApproveReason,
                    managedByAgent: true,
                    createdAt: new Date().toISOString() 
                })
            });
            
            task.autoApproved = true;
            task.autoApproveReason = autoApproveReason;
            
            console.log(`[Rebalancer] Task ${task.id} created - AI AGENT AUTO-APPROVED`);
            
            return task;
        } catch (error) {
            console.error('[Rebalancer] Error creating transfer task:', error);
            throw error;
        }
    },

    /**
     * Find alternative source when primary source rejects
     */
    findAlternativeSource: async (targetStationId, quantityNeeded, excludeSourceIds = []) => {
        console.log(`[Rebalancer] Finding alternative source for ${targetStationId}, excluding: ${excludeSourceIds.join(', ')}`);
        
        // First try partners
        const partnerSources = await inventoryRebalancer.findPartnerSource(targetStationId, quantityNeeded);
        const validPartners = partnerSources.filter(p => !excludeSourceIds.includes(p.stationId));
        
        if (validPartners.length > 0) {
            return { source: validPartners[0], sources: validPartners };
        }
        
        // Then try warehouses
        const warehouseSources = await inventoryRebalancer.findWarehouseSource(quantityNeeded);
        const validWarehouses = warehouseSources.filter(w => !excludeSourceIds.includes(w.stationId));
        
        if (validWarehouses.length > 0) {
            return { source: validWarehouses[0], sources: validWarehouses };
        }
        
        return { source: null, sources: [] };
    },

    /**
     * Handle rejection and find alternative
     */
    handleRejectionAndRetry: async (taskId, rejectedSourceId, targetStationId, quantityNeeded, urgency, reason) => {
        console.log(`[Rebalancer] Source ${rejectedSourceId} rejected task ${taskId}. Finding alternative...`);
        
        // Find alternative excluding the rejected source
        const { source: alternative, sources } = await inventoryRebalancer.findAlternativeSource(
            targetStationId, 
            quantityNeeded, 
            [rejectedSourceId]
        );
        
        if (!alternative) {
            console.log('[Rebalancer] No alternative sources available');
            await notificationsModel.create({
                recipientType: 'PARTNER',
                recipientId: targetStationId,
                type: NotificationTypes.INVENTORY_CRITICAL,
                title: '⚠️ No Alternative Sources',
                message: `Unable to find alternative source for ${quantityNeeded} batteries after ${rejectedSourceId} declined. Manual intervention may be needed.`,
                data: { originalTaskId: taskId, rejectedBy: rejectedSourceId, quantityNeeded }
            });
            return { success: false, reason: 'No alternative sources available' };
        }
        
        console.log(`[Rebalancer] Found alternative: ${alternative.stationId} (${alternative.isWarehouse ? 'WAREHOUSE' : 'PARTNER'})`);
        
        // Create new task with alternative source
        const transferQuantity = Math.min(alternative.canProvide, quantityNeeded);
        const newTask = await inventoryRebalancer.createTransferTask(
            alternative.stationId,
            targetStationId,
            transferQuantity,
            reason,
            urgency,
            alternative.isWarehouse,
            alternative
        );
        
        const urgencyEmoji = urgency === 'CRITICAL' ? '🚨' : urgency === 'URGENT' ? '⚡' : '📦';
        const sourceType = alternative.isWarehouse ? 'Warehouse' : 'Partner Station';
        
        // Notify target about the alternative - AI Agent already approved
        await notificationsModel.create({
            recipientType: 'PARTNER',
            recipientId: targetStationId,
            type: NotificationTypes.TRANSFER_REQUEST,
            title: `${urgencyEmoji} Alternative Source Found`,
            message: `${rejectedSourceId} declined. AI Agent found alternative: ${alternative.stationName} (${sourceType})\n\n🔋 Quantity: ${transferQuantity} batteries\n✅ Auto-approved and dispatched by AI Agent!`,
            data: {
                taskId: newTask.id,
                previousTaskId: taskId,
                sourceId: alternative.stationId,
                sourceName: alternative.stationName,
                quantity: transferQuantity,
                autoApproved: true,
                managedByAgent: true
            }
        });
        
        // Notify source about auto-approved task - goes directly to delivery list
        await notificationsModel.create({
            recipientType: alternative.isWarehouse ? 'WAREHOUSE' : 'PARTNER',
            recipientId: alternative.stationId,
            type: NotificationTypes.TRANSFER_REQUEST,
            title: `📦 Task Assigned: Deliver ${transferQuantity} Batteries`,
            message: `AI Agent assigned transfer task.\n\n📍 Destination: Station ${targetStationId}\n🔋 Quantity: ${transferQuantity} batteries\n⏱️ Priority: ${urgency}\n📝 Reason: ${newTask.autoApproveReason}\n\n✅ Check your Deliveries tab to complete this task.`,
            data: {
                taskId: newTask.id,
                targetId: targetStationId,
                quantity: transferQuantity,
                urgency,
                autoApproved: true,
                action: 'DELIVERY_REQUIRED',
                managedByAgent: true
            }
        });
        
        return {
            success: true,
            newTaskId: newTask.id,
            source: alternative,
            autoApproved: true,
            otherSources: sources.slice(1)
        };
    },

    /**
     * Execute rebalancing based on analysis
     */
    executeRebalancing: async (analysis) => {
        const { stationId, urgency, source, deficit } = analysis;
        
        // Check cooldown
        const lastTriggered = recentlyTriggered.get(stationId);
        if (lastTriggered && Date.now() - lastTriggered < CONFIG.COOLDOWN_MS) {
            console.log(`[Rebalancer] Station ${stationId} on cooldown`);
            return { success: false, reason: 'On cooldown', analysis };
        }
        
        recentlyTriggered.set(stationId, Date.now());
        
        console.log(`[Rebalancer] Executing ${urgency} rebalancing for ${stationId} from ${source}`);
        
        // Find appropriate source based on urgency
        let sources = [];
        if (source === 'WAREHOUSE') {
            sources = await inventoryRebalancer.findWarehouseSource(deficit);
            // Fallback to partners if no warehouse available
            if (sources.length === 0) {
                console.log('[Rebalancer] No warehouse available, falling back to partners');
                sources = await inventoryRebalancer.findPartnerSource(stationId, deficit);
            }
        } else {
            sources = await inventoryRebalancer.findPartnerSource(stationId, deficit);
            // Fallback to warehouse if no partner available
            if (sources.length === 0) {
                console.log('[Rebalancer] No partner available, falling back to warehouse');
                sources = await inventoryRebalancer.findWarehouseSource(deficit);
            }
        }
        
        if (sources.length === 0) {
            console.log(`[Rebalancer] No sources available for ${stationId}`);
            
            // Notify about shortage with details
            await notificationsModel.create({
                recipientType: 'PARTNER',
                recipientId: stationId,
                type: NotificationTypes.INVENTORY_CRITICAL,
                title: `⚠️ ${urgency} - No Supply Available`,
                message: `Unable to find batteries for transfer. ${analysis.reason}. Current stock: ${analysis.chargedNow || 0} ready, ${analysis.totalBatteries || 0} total. Needed: ${deficit} batteries.`,
                data: {
                    ...analysis,
                    searchedSources: ['warehouses', 'nearby_partners'],
                    failureReason: 'All sources depleted or unavailable'
                }
            });
            
            return { success: false, reason: 'No sources available', analysis };
        }
        
        // Create transfer from best source
        const bestSource = sources[0];
        const transferQuantity = Math.min(bestSource.canProvide, deficit);
        
        // Don't create transfers with 0 batteries
        if (transferQuantity <= 0) {
            console.log(`[Rebalancer] Cannot create transfer: quantity is ${transferQuantity}`);
            return { success: false, reason: 'No batteries available to transfer', analysis };
        }
        
        console.log(`[Rebalancer] Creating ${urgency} transfer: ${transferQuantity} batteries from ${bestSource.stationId} (${bestSource.isWarehouse ? 'WAREHOUSE' : 'PARTNER'}) to ${stationId}`);
        
        // Pass source data for auto-approval logic
        const task = await inventoryRebalancer.createTransferTask(
            bestSource.stationId,
            stationId,
            transferQuantity,
            analysis.reason,
            urgency,
            bestSource.isWarehouse,
            bestSource  // Pass source data for auto-approval decision
        );
        
        // Notify target station - batteries are on the way
        const urgencyEmoji = urgency === 'CRITICAL' ? '🚨' : urgency === 'URGENT' ? '⚡' : '📦';
        const sourceType = bestSource.isWarehouse ? 'Warehouse' : 'Partner Station';
        
        await notificationsModel.create({
            recipientType: 'PARTNER',
            recipientId: stationId,
            type: NotificationTypes.TRANSFER_REQUEST,
            title: `${urgencyEmoji} ${transferQuantity} Batteries Dispatched!`,
            message: `✅ AI Agent has arranged battery delivery!\n\n📍 Source: ${bestSource.stationName} (${sourceType})\n🔋 Quantity: ${transferQuantity} batteries\n📝 Reason: ${task.autoApproveReason}\n\n🚚 Batteries on the way! ETA: 30-60 mins`,
            data: {
                taskId: task.id,
                sourceId: bestSource.stationId,
                sourceName: bestSource.stationName,
                sourceType: sourceType,
                isWarehouse: bestSource.isWarehouse,
                quantity: transferQuantity,
                autoApproved: true,
                urgency,
                currentStock: analysis.chargedNow || 0,
                forecastedDemand: analysis.forecastedDemand,
                estimatedArrival: '30-60 mins',
                status: 'IN_PROGRESS',
                analysis
            }
        });
        
        // Notify source - AI Agent has auto-approved, task is ready for delivery
        await notificationsModel.create({
            recipientType: bestSource.isWarehouse ? 'WAREHOUSE' : 'PARTNER',
            recipientId: bestSource.stationId,
            type: NotificationTypes.TRANSFER_REQUEST,
            title: `📦 Task Assigned: Deliver ${transferQuantity} Batteries`,
            message: `AI Agent has assigned you a delivery task.\n\n📍 Destination: ${analysis.stationName}\n🔋 Quantity: ${transferQuantity} batteries\n📝 Reason: ${task.autoApproveReason}\n⏱️ Priority: ${urgency}\n\n✅ Task added to your delivery list.\n👆 Mark as delivered when complete.`,
            data: {
                taskId: task.id,
                targetId: stationId,
                targetName: analysis.stationName,
                quantity: transferQuantity,
                urgency,
                autoApproved: true,
                action: 'DELIVERY_REQUIRED'
            }
        });
        
        // Call AI agent for complex scenarios
        if (aiAgentCallback && (urgency === 'CRITICAL' || urgency === 'URGENT')) {
            console.log(`[Rebalancer] Invoking AI Agent for ${urgency} situation at ${stationId}`);
            try {
                await aiAgentCallback({
                    action: 'inventory_rebalance',
                    urgency,
                    stationId,
                    analysis,
                    transfer: {
                        taskId: task.id,
                        source: bestSource,
                        quantity: transferQuantity,
                        autoApproved: task.autoApproved
                    }
                });
            } catch (e) {
                console.error('[Rebalancer] AI Agent error:', e.message);
            }
        }
        
        return {
            success: true,
            taskId: task.id,
            urgency,
            source: bestSource,
            quantity: transferQuantity,
            autoApproved: task.autoApproved,
            analysis,
            otherSources: sources.slice(1)
        };
    },

    /**
     * Process a single station
     */
    processStation: async (stationId) => {
        const analysis = await inventoryRebalancer.analyzeStation(stationId);
        
        if (analysis.needsRebalancing) {
            console.log(`[Rebalancer] Station ${stationId} needs ${analysis.urgency} rebalancing: ${analysis.reason}`);
            return await inventoryRebalancer.executeRebalancing(analysis);
        }
        
        return { success: true, needsRebalancing: false, analysis };
    },

    /**
     * Check all active stations
     */
    checkAllStations: async () => {
        console.log('[Rebalancer] Running inventory check using time series analysis...');
        
        const partners = await partnersModel.getActive();
        const results = {
            checked: 0,
            critical: 0,
            urgent: 0,
            planned: 0,
            ok: 0,
            details: []
        };

        for (const partner of partners) {
            results.checked++;
            const result = await inventoryRebalancer.processStation(partner.id);
            
            if (result.analysis?.urgency === 'CRITICAL') results.critical++;
            else if (result.analysis?.urgency === 'URGENT' || result.analysis?.urgency === 'HIGH') results.urgent++;
            else if (result.analysis?.urgency === 'PLANNED' || result.analysis?.urgency === 'MODERATE') results.planned++;
            else results.ok++;
            
            results.details.push({
                stationId: partner.id,
                ...result
            });
        }

        console.log(`[Rebalancer] Complete: ${results.checked} checked | ${results.critical} critical | ${results.urgent} urgent | ${results.planned} planned | ${results.ok} OK`);
        return results;
    },

    /**
     * Hook called after swap completion - check if rebalancing needed
     */
    onSwapComplete: async (stationId) => {
        setImmediate(async () => {
            try {
                await inventoryRebalancer.processStation(stationId);
            } catch (error) {
                console.error('[Rebalancer] Error in post-swap check:', error);
            }
        });
    },

    /**
     * Start periodic checking
     */
    startPeriodicCheck: () => {
        console.log(`[Rebalancer] Starting periodic check every ${CONFIG.CHECK_INTERVAL_MS / 60000} minutes`);
        return setInterval(() => {
            inventoryRebalancer.checkAllStations().catch(console.error);
        }, CONFIG.CHECK_INTERVAL_MS);
    },

    /**
     * Manual trigger for API/testing
     */
    manualCheck: async (stationId = null) => {
        if (stationId) {
            return await inventoryRebalancer.processStation(stationId);
        }
        return await inventoryRebalancer.checkAllStations();
    },

    /**
     * Legacy compatibility - maps to analyzeStation
     */
    checkStationNeedsRebalancing: async (stationId) => {
        return await inventoryRebalancer.analyzeStation(stationId);
    },

    CONFIG
};

module.exports = { inventoryRebalancer, CONFIG };
