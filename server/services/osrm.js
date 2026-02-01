/**
 * OSRM Service - Handles routing requests via OSRM backend
 */

const OSRM_BASE_URL = process.env.OSRM_BASE_URL || 'https://router.project-osrm.org';

/**
 * Get a route between two points
 * @param {number} startLon - Starting longitude
 * @param {number} startLat - Starting latitude
 * @param {number} endLon - Ending longitude
 * @param {number} endLat - Ending latitude
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Route response
 */
const fetchOSRM = async (url) => {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`OSRM request failed: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`OSRM Error (${url}):`, error);
        throw error;
    }
};

const getRoute = async (startLon, startLat, endLon, endLat, options = {}) => {
    const {
        profile = 'driving',
        alternatives = false,
        steps = true,
        geometries = 'geojson',
        overview = 'full',
    } = options;

    const coords = `${startLon},${startLat};${endLon},${endLat}`;
    const url = `${OSRM_BASE_URL}/route/v1/${profile}/${coords}?alternatives=${alternatives}&steps=${steps}&geometries=${geometries}&overview=${overview}`;
    return await fetchOSRM(url);
};

const getMultiPointRoute = async (waypoints, options = {}) => {
    const {
        profile = 'driving',
        steps = true,
        geometries = 'geojson',
        overview = 'full',
    } = options;

    const coords = waypoints.map(wp => `${wp.lon},${wp.lat}`).join(';');
    const url = `${OSRM_BASE_URL}/route/v1/${profile}/${coords}?steps=${steps}&geometries=${geometries}&overview=${overview}`;
    return await fetchOSRM(url);
};

const getNearestPoint = async (lon, lat, options = {}) => {
    const { profile = 'driving', number = 1 } = options;
    const url = `${OSRM_BASE_URL}/nearest/v1/${profile}/${lon},${lat}?number=${number}`;
    return await fetchOSRM(url);
};

const getDistanceMatrix = async (sources, destinations, options = {}) => {
    const { profile = 'driving' } = options;

    const allPoints = [...sources, ...destinations];
    const coords = allPoints.map(p => `${p.lon},${p.lat}`).join(';');
    const sourceIndices = sources.map((_, i) => i).join(';');
    const destIndices = destinations.map((_, i) => i + sources.length).join(';');

    const url = `${OSRM_BASE_URL}/table/v1/${profile}/${coords}?sources=${sourceIndices}&destinations=${destIndices}`;
    return await fetchOSRM(url);
};

module.exports = {
    getRoute,
    getMultiPointRoute,
    getNearestPoint,
    getDistanceMatrix,
};
