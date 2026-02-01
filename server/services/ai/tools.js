/**
 * LangChain Tools for Inventory Management Agent
 * These tools allow the AI agent to interact with the battery swap system
 */

const { DynamicStructuredTool } = require('@langchain/core/tools');
const { z } = require('zod');
const partnersModel = require('../../models/partners');
const batteriesModel = require('../../models/batteries');
const { notificationsModel, NotificationTypes } = require('../../models/notifications');
const { query } = require('../../config/database');

/**
 * Tool: Get Station Inventory Status
 * Retrieves current battery inventory for a station
 */
const getStationInventoryTool = new DynamicStructuredTool({
    name: 'get_station_inventory',
    description: 'Get the current battery inventory status for a specific partner station. Returns total batteries, charged batteries, charging batteries, and low batteries.',
    schema: z.object({
        stationId: z.string().describe('The partner station ID (e.g., P4897)')
    }),
    func: async ({ stationId }) => {
        try {
            const partner = await partnersModel.getById(stationId);
            if (!partner) {
                return JSON.stringify({ error: `Station ${stationId} not found` });
            }

            const batteries = await batteriesModel.getByStation(stationId);
            const summary = {
                stationId,
                totalBatteries: batteries.length,
                chargedBatteries: batteries.filter(b => b.soc >= 80).length,
                chargingBatteries: batteries.filter(b => b.soc > 20 && b.soc < 80).length,
                lowBatteries: batteries.filter(b => b.soc <= 20).length,
                busyScore: parseFloat(partner.busy_score) || 0,
                totalSwaps: partner.total_swaps || 0,
                isActive: partner.is_active_dsk
            };
            return JSON.stringify(summary);
        } catch (error) {
            return JSON.stringify({ error: error.message });
        }
    }
});

/**
 * Tool: Get Nearby Stations
 * Find stations near a location with their inventory levels
 */
const getNearbyStationsTool = new DynamicStructuredTool({
    name: 'get_nearby_stations',
    description: 'Find partner stations near a specific location with their inventory levels. Useful for finding potential transfer sources or destinations.',
    schema: z.object({
        latitude: z.number().describe('Latitude of the center point'),
        longitude: z.number().describe('Longitude of the center point'),
        radiusKm: z.number().default(10).describe('Search radius in kilometers (default 10)')
    }),
    func: async ({ latitude, longitude, radiusKm }) => {
        try {
            const partners = await partnersModel.getNearby(latitude, longitude, radiusKm);
            const stationsWithInventory = await Promise.all(
                partners.slice(0, 10).map(async (p) => {
                    const batteries = await batteriesModel.getByStation(p.id);
                    return {
                        stationId: p.id,
                        distanceKm: parseFloat(p.distance_km).toFixed(2),
                        totalBatteries: batteries.length,
                        chargedBatteries: batteries.filter(b => b.soc >= 80).length,
                        busyScore: parseFloat(p.busy_score) || 0
                    };
                })
            );
            return JSON.stringify({ stations: stationsWithInventory, count: stationsWithInventory.length });
        } catch (error) {
            return JSON.stringify({ error: error.message });
        }
    }
});

/**
 * Tool: Get Low Inventory Stations
 * Find stations that need inventory replenishment
 */
const getLowInventoryStationsTool = new DynamicStructuredTool({
    name: 'get_low_inventory_stations',
    description: 'Find stations with low battery inventory that may need rebalancing. Returns stations with 2 or fewer charged batteries.',
    schema: z.object({
        limit: z.number().default(10).describe('Maximum number of stations to return')
    }),
    func: async ({ limit }) => {
        try {
            const sql = `
                SELECT p.id, p.latitude, p.longitude, p.total_batteries, p.fully_charged_batteries,
                       p.busy_score, p.total_swaps
                FROM partners p
                WHERE p.is_active_dsk = true AND p.fully_charged_batteries <= 2
                ORDER BY p.fully_charged_batteries ASC, p.busy_score DESC
                LIMIT $1
            `;
            const result = await query(sql, [limit]);
            return JSON.stringify({
                lowInventoryStations: result.rows,
                count: result.rows.length,
                message: result.rows.length === 0 ? 'No stations with low inventory found' : null
            });
        } catch (error) {
            return JSON.stringify({ error: error.message });
        }
    }
});

/**
 * Tool: Get High Inventory Stations
 * Find stations with excess inventory that can be transferred
 */
