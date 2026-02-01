const { query } = require('../config/database');

/**
 * Charging Events Model
 * Handles all database operations for charging events data
 */

/**
 * Get all charging events with optional filtering
 * @param {Object} filters - Optional filters
 * @returns {Promise<Array>} List of charging events
 */
const getAll = async (filters = {}) => {
    let sql = 'SELECT * FROM charging_events WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (filters.deviceId) {
        sql += ` AND device_id = $${paramIndex++}`;
        params.push(filters.deviceId);
    }

    if (filters.startDate) {
        sql += ` AND date >= $${paramIndex++}`;
        params.push(filters.startDate);
    }

    if (filters.endDate) {
        sql += ` AND date <= $${paramIndex++}`;
        params.push(filters.endDate);
    }

    if (filters.minSoc) {
        sql += ` AND soc >= $${paramIndex++}`;
        params.push(filters.minSoc);
    }

    sql += ' ORDER BY ts DESC';

    if (filters.limit) {
        sql += ` LIMIT $${paramIndex++}`;
        params.push(filters.limit);
    }

    if (filters.offset) {
        sql += ` OFFSET $${paramIndex++}`;
        params.push(filters.offset);
    }

    const result = await query(sql, params);
    return result.rows;
};

/**
 * Get a single charging event by ID
 * @param {number} id - Event ID
 * @returns {Promise<Object|null>} Charging event or null
 */
const getById = async (id) => {
    const result = await query('SELECT * FROM charging_events WHERE id = $1', [id]);
    return result.rows[0] || null;
};

/**
 * Get charging events by device ID
 * @param {string} deviceId - Device ID
 * @param {Object} options - Additional options
 * @returns {Promise<Array>} List of charging events
 */
const getByDeviceId = async (deviceId, options = {}) => {
    let sql = 'SELECT * FROM charging_events WHERE device_id = $1 ORDER BY ts DESC';
    const params = [deviceId];

    if (options.limit) {
        sql += ' LIMIT $2';
        params.push(options.limit);
    }

    const result = await query(sql, params);
    return result.rows;
};

/**
 * Get charging events by location (within radius)
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {number} radiusKm - Radius in kilometers
 * @returns {Promise<Array>} List of charging events
 */
const getByLocation = async (lat, lon, radiusKm = 10) => {
    // Using Haversine formula approximation
    const sql = `
    SELECT *, 
      (6371 * acos(cos(radians($1)) * cos(radians(lat)) * cos(radians(lon) - radians($2)) + sin(radians($1)) * sin(radians(lat)))) AS distance
    FROM charging_events
    WHERE lat IS NOT NULL AND lon IS NOT NULL
    HAVING distance < $3
    ORDER BY distance
  `;
    const result = await query(sql, [lat, lon, radiusKm]);
    return result.rows;
};

/**
 * Get aggregated statistics for charging events
 * @param {Object} filters - Optional filters
 * @returns {Promise<Object>} Statistics object
 */
const getStats = async (filters = {}) => {
    let whereClause = '1=1';
    const params = [];
    let paramIndex = 1;

    if (filters.deviceId) {
        whereClause += ` AND device_id = $${paramIndex++}`;
        params.push(filters.deviceId);
    }

    if (filters.startDate) {
        whereClause += ` AND date >= $${paramIndex++}`;
        params.push(filters.startDate);
    }

    if (filters.endDate) {
        whereClause += ` AND date <= $${paramIndex++}`;
        params.push(filters.endDate);
    }

    const sql = `
    SELECT 
      COUNT(*) as total_events,
      COUNT(DISTINCT device_id) as unique_devices,
      AVG(soc) as avg_soc,
      MIN(soc) as min_soc,
      MAX(soc) as max_soc,
      MIN(date) as earliest_date,
      MAX(date) as latest_date
    FROM charging_events
    WHERE ${whereClause}
  `;

    const result = await query(sql, params);
    return result.rows[0];
};

/**
 * Get daily charging summary
 * @param {number} days - Number of days to include
 * @returns {Promise<Array>} Daily summaries
 */
const getDailySummary = async (days = 30) => {
    const sql = `
    SELECT 
      date,
      COUNT(*) as event_count,
      COUNT(DISTINCT device_id) as unique_devices,
      AVG(soc) as avg_soc
    FROM charging_events
    WHERE date >= CURRENT_DATE - INTERVAL '${days} days'
    GROUP BY date
    ORDER BY date DESC
  `;

    const result = await query(sql);
    return result.rows;
};

/**
 * Get list of unique device IDs
 * @returns {Promise<Array>} List of device IDs
 */
const getDevices = async () => {
    const result = await query('SELECT DISTINCT device_id FROM charging_events ORDER BY device_id');
    return result.rows.map(row => row.device_id);
};

/**
 * Create a new charging event
 * @param {Object} event - Event data
 * @returns {Promise<Object>} Created event
 */
const create = async (event) => {
    const sql = `
    INSERT INTO charging_events (date, device_id, ts, lat, lon, soc, discharging_time, charge_start_time)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `;
    const params = [
        event.date,
        event.device_id,
        event.ts,
        event.lat,
        event.lon,
        event.soc,
        event.discharging_time,
        event.charge_start_time,
    ];

    const result = await query(sql, params);
    return result.rows[0];
};

/**
 * Bulk insert charging events
 * @param {Array} events - Array of event objects
 * @returns {Promise<number>} Number of inserted rows
 */
const bulkInsert = async (events) => {
    if (events.length === 0) return 0;

    const values = events.map((e, i) => {
        const base = i * 8;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
    }).join(', ');

    const params = events.flatMap(e => [
        e.date,
        e.device_id,
        e.ts,
        e.lat,
        e.lon,
        e.soc,
        e.discharging_time,
        e.charge_start_time,
    ]);

    const sql = `
    INSERT INTO charging_events (date, device_id, ts, lat, lon, soc, discharging_time, charge_start_time)
    VALUES ${values}
  `;

    const result = await query(sql, params);
    return result.rowCount;
};

module.exports = {
    getAll,
    getById,
    getByDeviceId,
    getByLocation,
    getStats,
    getDailySummary,
    getDevices,
    create,
    bulkInsert,
};
