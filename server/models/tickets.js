const { pool } = require('../config/database');

const ticketsModel = {
    // Create a new ticket
    create: async (ticket) => {
        const query = `
      INSERT INTO tickets (station_id, priority, status, required_amount)
      VALUES ($1, $2, 'OPEN', $3)
      RETURNING *
    `;
        const res = await pool.query(query, [ticket.station_id, ticket.priority, ticket.required_amount]);
        return res.rows[0];
    },

    // Get all OPEN and PARTIAL tickets (PARTIAL means not fully fulfilled yet)
    getOpen: async () => {
        const res = await pool.query("SELECT * FROM tickets WHERE status IN ('OPEN', 'PARTIAL') ORDER BY created_at ASC");
        return res.rows;
    },

    // Get all tickets
    getAll: async () => {
        const res = await pool.query("SELECT * FROM tickets ORDER BY created_at DESC LIMIT 50");
        return res.rows;
    },

    // Update status
    updateStatus: async (id, status) => {
        const shouldResolve = (status === 'RESOLVED' || status === 'PARTIAL');
        const res = await pool.query(
            "UPDATE tickets SET status = $1, resolved_at = CASE WHEN $3 THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id = $2 RETURNING *",
            [status, id, shouldResolve]
        );
        return res.rows[0];
    }
};

module.exports = ticketsModel;