const getHighInventoryStationsTool = new DynamicStructuredTool({
    name: 'get_high_inventory_stations',
    description: 'Find stations with high battery inventory that can donate batteries. Returns stations with 8 or more batteries.',
    schema: z.object({
        limit: z.number().default(10).describe('Maximum number of stations to return')
    }),
    func: async ({ limit }) => {
        try {
            const sql = `
                SELECT p.id, p.latitude, p.longitude, p.total_batteries, p.fully_charged_batteries,
                       p.busy_score, p.total_swaps
                FROM partners p
                WHERE p.is_active_dsk = true AND p.total_batteries >= 8
                ORDER BY p.total_batteries DESC
                LIMIT $1
            `;
            const result = await query(sql, [limit]);
            return JSON.stringify({
                highInventoryStations: result.rows,
                count: result.rows.length
            });
        } catch (error) {
            return JSON.stringify({ error: error.message });
        }
    }
});

/**
 * Tool: Get Warehouse Inventory
 * Get current warehouse inventory levels
 */
const getWarehouseInventoryTool = new DynamicStructuredTool({
    name: 'get_warehouse_inventory',
    description: 'Get inventory levels for all warehouses or a specific warehouse.',
    schema: z.object({
        warehouseId: z.string().nullable().optional().describe('Filter by specific warehouse ID')
    }),
    func: async ({ warehouseId }) => {
        try {
            let sql = 'SELECT * FROM warehouses';
            const params = [];
            if (warehouseId) {
                sql += ' WHERE id = $1';
                params.push(warehouseId);
            }
            sql += ' ORDER BY id';
            const result = await query(sql, params);
            return JSON.stringify({
                warehouses: result.rows,
                count: result.rows.length
            });
        } catch (error) {
            return JSON.stringify({ error: error.message });
        }
    }
});

/**
 * Tool: Request Inventory Rebalancing
 * Create a transfer task request from source to destination
 */
const requestRebalancingTool = new DynamicStructuredTool({
    name: 'request_inventory_rebalancing',
    description: 'Create a request for inventory rebalancing between stations or from warehouse. This creates a pending transfer task that needs approval.',
    schema: z.object({
        sourceType: z.enum(['PARTNER', 'WAREHOUSE']).describe('Type of source: PARTNER or WAREHOUSE'),
        sourceId: z.string().describe('Source station/warehouse ID'),
        targetType: z.enum(['PARTNER']).describe('Type of target (currently only PARTNER supported)'),
        targetId: z.string().describe('Target station ID'),
        amount: z.number().min(1).max(10).describe('Number of batteries to transfer (1-10)'),
        reason: z.string().describe('Reason for the rebalancing request'),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM').describe('Priority of the request')
    }),
    func: async ({ sourceType, sourceId, targetType, targetId, amount, reason, priority }) => {
        try {
            // Validate source exists
            if (sourceType === 'PARTNER') {
                const source = await partnersModel.getById(sourceId);
                if (!source) return JSON.stringify({ error: `Source station ${sourceId} not found` });
            }

            // Validate target exists
            const target = await partnersModel.getById(targetId);
            if (!target) return JSON.stringify({ error: `Target station ${targetId} not found` });

            // Create transfer task
            const taskType = sourceType === 'WAREHOUSE' ? 'WAREHOUSE_DISPATCH' : 'P2P_TRANSFER';
            const sql = `
                INSERT INTO transfer_tasks (type, status, source_id, source_type, target_id, target_type, amount, financials)
                VALUES ($1, 'PENDING', $2, $3, $4, $5, $6, $7)
                RETURNING *
            `;
            const financials = { reason, priority, requestedAt: new Date().toISOString() };
            const result = await query(sql, [taskType, sourceId, sourceType, targetId, targetType, amount, JSON.stringify(financials)]);
            const task = result.rows[0];

            // Send notification to relevant parties
            if (sourceType === 'PARTNER') {
                await notificationsModel.create({
                    recipientType: 'PARTNER',
                    recipientId: sourceId,
                    type: NotificationTypes.TRANSFER_REQUEST,
                    title: 'Transfer Request Created',
                    message: `Request to transfer ${amount} batteries to ${targetId}. Reason: ${reason}`,
                    data: { taskId: task.id, targetId, amount, priority }
                });
            }

            await notificationsModel.create({
                recipientType: 'PARTNER',
                recipientId: targetId,
                type: NotificationTypes.TRANSFER_REQUEST,
                title: 'Incoming Transfer Request',
                message: `${amount} batteries requested from ${sourceId}. Awaiting approval.`,
                data: { taskId: task.id, sourceId, amount, priority }
            });

            // Also notify warehouse for oversight
            await notificationsModel.create({
                recipientType: 'WAREHOUSE',
                recipientId: 'WH_001',
                type: NotificationTypes.DISPATCH_REQUEST,
                title: 'Rebalancing Request Created',
                message: `Transfer of ${amount} batteries from ${sourceId} to ${targetId}. Priority: ${priority}`,
                data: { taskId: task.id, sourceId, targetId, amount, priority, reason }
            });

            return JSON.stringify({
                success: true,
                taskId: task.id,
                status: 'PENDING',
                message: `Rebalancing request created. Task ID: ${task.id}. Awaiting approval.`,
                details: { sourceId, targetId, amount, priority, reason }
            });
        } catch (error) {
            return JSON.stringify({ error: error.message });
        }
    }
});

