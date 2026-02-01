const { query } = require('../config/database');

const batteriesModel = {
    getAll: async () => {
        const res = await query('SELECT * FROM batteries ORDER BY updated_at DESC');
        return res.rows;
    },

    getById: async (id) => {
        const res = await query('SELECT * FROM batteries WHERE id = $1', [id]);
        return res.rows[0];
    },

    getByStation: async (stationId) => {
        const res = await query(
            'SELECT * FROM batteries WHERE current_station_id = $1 ORDER BY soc DESC',
            [stationId]
        );
        return res.rows;
    },

    // Get the best available battery at a station (highest SOC, not in use)
    getBestAtStation: async (stationId) => {
        const res = await query(
            `SELECT * FROM batteries 
             WHERE current_station_id = $1 
               AND current_driver_id IS NULL
               AND status IN ('IDLE', 'CHARGING')
             ORDER BY soc DESC 
             LIMIT 1`,
            [stationId]
        );
        return res.rows[0];
    },

    // Get battery currently assigned to a driver
    getByDriver: async (driverId) => {
        const res = await query(
            'SELECT * FROM batteries WHERE current_driver_id = $1',
            [driverId]
        );
        return res.rows[0];
    },

    // Get all batteries currently assigned to a driver
    getAllByDriver: async (driverId) => {
        const res = await query(
            'SELECT * FROM batteries WHERE current_driver_id = $1 ORDER BY soc DESC',
            [driverId]
        );
        return res.rows;
    },

    // Update SOC for a battery
    updateSoc: async (id, soc) => {
        const res = await query(
            `UPDATE batteries SET soc = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
            [id, soc]
        );
        return res.rows[0];
    },

    create: async ({ id, status, stationId, soc }) => {
        const sql = `
            INSERT INTO batteries (id, status, current_station_id, soc)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;
        const res = await query(sql, [id, status || 'IDLE', stationId, soc || 100]);
        return res.rows[0];
    },

    updateStatus: async (id, status, locationType, locationId) => {
        // locationType: 'STATION' or 'DRIVER'
        let sql = `UPDATE batteries SET status = $2, updated_at = CURRENT_TIMESTAMP`;
        const params = [id, status];
        let pIdx = 3;

        if (locationType === 'STATION') {
            sql += `, current_station_id = $${pIdx++}, current_driver_id = NULL`;
            params.push(locationId);
        } else if (locationType === 'DRIVER') {
            sql += `, current_driver_id = $${pIdx++}, current_station_id = NULL`;
            params.push(locationId);
        }

        sql += ` WHERE id = $1 RETURNING *`;

        const res = await query(sql, params);
        return res.rows[0];
    },

    updateMetrics: async (id, { soc, tempAnomaly, voltageAnomaly, derivedFeature, lat, lon }) => {
        const sql = `
            UPDATE batteries 
            SET soc = COALESCE($2, soc),
                temp_anomaly = COALESCE($3, temp_anomaly),
                voltage_anomaly = COALESCE($4, voltage_anomaly),
                soc_derived_feature = COALESCE($5, soc_derived_feature),
                last_lat = COALESCE($6, last_lat),
                last_lon = COALESCE($7, last_lon),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *
        `;
        const res = await query(sql, [id, soc, tempAnomaly, voltageAnomaly, derivedFeature, lat, lon]);
        return res.rows[0];
    },

    // Update Battery Health & SOH
    updateHealth: async (id, { healthStatus, soh, internalResistance, cycles }) => {
        const sql = `
            UPDATE batteries
            SET health_status = COALESCE($2, health_status),
                soh = COALESCE($3, soh),
                internal_resistance = COALESCE($4, internal_resistance),
                cycles = COALESCE($5, cycles),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *
        `;
        const res = await query(sql, [id, healthStatus, soh, internalResistance, cycles]);
        return res.rows[0];
    }
};

module.exports = batteriesModel;
