const { query } = require('../config/database');

/**
 * Battery Logs Model
 * Handles all database operations for battery logs data
 */

/**
 * Get all battery logs with optional filtering
 * @param {Object} filters - Optional filters
 * @returns {Promise<Array>} List of battery logs
 */
const getAll = async (filters = {}) => {
    let sql = 'SELECT * FROM battery_logs WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (filters.batteryId) {
        sql += ` AND battery_id = $${paramIndex++}`;
        params.push(filters.batteryId);
    }

    if (filters.occupant) {
        sql += ` AND occupant = $${paramIndex++}`;
        params.push(filters.occupant);
    }

    if (filters.isMisplaced !== undefined) {
        sql += ` AND is_misplaced = $${paramIndex++}`;
        params.push(filters.isMisplaced);
    }

    if (filters.includeDeleted !== true) {
        sql += ' AND deleted_at IS NULL';
    }

    sql += ' ORDER BY created_at DESC';

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
 * Get a single battery log by battery ID
 * @param {string} batteryId - Battery ID
 * @returns {Promise<Object|null>} Battery log or null
 */
const getByBatteryId = async (batteryId) => {
    const result = await query(
        'SELECT * FROM battery_logs WHERE battery_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1',
        [batteryId]
    );
    return result.rows[0] || null;
};

/**
 * Get all battery logs for a specific battery (history)
 * @param {string} batteryId - Battery ID
 * @returns {Promise<Array>} List of battery logs
 */
const getBatteryHistory = async (batteryId) => {
    const result = await query(
        'SELECT * FROM battery_logs WHERE battery_id = $1 ORDER BY created_at DESC',
        [batteryId]
    );
    return result.rows;
};

/**
 * Get battery logs by occupant
 * @param {string} occupant - Occupant ID
 * @returns {Promise<Array>} List of battery logs
 */
const getByOccupant = async (occupant) => {
    const result = await query(
        'SELECT * FROM battery_logs WHERE occupant = $1 AND deleted_at IS NULL ORDER BY created_at DESC',
        [occupant]
    );
    return result.rows;
};

/**
 * Get all misplaced batteries
 * @returns {Promise<Array>} List of misplaced battery logs
 */
const getMisplaced = async () => {
    const result = await query(
        'SELECT * FROM battery_logs WHERE is_misplaced = true AND deleted_at IS NULL ORDER BY created_at DESC'
    );
    return result.rows;
};

/**
 * Get correctly placed batteries
 * @returns {Promise<Array>} List of correctly placed battery logs
 */
const getCorrectlyPlaced = async () => {
    const result = await query(
        'SELECT * FROM battery_logs WHERE is_misplaced = false AND deleted_at IS NULL ORDER BY created_at DESC'
    );
    return result.rows;
};

/**
 * Get battery statistics
 * @returns {Promise<Object>} Statistics object
 */
const getStats = async () => {
    const sql = `
    SELECT 
      COUNT(*) as total_logs,
      COUNT(DISTINCT battery_id) as unique_batteries,
      COUNT(DISTINCT occupant) as unique_occupants,
      COUNT(*) FILTER (WHERE is_misplaced = true AND deleted_at IS NULL) as misplaced_count,
      COUNT(*) FILTER (WHERE is_misplaced = false AND deleted_at IS NULL) as correctly_placed_count,
      COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) as deleted_count
    FROM battery_logs
  `;
    const result = await query(sql);
    return result.rows[0];
};

/**
 * Get occupant summary (batteries per occupant)
 * @returns {Promise<Array>} Occupant summaries
 */
const getOccupantSummary = async () => {
    const sql = `
    SELECT 
      occupant,
      COUNT(*) as battery_count,
      COUNT(*) FILTER (WHERE is_misplaced = true) as misplaced_count
    FROM battery_logs
    WHERE deleted_at IS NULL
    GROUP BY occupant
    ORDER BY battery_count DESC
  `;
    const result = await query(sql);
    return result.rows;
};

/**
 * Get list of unique occupants
 * @returns {Promise<Array>} List of occupants
 */
const getOccupants = async () => {
    const result = await query('SELECT DISTINCT occupant FROM battery_logs WHERE deleted_at IS NULL ORDER BY occupant');
    return result.rows.map(row => row.occupant);
};

/**
 * Create a new battery log
 * @param {Object} log - Log data
 * @returns {Promise<Object>} Created log
 */
const create = async (log) => {
    const sql = `
    INSERT INTO battery_logs (battery_id, occupant, is_misplaced, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;
    const now = new Date();
    const params = [
        log.battery_id,
        log.occupant,
        log.is_misplaced || false,
        log.created_at || now,
        log.updated_at || now,
    ];

    const result = await query(sql, params);
    return result.rows[0];
};

/**
 * Update misplaced status
 * @param {string} batteryId - Battery ID
 * @param {boolean} isMisplaced - New misplaced status
 * @returns {Promise<Object|null>} Updated log or null
 */
const updateMisplacedStatus = async (batteryId, isMisplaced) => {
    const sql = `
    UPDATE battery_logs 
    SET is_misplaced = $2, updated_at = CURRENT_TIMESTAMP 
    WHERE battery_id = $1 AND deleted_at IS NULL
    RETURNING *
  `;
    const result = await query(sql, [batteryId, isMisplaced]);
    return result.rows[0] || null;
};

/**
 * Soft delete a battery log
 * @param {string} batteryId - Battery ID
 * @returns {Promise<Object|null>} Deleted log or null
 */
const softDelete = async (batteryId) => {
    const sql = `
    UPDATE battery_logs 
    SET deleted_at = CURRENT_TIMESTAMP 
    WHERE battery_id = $1 AND deleted_at IS NULL
    RETURNING *
  `;
    const result = await query(sql, [batteryId]);
    return result.rows[0] || null;
};

/**
 * Bulk insert battery logs
 * @param {Array} logs - Array of log objects
 * @returns {Promise<number>} Number of inserted rows
 */
const bulkInsert = async (logs) => {
    if (logs.length === 0) return 0;

    const values = logs.map((l, i) => {
        const base = i * 5;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
    }).join(', ');

    const params = logs.flatMap(l => [
        l.battery_id,
        l.occupant,
        l.is_misplaced || false,
        l.created_at,
        l.updated_at,
    ]);

    const sql = `
    INSERT INTO battery_logs (battery_id, occupant, is_misplaced, created_at, updated_at)
    VALUES ${values}
  `;

    const result = await query(sql, params);
    return result.rowCount;
};

module.exports = {
    getAll,
    getByBatteryId,
    getBatteryHistory,
    getByOccupant,
    getMisplaced,
    getCorrectlyPlaced,
    getStats,
    getOccupantSummary,
    getOccupants,
    create,
    updateMisplacedStatus,
    softDelete,
    bulkInsert,
};
