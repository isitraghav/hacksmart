const { query } = require('../config/database');

const driversModel = {
    getAll: async () => {
        const res = await query('SELECT * FROM drivers ORDER BY created_at DESC');
        return res.rows;
    },

    getById: async (id) => {
        const res = await query('SELECT * FROM drivers WHERE id = $1', [id]);
        return res.rows[0];
    },

    create: async ({ id, name, phone, lat, lon }) => {
        const sql = `
            INSERT INTO drivers (id, name, phone, current_latitude, current_longitude, status)
            VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
            RETURNING *
        `;
        const res = await query(sql, [id, name, phone, lat, lon]);
        return res.rows[0];
    },

    updateLocation: async (id, lat, lon) => {
        const sql = `
            UPDATE drivers 
            SET current_latitude = $2, current_longitude = $3, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *
        `;
        const res = await query(sql, [id, lat, lon]);
        return res.rows[0];
    },

    assignBattery: async (driverId, batteryId) => {
        const sql = `
            UPDATE drivers 
            SET current_battery_id = $2, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *
        `;
        const res = await query(sql, [driverId, batteryId]);
        return res.rows[0];
    }
};

module.exports = driversModel;