/**
 * Tool: Approve/Reject Rebalancing Request
 * Approve or reject a pending transfer task
 */
const approveRebalancingTool = new DynamicStructuredTool({
    name: 'approve_rebalancing_request',
    description: 'Approve or reject a pending inventory rebalancing request. Only pending requests can be approved.',
    schema: z.object({
        taskId: z.string().describe('The transfer task ID to approve/reject'),
        action: z.enum(['APPROVE', 'REJECT']).describe('Action to take'),
        approverRole: z.enum(['WAREHOUSE', 'PARTNER']).describe('Role of the approver'),
        approverId: z.string().describe('ID of the approver (warehouse ID or partner ID)'),
        notes: z.string().optional().describe('Optional notes for the decision')
    }),
    func: async ({ taskId, action, approverRole, approverId, notes }) => {
        try {
            // Get the task
            const taskResult = await query('SELECT * FROM transfer_tasks WHERE id = $1', [taskId]);
            if (taskResult.rows.length === 0) {
                return JSON.stringify({ error: `Task ${taskId} not found` });
            }

            const task = taskResult.rows[0];
            if (task.status !== 'PENDING' && task.status !== 'PENDING_SENDER_APPROVAL') {
                return JSON.stringify({ error: `Task is already ${task.status}, cannot ${action.toLowerCase()}` });
            }

            const newStatus = action === 'APPROVE' ? 'ASSIGNED' : 'CANCELLED';
            const financials = task.financials || {};
            financials.approvedBy = approverId;
            financials.approverRole = approverRole;
            financials.approvedAt = new Date().toISOString();
            financials.approvalNotes = notes;
            financials.action = action;

            // Update task
            const updateSql = `
                UPDATE transfer_tasks 
                SET status = $1, financials = $2 ${action === 'REJECT' ? ', completed_at = CURRENT_TIMESTAMP' : ''}
                WHERE id = $3
                RETURNING *
            `;
            const updated = await query(updateSql, [newStatus, JSON.stringify(financials), taskId]);

            // Send notifications
            const notifType = action === 'APPROVE' ? NotificationTypes.TRANSFER_REQUEST : NotificationTypes.SYSTEM_ALERT;
            const title = action === 'APPROVE' ? 'Transfer Approved' : 'Transfer Rejected';
            const message = action === 'APPROVE'
                ? `Transfer of ${task.amount} batteries approved by ${approverId}`
                : `Transfer request rejected by ${approverId}. ${notes || ''}`;

            // Notify source
            if (task.source_type === 'PARTNER') {
                await notificationsModel.create({
                    recipientType: 'PARTNER',
                    recipientId: task.source_id,
                    type: notifType,
                    title,
                    message,
                    data: { taskId, action, approvedBy: approverId }
                });
            }

            // Notify target
            await notificationsModel.create({
                recipientType: 'PARTNER',
                recipientId: task.target_id,
                type: notifType,
                title,
                message,
                data: { taskId, action, approvedBy: approverId }
            });

            return JSON.stringify({
                success: true,
                taskId,
                action,
                newStatus,
                message: `Transfer request ${action.toLowerCase()}d successfully`,
                task: updated.rows[0]
            });
        } catch (error) {
            return JSON.stringify({ error: error.message });
        }
    }
});

/**
 * Tool: Get Pending Transfer Tasks
 * List all pending transfer tasks awaiting approval (Including PENDING and PENDING_SENDER_APPROVAL)
 */
const getPendingTasksTool = new DynamicStructuredTool({
    name: 'get_pending_transfer_tasks',
    description: 'Get all pending transfer tasks that need approval.',
    schema: z.object({
        stationId: z.string().nullable().optional().describe('Optional: filter by station ID (as source or target)')
    }),
    func: async ({ stationId }) => {
        try {
            console.log(`[Tool:get_pending_transfer_tasks] Called with stationId: ${stationId}`);
            let sql = `
                SELECT * FROM transfer_tasks 
                WHERE status IN ('PENDING', 'PENDING_SENDER_APPROVAL')
            `;
            const params = [];
            if (stationId && stationId !== 'undefined' && stationId !== 'null' && stationId !== '') {
                sql += ` AND (source_id = $1 OR target_id = $1)`;
                params.push(stationId);
            }
            sql += ' ORDER BY created_at DESC';

            const result = await query(sql, params);
            console.log(`[Tool:get_pending_transfer_tasks] Found ${result.rowCount} tasks`);

            return JSON.stringify({
                pendingTasks: result.rows,
                count: result.rowCount
            });
        } catch (error) {
            console.error(`[Tool:get_pending_transfer_tasks] Error:`, error);
            return JSON.stringify({ error: error.message });
        }
    }
});

