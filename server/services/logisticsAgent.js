/**
 * Logistics Agent Service
 * Automates the creation and management of inventory rebalancing tasks.
 */
const partnersModel = require('../models/partners');
const warehousesModel = require('../models/warehouses');
const transferTasksModel = require('../models/transferTasks');
const ticketsModel = require('../models/tickets');
const demandService = require('./demandService');
const { query } = require('../config/database');
const { notificationsModel, NotificationTypes } = require('../models/notifications');

// Constants
const { FINANCIALS, THRESHOLDS, OPERATIONS } = require('../config/logistics');

const Groq = require("groq-sdk");

// Initialize Groq Client
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Helper: Haversine Distance
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

const logisticsAgent = {
    /**
     * Phase A: Detect Deficits & Raise Tickets
     * Scans network for low inventory based on Demand Velocity (Avg Daily Swaps)
     * IMPROVED: Predictive Analysis
     */
    detectDeficits: async () => {
        const allPartners = await partnersModel.getAll();
        const openTickets = await ticketsModel.getOpen();
        const openTicketStationIds = new Set(openTickets.map(t => t.station_id));

        const activeStations = allPartners.filter(p => p.is_active_dsk);
        let ticketsRaised = 0;

        for (const station of activeStations) {
            if (openTicketStationIds.has(station.id)) continue;

            const stock = station.fully_charged_batteries;
            const capacity = station.total_batteries || OPERATIONS.DEFAULT_CAPACITY;

            // --- FORECASTING ---
            const forecastData = await demandService.getForecastForStation(station.id);
            const dailyDemand = forecastData ? forecastData.forecast : (station.avg_daily_swaps || OPERATIONS.DEFAULT_DEMAND);
            const hourlyBurn = dailyDemand / 24;

            // Calculate Current Health
            const currentHoursStock = hourlyBurn > 0 ? stock / hourlyBurn : 999;

            // Calculate Projected Health (T+4 hours)
            // Assuming simplified linear burn for now
            const projectedStockT4 = stock - (hourlyBurn * 4);

            let priority = null;
            let required = 0;

            // 1. CRITICAL: Imminent Stockout (< 3 hours left OR < 15% capacity)
            if (currentHoursStock < 3 || stock <= Math.ceil(capacity * 0.15)) {
                priority = 'CRITICAL';
                required = Math.max(5, Math.ceil(capacity * 0.8) - stock); // Fill to 80%
            }
            // 2. PREEMPTIVE: Projected Stockout (Will be empty in 4 hours)
            else if (projectedStockT4 <= 1) {
                priority = 'HIGH'; // Treat predictive outages as HIGH priority
                required = Math.max(3, Math.ceil(capacity * 0.6) - stock); // Fill to 60%
            }
            // 3. LOW: Just getting low (< 30% capacity)
            else if (stock < Math.ceil(capacity * 0.30)) {
                priority = 'MEDIUM';
                required = Math.max(2, Math.ceil(capacity * 0.5) - stock);
            }

            if (priority) {
                console.log(`[Agent] Raising ${priority} ticket for ${station.id}. Stock: ${stock}, Burn: ${hourlyBurn.toFixed(2)}/hr`);
                await ticketsModel.create({
                    station_id: station.id,
                    priority: priority,
                    required_amount: Math.ceil(required)
                });
                ticketsRaised++;
            }
        }
        return ticketsRaised;
    },

    /**
     * Phase B: Resolve Open Tickets
     * Uses Bedrock to find optimal transfers for open tickets
     * IMPROVED: Safe Donor Logic & Efficiency Awareness
     */
    resolveTickets: async () => {
        const openTickets = await ticketsModel.getOpen();
        if (openTickets.length === 0) return { tasksCreated: 0 };

        const allPartners = await partnersModel.getAll();
        const warehouses = await warehousesModel.getAll();
        const activeTasks = await transferTasksModel.getActive();

        // Map data for fast lookup
        const stationMap = new Map(allPartners.map(p => [p.id, p]));
        const pendingReceiverIds = new Set(activeTasks.map(t => t.target_id));
        const pendingSourceIds = new Set(activeTasks.map(t => t.source_id)); // Track occupied donors

        let tasksCreated = 0;

        for (const ticket of openTickets) {
            if (pendingReceiverIds.has(ticket.station_id)) continue; // Already active task

            const receiver = stationMap.get(ticket.station_id);
            if (!receiver) continue;

            const needed = ticket.required_amount;

            // --- CANDIDATE SEARCH ---
            const candidates = [];

            // 1. Surplus Stations WITH SAFE BUFFER
            const surplusStations = allPartners.filter(p =>
                p.is_active_dsk &&
                p.id !== receiver.id &&
                !pendingSourceIds.has(p.id) // Don't double book donors
            );

            for (const donor of surplusStations) {
                // SAFETY CHECK: donor must have robust stock to give
                const donorDailyDemand = donor.avg_daily_swaps || OPERATIONS.DEFAULT_DEMAND;
                const donorHourlyBurn = donorDailyDemand / 24;
                const donorHoursStock = donorHourlyBurn > 0 ? donor.fully_charged_batteries / donorHourlyBurn : 999;

                // Rule: Donor must have > 8 hours of stock AND at least 5 batteries
                // RELAXED: If ticket is CRITICAL, accept donors with just 3+ batteries
                const minBatteries = ticket.priority === 'CRITICAL' ? 3 : 5;
                const minHours = ticket.priority === 'CRITICAL' ? 4 : 8;
                
                if (donor.fully_charged_batteries < minBatteries || donorHoursStock < minHours) continue;

                const dist = getDistance(receiver.latitude, receiver.longitude, donor.latitude, donor.longitude);
                // RELAXED: Allow longer distances for CRITICAL tickets
                const maxDistance = ticket.priority === 'CRITICAL' ? OPERATIONS.MAX_P2P_DISTANCE_KM * 1.5 : OPERATIONS.MAX_P2P_DISTANCE_KM;
                if (dist > maxDistance) continue;

                candidates.push({
                    type: 'STATION',
                    id: donor.id,
                    name: donor.name,
                    stock: donor.fully_charged_batteries,
                    burnRate: donorHourlyBurn.toFixed(2), // Context for LLM
                    safeHours: donorHoursStock.toFixed(1), // Context for LLM
                    distance: parseFloat(dist.toFixed(2)),
                    revenue: needed * FINANCIALS.REVENUE_PER_SWAP,
                    cost: needed * FINANCIALS.TOTAL_COST_PER_BATTERY,
                    profit: (needed * FINANCIALS.REVENUE_PER_SWAP) - (needed * FINANCIALS.TOTAL_COST_PER_BATTERY)
                });
            }

            // 2. Warehouses (BACKUP - can send partial shipments)
            for (const wh of warehouses) {
                if (wh.charged_batteries < 1) continue; // At least 1 battery
                const dist = getDistance(receiver.latitude, receiver.longitude, wh.latitude, wh.longitude);
                // RELAXED: Allow longer distances for CRITICAL tickets
                const maxWarehouseDistance = ticket.priority === 'CRITICAL' ? OPERATIONS.MAX_WAREHOUSE_DISTANCE_KM * 1.5 : OPERATIONS.MAX_WAREHOUSE_DISTANCE_KM;
                if (dist > maxWarehouseDistance) continue;
                const canProvide = Math.min(wh.charged_batteries, needed); // Send what's available
                candidates.push({
                    type: 'WAREHOUSE',
                    id: wh.id,
                    name: wh.name,
                    stock: wh.charged_batteries,
                    canProvide: canProvide, // Actual amount to send
                    distance: parseFloat(dist.toFixed(2)),
                    revenue: canProvide * FINANCIALS.REVENUE_PER_SWAP,
                    cost: canProvide * FINANCIALS.TOTAL_COST_PER_BATTERY,
                    profit: (canProvide * FINANCIALS.REVENUE_PER_SWAP) - (canProvide * FINANCIALS.TOTAL_COST_PER_BATTERY)
                });
            }

            if (candidates.length === 0) {
                // EMERGENCY FALLBACK: For CRITICAL tickets, use nearest warehouse regardless of distance
                if (ticket.priority === 'CRITICAL') {
                    for (const wh of warehouses) {
                        if (wh.charged_batteries < 1) continue;
                        const dist = getDistance(receiver.latitude, receiver.longitude, wh.latitude, wh.longitude);
                        const canProvide = Math.min(wh.charged_batteries, needed);
                        candidates.push({
                            type: 'WAREHOUSE',
                            id: wh.id,
                            name: wh.name,
                            stock: wh.charged_batteries,
                            canProvide: canProvide,
                            distance: parseFloat(dist.toFixed(2)),
                            revenue: canProvide * FINANCIALS.REVENUE_PER_SWAP,
                            cost: canProvide * FINANCIALS.TOTAL_COST_PER_BATTERY,
                            profit: (canProvide * FINANCIALS.REVENUE_PER_SWAP) - (canProvide * FINANCIALS.TOTAL_COST_PER_BATTERY),
                            emergency: true // Flag for logging
                        });
                    }
                }
                
                if (candidates.length === 0) {
                    console.log(`[Agent] ⚠️ No supply source found for Ticket #${ticket.id} (${receiver.id} needs ${needed} batteries)`);
                    continue;
                }
            }

            // --- GROQ DECISION ---
            // Context Enrichment
            const prompt = `Role: Logistics AI. Goal: Resolve Ticket #${ticket.id} (Priority: ${ticket.priority}).
Target Station: ${receiver.id} 
  - Needs: ${needed} batteries
  - Avg Demand: ${receiver.avg_daily_swaps}/day

Candidates (Donors): ${JSON.stringify(candidates.slice(0, 5))}

Evaluation Rules:
1. If Ticket is CRITICAL, prioritize speed (min distance).
2. For HIGH/MEDIUM, prioritize efficiency and Donor Health (avoid depleting stations with high burn rates).
3. Warehouse is usually reliable but might be further away.
4. If warehouse has canProvide field, use that amount instead of the requested amount.

Output JSON ONLY: { "selected_id": "...", "reason": "brief explanation" }`;

            try {
                const response = await groq.chat.completions.create({
                    model: "llama-3.3-70b-versatile",
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.1,
                    max_tokens: 200,
                    response_format: { type: "json_object" }
                });

                const decision = JSON.parse(response.choices[0].message.content);
                const best = candidates.find(c => c.id === decision.selected_id);

                if (best) {
                    const actualAmount = best.canProvide || needed; // Use warehouse's available amount
                    
                    if (best.emergency) {
                        console.log(`[Agent] 🚨 EMERGENCY: Using ${best.id} at ${best.distance}km (beyond normal limits) for CRITICAL ticket`);
                    }
                    
                    const newTask = await transferTasksModel.create({
                        type: best.type === 'WAREHOUSE' ? 'WAREHOUSE_DISPATCH' : 'P2P_TRANSFER',
                        status: 'PENDING',
                        source_id: best.id,
                        source_type: best.type,
                        target_id: receiver.id,
                        target_type: 'STATION',
                        amount: actualAmount,
                        distance_km: best.distance,
                        financials: { ...best, reason: decision.reason, requested: needed, actual: actualAmount }
                    });

                    // Notify Source (Sender) - Warehouse or Partner
                    await notificationsModel.create({
                        recipientType: best.type === 'STATION' ? 'PARTNER' : best.type,
                        recipientId: best.id,
                        type: best.type === 'WAREHOUSE' ? NotificationTypes.DISPATCH_REQUEST : NotificationTypes.TRANSFER_REQUEST,
                        title: best.type === 'WAREHOUSE' ? '📦 Warehouse Dispatch Request' : '🔄 Transfer Request Received',
                        message: `Please approve transfer of ${actualAmount} batteries to Partner ${receiver.name || receiver.id}.`,
                        data: {
                            taskId: newTask.id,
                            targetId: receiver.id,
                            quantity: actualAmount,
                            action: 'APPROVE_TRANSFER'
                        }
                    });

                    // Send notification to receiving partner that request is pending approval
                    await notificationsModel.create({
                        recipientType: 'PARTNER',
                        recipientId: receiver.id,
                        type: NotificationTypes.TRANSFER_REQUEST,
                        title: '📋 Transfer Request Created',
                        message: `Request for ${actualAmount} batteries from ${best.name || best.type + ' ' + best.id} is pending approval.\n\n⏳ Status: Waiting for sender approval`,
                        data: {
                            taskId: newTask.id,
                            sourceId: best.id,
                            sourceType: best.type,
                            quantity: actualAmount,
                            status: 'PENDING'
                        }
                    });

                    // Update Status
                    await ticketsModel.updateStatus(ticket.id, actualAmount >= needed ? 'RESOLVED' : 'PARTIAL');
                    // Mark donor as busy for this run
                    if (best.type === 'STATION') pendingSourceIds.add(best.id);
                    tasksCreated++;
                    
                    if (actualAmount < needed) {
                        console.log(`[Agent] ⚠️ Partial fulfillment: ${actualAmount}/${needed} batteries from ${best.id}`);
                    }
                }

            } catch (err) {
                console.error("Groq API Error:", err.message);
                // Fallback: Closest Safe Candidate
                const best = candidates.sort((a, b) => a.distance - b.distance)[0];
                if (best) {
                    const actualAmount = best.canProvide || needed;
                    const newTask = await transferTasksModel.create({
                        type: best.type === 'WAREHOUSE' ? 'WAREHOUSE_DISPATCH' : 'P2P_TRANSFER',
                        status: 'PENDING',
                        source_id: best.id,
                        source_type: best.type,
                        target_id: receiver.id,
                        target_type: 'STATION',
                        amount: actualAmount,
                        distance_km: best.distance,
                        financials: { ...best, reason: "Fallback (Network Error)", requested: needed, actual: actualAmount }
                    });

                    // Notify Source (Sender)
                    await notificationsModel.create({
                        recipientType: best.type === 'STATION' ? 'PARTNER' : best.type,
                        recipientId: best.id,
                        type: best.type === 'WAREHOUSE' ? NotificationTypes.DISPATCH_REQUEST : NotificationTypes.TRANSFER_REQUEST,
                        title: best.type === 'WAREHOUSE' ? '📦 Warehouse Dispatch Request' : '🔄 Transfer Request Received',
                        message: `Please approve transfer of ${actualAmount} batteries to Partner ${receiver.name || receiver.id}.`,
                        data: {
                            taskId: newTask.id,
                            targetId: receiver.id,
                            quantity: actualAmount,
                            action: 'APPROVE_TRANSFER'
                        }
                    });

                    // Send notification to receiving partner
                    await notificationsModel.create({
                        recipientType: 'PARTNER',
                        recipientId: receiver.id,
                        type: NotificationTypes.TRANSFER_REQUEST,
                        title: '📋 Transfer Request Created',
                        message: `Request for ${actualAmount} batteries from ${best.name || best.type + ' ' + best.id} is pending approval.\n\n⏳ Status: Waiting for sender approval`,
                        data: {
                            taskId: newTask.id,
                            sourceId: best.id,
                            sourceType: best.type,
                            quantity: actualAmount,
                            status: 'PENDING'
                        }
                    });

                    await ticketsModel.updateStatus(ticket.id, actualAmount >= needed ? 'RESOLVED' : 'PARTIAL');
                    tasksCreated++;
                    
                    if (actualAmount < needed) {
                        console.log(`[Agent] ⚠️ Partial fulfillment (fallback): ${actualAmount}/${needed} batteries from ${best.id}`);
                    }
                }
            }
        }

        return { tasksCreated };
    },

    /**
     * Main Protocol (Legacy Wrapper)
     */
    runProtocol: async () => {
        const r1 = await logisticsAgent.detectDeficits();
        const r2 = await logisticsAgent.resolveTickets();
        return {
            ticketsRaised: r1,
            tasksCreated: r2.tasksCreated
        };
    },

    /**
     * Mark task as completed and actually transfer batteries
     * This moves batteries from source to target station/warehouse
     */
    completeTask: async (taskId) => {
        const tasks = await transferTasksModel.getAll();
        const task = tasks.find(t => String(t.id) === String(taskId));
        
        if (!task) {
            return { success: false, message: 'Task not found' };
        }
        if (task.status === 'COMPLETED') {
            return { success: false, message: 'Task already completed' };
        }
        if (task.status === 'PENDING') {
            return { success: false, message: 'Task not yet approved by sender' };
        }

        const { source_id, source_type, target_id, target_type, amount } = task;
        console.log(`[Logistics] Completing transfer: ${amount} batteries from ${source_type}:${source_id} to ${target_type}:${target_id}`);

        try {
            let actualTransferred = amount;
            let batteryIds = [];

            if (source_type === 'WAREHOUSE') {
                // For warehouse dispatches, decrement warehouse inventory
                await query(`
                    UPDATE warehouses 
                    SET charged_batteries = charged_batteries - $1
                    WHERE name = $2 AND charged_batteries >= $1
                `, [amount, source_id]);

                // No physical battery movement needed - warehouses don't track individual batteries
                console.log(`[Logistics] Warehouse ${source_id} inventory decreased by ${amount}`);
            } else {
                // For P2P transfers, move actual battery records
                // 1. Get charged batteries from source
                const stationBatteries = await query(`
                    SELECT id, soc FROM batteries 
                    WHERE current_station_id = $1 AND soc >= 80 AND status IN ('IDLE', 'CHARGING')
                    ORDER BY soc DESC
                    LIMIT $2
                `, [source_id, amount]);
                const batteriesToMove = stationBatteries.rows;

                if (batteriesToMove.length === 0) {
                    return { success: false, message: 'No charged batteries available at source' };
                }

                actualTransferred = batteriesToMove.length;
                batteryIds = batteriesToMove.map(b => b.id);

                // 2. Move batteries to target station
                await query(`
                    UPDATE batteries 
                    SET current_station_id = $1, 
                        status = 'IDLE',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ANY($2)
                `, [target_id, batteryIds]);
            }

            // 3. Update partner metrics for both source and target
            if (source_type !== 'WAREHOUSE') {
                const sourceBatteries = await query(`
                    SELECT COUNT(*) as total, 
                           COUNT(*) FILTER (WHERE soc >= 80) as charged
                    FROM batteries WHERE current_station_id = $1
                `, [source_id]);
                await partnersModel.updateMetrics(
                    source_id, 
                    parseInt(sourceBatteries.rows[0].total), 
                    parseInt(sourceBatteries.rows[0].charged)
                );
            }
            
            if (target_type !== 'WAREHOUSE') {
                const targetBatteries = await query(`
                    SELECT COUNT(*) as total, 
                           COUNT(*) FILTER (WHERE soc >= 80) as charged
                    FROM batteries WHERE current_station_id = $1
                `, [target_id]);
                await partnersModel.updateMetrics(
                    target_id, 
                    parseInt(targetBatteries.rows[0].total), 
                    parseInt(targetBatteries.rows[0].charged)
                );
            } else {
                // If Target is WAREHOUSE, increment its inventory
                await query(`
                    UPDATE warehouses 
                    SET charged_batteries = charged_batteries + $1
                    WHERE name = $2 OR id::text = $2
                `, [actualTransferred, target_id]);

                console.log(`[Logistics] Warehouse ${target_id} inventory increased by ${actualTransferred}`);
            }
            
            await transferTasksModel.updateStatus(taskId, 'COMPLETED');

            // 5. Send notifications
            await notificationsModel.create({
                recipientType: target_type === 'WAREHOUSE' ? 'WAREHOUSE' : 'PARTNER',
                recipientId: target_id,
                type: NotificationTypes.TRANSFER_COMPLETE || 'TRANSFER_COMPLETE',
                title: '🎉 Batteries Delivered Successfully!',
                message: `${actualTransferred} charged batteries have been delivered from ${source_type === 'WAREHOUSE' ? 'Warehouse' : 'Partner'} ${source_id}.\n\n✅ Transfer Complete\n📦 All batteries are ready for swaps\n🔋 Your inventory has been restocked!`,
                data: { 
                    taskId, 
                    batteryIds, 
                    quantity: actualTransferred,
                    sourceId: source_id,
                    sourceType: source_type
                }
            });

            await notificationsModel.create({
                recipientType: source_type === 'WAREHOUSE' ? 'WAREHOUSE' : 'PARTNER',
                recipientId: source_id,
                type: NotificationTypes.TRANSFER_COMPLETE || 'TRANSFER_COMPLETE',
                title: '✅ Delivery Completed',
                message: `${actualTransferred} batteries successfully delivered to ${target_id}.`,
                data: { taskId, quantity: actualTransferred }
            });

            console.log(`[Logistics] Transfer completed: ${actualTransferred} batteries moved`);
            return { success: true, transferred: actualTransferred, batteryIds };
        } catch (error) {
            console.error('[Logistics] Error completing transfer:', error);
            return { success: false, message: error.message };
        }
    }
};

module.exports = logisticsAgent;
