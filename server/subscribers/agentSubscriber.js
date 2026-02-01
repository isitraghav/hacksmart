const eventBus = require('../utils/eventBus');
const logisticsAgent = require('../services/logisticsAgent');
const { inventoryRebalancer } = require('../services/inventoryRebalancer');
const { congestionDetector } = require('../services/congestionDetector');
const partnersModel = require('../models/partners');

/**
 * AI Agent Event Listener
 * 
 * Event-driven rebalancing:
 * - Triggered by swap events, stock updates, congestion detection
 * - NOT periodic - only runs when relevant events occur
 */

// Register AI agent callback with the inventory rebalancer
inventoryRebalancer.setAIAgentCallback(async (context) => {
    console.log(`[AI Agent] Triggered for ${context.urgency} rebalancing at station ${context.stationId}`);
    
    try {
        if (context.urgency === 'CRITICAL') {
            // Critical: No batteries available - need immediate action
            console.log(`[AI Agent] CRITICAL: Station ${context.stationId} has no batteries!`);
            // Could trigger additional logic here (SMS alerts, escalation, etc.)
            await logisticsAgent.detectDeficits();
        } else if (context.urgency === 'URGENT') {
            // Urgent: Very low stock - check for other stations that can help
            console.log(`[AI Agent] URGENT: Station ${context.stationId} needs immediate help`);
            await logisticsAgent.detectDeficits();
        }
    } catch (err) {
        console.error('[AI Agent] Error handling rebalance callback:', err);
    }
});

// ============ EVENT-DRIVEN REBALANCING ============

// Listener: When a battery swap is completed - check the station's inventory
eventBus.on(eventBus.EVENTS.BATTERY_SWAP_COMPLETED, async (data) => {
    try {
        const { stationId, driverId, oldBatterySoc, newBatterySoc } = data;
        console.log(`[Agent] Swap completed at ${stationId} - checking inventory`);
        
        // Trigger rebalancing check for this station
        await inventoryRebalancer.processStation(stationId);
        
        // Also detect congestion after swap (driver location may have updated)
        await congestionDetector.checkStation(stationId);
    } catch (err) {
        console.error('[Agent] Swap event handling failed:', err);
    }
});

// Listener: When stock changes at a partner
eventBus.on(eventBus.EVENTS.PARTNER_STOCK_UPDATE, async (partner) => {
    try {
        console.log(`[Agent] Stock update at ${partner.id} - checking rebalancing need`);
        await inventoryRebalancer.processStation(partner.id);
    } catch (err) {
        console.error('[Agent] Stock update handling failed:', err);
    }
});

// Listener: When demand pattern changes (e.g., after many swaps)
eventBus.on(eventBus.EVENTS.PARTNER_DEMAND_UPDATE, async (partner) => {
    try {
        // High demand might trigger forecast-based rebalancing
        if (partner.avg_daily_swaps > 15) {
            console.log(`[Agent] High demand at ${partner.id} - checking rebalancing need`);
            await inventoryRebalancer.processStation(partner.id);
        }
    } catch (err) {
        console.error('[Agent] Demand update handling failed:', err);
    }
});

// Listener: When a driver's battery goes below threshold
eventBus.on(eventBus.EVENTS.BATTERY_LOW_SOC, async (data) => {
    try {
        const { driverId, batteryId, soc, nearestStationId } = data;
        console.log(`[Agent] Low battery alert: Driver ${driverId} at ${soc}% near ${nearestStationId}`);
        
        // Check congestion at the nearest station
        if (nearestStationId) {
            const congestion = await congestionDetector.checkStation(nearestStationId);
            if (congestion && congestion.level !== 'NONE') {
                console.log(`[Agent] Station ${nearestStationId} congestion: ${congestion.level}`);
            }
        }
    } catch (err) {
        console.error('[Agent] Low battery handling failed:', err);
    }
});

// ============ CONGESTION-DRIVEN ACTIONS ============

// Listener: When congestion is detected at a station
eventBus.on(eventBus.EVENTS.STATION_CONGESTION_DETECTED, async (data) => {
    try {
        const { stationId, level, driversNeedingSwap } = data;
        console.log(`[Agent] Congestion ${level} at ${stationId} - ${driversNeedingSwap} drivers need swap`);
        
        // Check if we have enough inventory for the incoming drivers
        const analysis = await inventoryRebalancer.analyzeStation(stationId);
        
        // Factor in congestion: add congested drivers to expected demand
        const adjustedDemand = analysis.forecastedDemandIn8Hours + driversNeedingSwap;
        
        if (analysis.readyNow < adjustedDemand) {
            console.log(`[Agent] Station ${stationId} needs ${adjustedDemand - analysis.readyNow} more batteries for congestion`);
            // Trigger rebalancing with congestion context
            await inventoryRebalancer.processStation(stationId, {
                congestionBoost: driversNeedingSwap,
                congestionLevel: level,
            });
        }
    } catch (err) {
        console.error('[Agent] Congestion handling failed:', err);
    }
});

// Listener: When congestion clears
eventBus.on(eventBus.EVENTS.STATION_CONGESTION_CLEARED, async (data) => {
    console.log(`[Agent] Congestion cleared at ${data.stationId} (was ${data.previousLevel})`);
});

// Listener: When batch driver locations update - detect congestion across all stations
eventBus.on(eventBus.EVENTS.DRIVERS_BATCH_LOCATION_UPDATE, async (data) => {
    try {
        // Run full congestion detection when we get batch location updates
        const congestionReport = await congestionDetector.detectCongestion();
        if (congestionReport.length > 0) {
            console.log(`[Agent] Congestion detected at ${congestionReport.length} stations`);
        }
    } catch (err) {
        console.error('[Agent] Batch congestion detection failed:', err);
    }
});

// Listener: When a task completes
eventBus.on(eventBus.EVENTS.TASK_COMPLETED, async (task) => {
    try {
        await logisticsAgent.resolveTickets();
    } catch (err) {
        console.error('[Agent] Auto-resolve failed:', err);
    }
});

// ============ NO PERIODIC CHECK ============
// Rebalancing is now purely event-driven:
// - BATTERY_SWAP_COMPLETED: When a swap happens, check inventory
// - PARTNER_STOCK_UPDATE: When stock manually changes
// - STATION_CONGESTION_DETECTED: When drivers cluster near a station
// - BATTERY_LOW_SOC: When a driver's battery drops low

console.log('✓ AI Agent Event Subscribers Initialized');
console.log('✓ Event-Driven Inventory Rebalancing Active');
console.log('✓ Congestion Detection Active');

module.exports = { congestionDetector };
