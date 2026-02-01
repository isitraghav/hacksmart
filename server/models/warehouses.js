const { pool, query } = require('../config/database');

/**
 * Get all warehouses
 */
const getAll = async () => {
    const result = await query('SELECT * FROM warehouses ORDER BY id ASC');
    return result.rows;
};

/**
 * Get warehouse by ID
 */
const getById = async (id) => {
    const result = await query('SELECT * FROM warehouses WHERE id = $1', [id]);
    return result.rows[0];
};

/**
 * Create a new warehouse
 */
const create = async (data) => {
    const sql = `
        INSERT INTO warehouses (
            name, latitude, longitude, 
            charged_batteries, uncharged_batteries, 
            batteries_45w, batteries_110w, toolkits
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
    `;
    const params = [
        data.name, data.latitude, data.longitude,
        data.charged_batteries || 0, data.uncharged_batteries || 0,
        data.batteries_45w || 0, data.batteries_110w || 0,
        data.toolkits || 0
    ];
    const result = await query(sql, params);
    return result.rows[0];
};

/**
 * Bulk insert warehouses
 */
const bulkInsert = async (items) => {
    if (items.length === 0) return 0;

    // Simple loop for now as this is a one-off population usually
    let count = 0;
    for (const item of items) {
        await create(item);
        count++;
    }
    return count;
};

module.exports = {
    getAll,
    getById,
    create,
    bulkInsert
};
