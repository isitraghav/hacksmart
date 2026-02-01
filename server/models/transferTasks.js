const { pool } = require('../config/database');
const eventBus = require('../utils/eventBus');

const transferTasks = {
    // Create a new task
    create: async (task) => {
        const query = `
      INSERT INTO transfer_tasks (
        type, status, source_id, source_type, target_id, target_type, 
        amount, distance_km, financials
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
        const values = [
            task.type,
            task.status || 'ASSIGNED',
            task.source_id,
            task.source_type,
            task.target_id,
            task.target_type,
            task.amount,
            task.distance_km,
            task.financials
        ];
        const res = await pool.query(query, values);
        return res.rows[0];
    },

    // Get all tasks (simplification: last 50)
    getAll: async () => {
        const res = await pool.query('SELECT * FROM transfer_tasks ORDER BY created_at DESC LIMIT 50');
        return res.rows;
    },

    // Get active tasks
    getActive: async () => {
        const res = await pool.query("SELECT * FROM transfer_tasks WHERE status NOT IN ('COMPLETED', 'CANCELLED') ORDER BY created_at DESC");
        return res.rows;
    },

    // Update status (e.g. COMPLETED, approved, rejected)
    updateStatus: async (id, status, metadata = {}) => {
        // Build the update query based on status and metadata
        let query;
        let values;

        if (status === 'COMPLETED') {
            query = 'UPDATE transfer_tasks SET status = $1, completed_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *';
            values = [status, id];
        } else if (status === 'approved' || status === 'APPROVED') {
            query = `UPDATE transfer_tasks SET 
                status = 'IN_PROGRESS', 
                financials = COALESCE(financials, '{}'::jsonb) || $1::jsonb 
                WHERE id = $2 RETURNING *`;
            values = [JSON.stringify({
                approved: true,
                approvedBy: metadata.approvedBy,
                approvedAt: metadata.approvedAt,
                approvalNotes: metadata.notes
            }), id];
        } else if (status === 'rejected' || status === 'REJECTED') {
            query = `UPDATE transfer_tasks SET 
                status = 'CANCELLED', 
                financials = COALESCE(financials, '{}'::jsonb) || $1::jsonb 
                WHERE id = $2 RETURNING *`;
            values = [JSON.stringify({
                rejected: true,
                rejectedBy: metadata.rejectedBy,
                rejectedAt: metadata.rejectedAt,
                rejectionReason: metadata.reason
            }), id];
        } else if (status === 'PENDING_SENDER_APPROVAL') {
            query = 'UPDATE transfer_tasks SET status = $1 WHERE id = $2 RETURNING *';
            values = [status, id];
        } else {
            query = 'UPDATE transfer_tasks SET status = $1 WHERE id = $2 RETURNING *';
            values = [status, id];
        }

        const res = await pool.query(query, values);
        const task = res.rows[0];

        if (task) {
            if (status === 'COMPLETED') {
                eventBus.emit(eventBus.EVENTS.TASK_COMPLETED, task);
            } else if (status === 'approved' || status === 'APPROVED') {
                eventBus.emit(eventBus.EVENTS.TASK_APPROVED || 'task:approved', task);
            } else if (status === 'rejected' || status === 'REJECTED') {
                eventBus.emit(eventBus.EVENTS.TASK_REJECTED || 'task:rejected', task);
            } else if (status === 'PENDING_SENDER_APPROVAL') {
                eventBus.emit('task:pending_approval', task);
            }
        }

        return task;
    }
};

module.exports = transferTasks;