/**
 * Tool: Analyze Rebalancing Needs
 * Analyze the network and suggest rebalancing actions
 */
const analyzeRebalancingNeedsTool = new DynamicStructuredTool({
    name: 'analyze_rebalancing_needs',
    description: 'Analyze the entire network to identify stations that need inventory rebalancing. Returns recommendations for transfers.',
    schema: z.object({}),
    func: async () => {
        try {
            // Get stations needing batteries (low inventory + high busy score)
            const needySql = `
                SELECT id, latitude, longitude, total_batteries, fully_charged_batteries, busy_score
                FROM partners
                WHERE is_active_dsk = true AND fully_charged_batteries <= 2
                ORDER BY busy_score DESC, fully_charged_batteries ASC
                LIMIT 5
            `;
            const needy = await query(needySql);

            // Get stations with surplus batteries
            const surplusSql = `
                SELECT id, latitude, longitude, total_batteries, fully_charged_batteries, busy_score
                FROM partners
                WHERE is_active_dsk = true AND fully_charged_batteries >= 5
                ORDER BY fully_charged_batteries DESC
                LIMIT 5
            `;
            const surplus = await query(surplusSql);

            // Get warehouse inventory
            const warehouseSql = 'SELECT * FROM warehouses ORDER BY charged_batteries DESC LIMIT 3';
            const warehouses = await query(warehouseSql);

            // Generate recommendations
            const recommendations = [];
            for (const needyStation of needy.rows) {
                // First check if any warehouse has batteries
                for (const wh of warehouses.rows) {
                    if (wh.charged_batteries >= 3) {
                        recommendations.push({
                            type: 'WAREHOUSE_DISPATCH',
                            priority: needyStation.busy_score > 50 ? 'HIGH' : 'MEDIUM',
                            source: { type: 'WAREHOUSE', id: wh.id, available: wh.charged_batteries },
                            target: { type: 'PARTNER', id: needyStation.id, current: needyStation.fully_charged_batteries },
                            suggestedAmount: Math.min(3, wh.charged_batteries),
                            reason: `Station ${needyStation.id} has low inventory (${needyStation.fully_charged_batteries} charged) with busy score ${needyStation.busy_score}`
                        });
                        break;
                    }
                }

                // Then check peer stations
                for (const surplusStation of surplus.rows) {
                    if (surplusStation.id !== needyStation.id && surplusStation.fully_charged_batteries >= 5) {
                        recommendations.push({
                            type: 'P2P_TRANSFER',
                            priority: needyStation.busy_score > 50 ? 'MEDIUM' : 'LOW',
                            source: { type: 'PARTNER', id: surplusStation.id, available: surplusStation.fully_charged_batteries },
                            target: { type: 'PARTNER', id: needyStation.id, current: needyStation.fully_charged_batteries },
                            suggestedAmount: 2,
                            reason: `Transfer from ${surplusStation.id} (${surplusStation.fully_charged_batteries} charged) to ${needyStation.id} (${needyStation.fully_charged_batteries} charged)`
                        });
                        break;
                    }
                }
            }

            return JSON.stringify({
                analysis: {
                    stationsNeedingInventory: needy.rows.length,
                    stationsWithSurplus: surplus.rows.length,
                    warehousesWithStock: warehouses.rows.filter(w => w.charged_batteries > 0).length
                },
                recommendations: recommendations.slice(0, 5),
                message: recommendations.length === 0
                    ? 'Network is well balanced, no immediate rebalancing needed'
                    : `Found ${recommendations.length} rebalancing opportunities`
            });
        } catch (error) {
            return JSON.stringify({ error: error.message });
        }
    }
});

// Export all tools
module.exports = {
    getStationInventoryTool,
    getNearbyStationsTool,
    getLowInventoryStationsTool,
    getHighInventoryStationsTool,
    getWarehouseInventoryTool,
    requestRebalancingTool,
    approveRebalancingTool,
    getPendingTasksTool,
    analyzeRebalancingNeedsTool,

    // Export as array for easy agent setup
    getAllTools: () => [
        getStationInventoryTool,
        getNearbyStationsTool,
        getLowInventoryStationsTool,
        getHighInventoryStationsTool,
        getWarehouseInventoryTool,
        requestRebalancingTool,
        approveRebalancingTool,
        getPendingTasksTool,
        analyzeRebalancingNeedsTool
    ]
};
