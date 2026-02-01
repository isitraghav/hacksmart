const { query } = require('../config/database');

/**
 * Partners Model
 * Handles all database operations for partners data
 */

/**
 * Get all partners with optional filtering
 * @param {Object} filters - Optional filters
 * @returns {Promise<Array>} List of partners
 */
const { buildWhereClause } = require('../utils/dbUtils');

const getAll = async (filters = {}) => {
  // Map specific filter keys to DB columns if names differ
  const dbFilters = {};
  if (filters.isActive !== undefined) dbFilters.is_active_dsk = filters.isActive;

  const { where, params, nextIndex } = buildWhereClause(dbFilters);
  let sql = `SELECT * FROM partners ${where} ORDER BY id`;

  let paramIndex = nextIndex;

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
 * Get a single partner by ID
 * @param {string} id - Partner ID
 * @returns {Promise<Object|null>} Partner or null
 */
const getById = async (id) => {
  const result = await query('SELECT * FROM partners WHERE id = $1', [id]);
  return result.rows[0] || null;
};

/**
 * Get active partners only
 * @returns {Promise<Array>} List of active partners
 */
const getActive = async () => {
  const result = await query('SELECT * FROM partners WHERE is_active_dsk = true ORDER BY id');
  return result.rows;
};

/**
 * Get inactive partners only
 * @returns {Promise<Array>} List of inactive partners
 */
const getInactive = async () => {
  const result = await query('SELECT * FROM partners WHERE is_active_dsk = false ORDER BY id');
  return result.rows;
};

/**
 * Get partners near a location (within radius)
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {number} radiusKm - Radius in kilometers
 * @returns {Promise<Array>} List of nearby partners with distance
 */
const getNearby = async (lat, lon, radiusKm = 10) => {
  const sql = `
    SELECT *,
      (6371 * acos(
        cos(radians($1)) * cos(radians(latitude)) * 
        cos(radians(longitude) - radians($2)) + 
        sin(radians($1)) * sin(radians(latitude))
      )) AS distance_km
    FROM partners
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
      AND (6371 * acos(
        cos(radians($1)) * cos(radians(latitude)) * 
        cos(radians(longitude) - radians($2)) + 
        sin(radians($1)) * sin(radians(latitude))
      )) < $3
    ORDER BY distance_km
  `;
  const result = await query(sql, [lat, lon, radiusKm]);
  return result.rows;
};

/**
 * Get partners within a bounding box
 * @param {number} minLat - Minimum latitude
 * @param {number} maxLat - Maximum latitude
 * @param {number} minLon - Minimum longitude
 * @param {number} maxLon - Maximum longitude
 * @returns {Promise<Array>} List of partners in area
 */
const getInBounds = async (minLat, maxLat, minLon, maxLon) => {
  const sql = `
    SELECT * FROM partners
    WHERE latitude BETWEEN $1 AND $2
      AND longitude BETWEEN $3 AND $4
    ORDER BY id
  `;
  const result = await query(sql, [minLat, maxLat, minLon, maxLon]);
  return result.rows;
};

/**
 * Get partner statistics
 * @returns {Promise<Object>} Statistics object
 */
const getStats = async () => {
  const sql = `
    SELECT 
      COUNT(*) as total_partners,
      COUNT(*) FILTER (WHERE is_active_dsk = true) as active_partners,
      COUNT(*) FILTER (WHERE is_active_dsk = false) as inactive_partners,
      AVG(latitude) as avg_lat,
      AVG(longitude) as avg_lon
    FROM partners
  `;
  const result = await query(sql);
  return result.rows[0];
};

/**
 * Create a new partner
 * @param {Object} partner - Partner data
 * @returns {Promise<Object>} Created partner
 */
const create = async (partner) => {
  const sql = `
    INSERT INTO partners (id, latitude, longitude, is_active_dsk, total_batteries, fully_charged_batteries)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;
  const params = [
    partner.id,
    partner.latitude,
    partner.longitude,
    partner.is_active_dsk || false,
    partner.total_batteries || 0,
    partner.fully_charged_batteries || 0,
  ];

  const result = await query(sql, params);
  return result.rows[0];
};

const eventBus = require('../utils/eventBus');

/**
 * Update partner battery metrics
 * @param {string} id - Partner ID
 * @param {number} total - Total batteries
 * @param {number} charged - Fully charged batteries
 * @returns {Promise<Object|null>} Updated partner
 */
const updateMetrics = async (id, total, charged) => {
  const sql = `
    UPDATE partners 
    SET total_batteries = $2, fully_charged_batteries = $3 
    WHERE id = $1 
    RETURNING *
  `;
  const result = await query(sql, [id, total, charged]);

  if (result.rows[0]) {
    eventBus.emit(eventBus.EVENTS.PARTNER_STOCK_UPDATE, result.rows[0]);
  }

  return result.rows[0] || null;
};

/**
 * Update partner demand metrics
 * @param {string} id - Partner ID
 * @param {number} avgSwaps - Average daily swaps
 * @returns {Promise<Object|null>} Updated partner
 */
const updateDemand = async (id, avgSwaps) => {
  const sql = `
    UPDATE partners SET avg_daily_swaps = $1 WHERE id = $2 RETURNING *
  `;
  const result = await query(sql, [avgSwaps, id]);

  if (result.rows[0]) {
    eventBus.emit(eventBus.EVENTS.PARTNER_DEMAND_UPDATE, result.rows[0]);
  }

  return result.rows[0] || null;
};

/**
 * Update partner status
 * @param {string} id - Partner ID
 * @param {boolean} isActive - New active status
 * @returns {Promise<Object|null>} Updated partner or null
 */
const updateStatus = async (id, isActive) => {
  const sql = `
    UPDATE partners SET is_active_dsk = $2 WHERE id = $1 RETURNING *
  `;
  const result = await query(sql, [id, isActive]);
  return result.rows[0] || null;
};

/**
 * Bulk insert partners
 * @param {Array} partners - Array of partner objects
 * @returns {Promise<number>} Number of inserted rows
 */
const bulkInsert = async (partners) => {
  if (partners.length === 0) return 0;

  const values = partners.map((p, i) => {
    const base = i * 6;
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
  }).join(', ');

  const params = partners.flatMap(p => [
    p.id,
    p.latitude,
    p.longitude,
    p.is_active_dsk || false,
    p.total_batteries || 0,
    p.fully_charged_batteries || 0,
  ]);

  const sql = `
    INSERT INTO partners (id, latitude, longitude, is_active_dsk, total_batteries, fully_charged_batteries)
    VALUES ${values}
    ON CONFLICT (id) DO UPDATE SET
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      is_active_dsk = EXCLUDED.is_active_dsk,
      total_batteries = EXCLUDED.total_batteries,
      fully_charged_batteries = EXCLUDED.fully_charged_batteries
  `;

  const result = await query(sql, params);
  return result.rowCount;
};

const incrementTotalSwaps = async (id) => {
  // Increment total_swaps and recalculate avg_daily_swaps based on days since creation
  const sql = `
    UPDATE partners 
    SET total_swaps = COALESCE(total_swaps, 0) + 1,
        last_swap_at = CURRENT_TIMESTAMP,
        avg_daily_swaps = CASE 
          WHEN EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at)) / 86400 >= 1 
          THEN ROUND((COALESCE(total_swaps, 0) + 1)::DECIMAL / GREATEST(1, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at)) / 86400))
          ELSE COALESCE(total_swaps, 0) + 1
        END
    WHERE id = $1 
    RETURNING *
  `;
  const result = await query(sql, [id]);
  return result.rows[0] || null;
};

/**
 * Get inventory status for a partner (for rebalancing decisions)
 * @param {string} id - Partner ID
 * @returns {Promise<Object>} Inventory data with availability
 */
const getInventoryStatus = async (id) => {
  const result = await query(`
    SELECT id, total_swaps, last_swap_at, avg_daily_swaps,
           fully_charged_batteries, total_batteries
    FROM partners WHERE id = $1
  `, [id]);
  const data = result.rows[0] || { total_swaps: 0, fully_charged_batteries: 0, total_batteries: 0 };
  data.needsRebalancing = data.fully_charged_batteries === 0;
  return data;
};

/**
 * Get partners sorted by need (fewest charged batteries first)
 * @param {number} limit - Max results
 * @returns {Promise<Array>} Partners sorted by inventory need
 */
const getByInventoryNeed = async (limit = 20) => {
  const sql = `
    SELECT id, latitude, longitude, total_batteries, fully_charged_batteries, 
           total_swaps, avg_daily_swaps, last_swap_at, zone
    FROM partners 
    WHERE is_active_dsk = true
    ORDER BY fully_charged_batteries ASC, avg_daily_swaps DESC
    LIMIT $1
  `;
  const result = await query(sql, [limit]);
  return result.rows;
};

/**
 * Get partners with surplus batteries (for donation to others)
 * @param {number} minSurplus - Minimum surplus after keeping 5
 * @returns {Promise<Array>} Partners with surplus
 */
const getWithSurplus = async (minSurplus = 3) => {
  const sql = `
    SELECT id, latitude, longitude, total_batteries, fully_charged_batteries,
           (fully_charged_batteries - 5) as surplus, zone
    FROM partners 
    WHERE is_active_dsk = true
      AND fully_charged_batteries > 5 + $1
    ORDER BY fully_charged_batteries DESC
  `;
  const result = await query(sql, [minSurplus]);
  return result.rows;
};

module.exports = {
  getAll,
  getById,
  getActive,
  getInactive,
  getNearby,
  getInBounds,
  getStats,
  create,
  updateStatus,
  updateMetrics,
  incrementTotalSwaps,
  bulkInsert,
  getInventoryStatus,
  getByInventoryNeed,
  getWithSurplus,
};
