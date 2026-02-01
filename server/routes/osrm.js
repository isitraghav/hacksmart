const express = require('express');
const router = express.Router();
const osrmService = require('../services/osrm');

/**
 * GET /route
 * Get a route between two points
 * Query params: startLat, startLon, endLat, endLon, profile
 */
router.get('/route', async (req, res) => {
    try {
        const { startLat, startLon, endLat, endLon, profile } = req.query;

        if (!startLat || !startLon || !endLat || !endLon) {
            return res.status(400).json({
                success: false,
                error: 'startLat, startLon, endLat, and endLon are required'
            });
        }

        const route = await osrmService.getRoute(
            parseFloat(startLon),
            parseFloat(startLat),
            parseFloat(endLon),
            parseFloat(endLat),
            { profile: profile || 'driving' }
        );

        res.json({ success: true, data: route });
    } catch (error) {
        console.error('Error fetching route:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /route/multi
 * Get a route through multiple waypoints
 * Body: { waypoints: [{lat, lon}, ...], profile }
 */
router.post('/route/multi', async (req, res) => {
    try {
        const { waypoints, profile } = req.body;

        if (!waypoints || !Array.isArray(waypoints) || waypoints.length < 2) {
            return res.status(400).json({
                success: false,
                error: 'At least 2 waypoints are required'
            });
        }

        const route = await osrmService.getMultiPointRoute(waypoints, { profile });
        res.json({ success: true, data: route });
    } catch (error) {
        console.error('Error fetching multi-point route:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /nearest
 * Find the nearest road point to a coordinate
 * Query params: lat, lon
 */
router.get('/nearest', async (req, res) => {
    try {
        const { lat, lon } = req.query;

        if (!lat || !lon) {
            return res.status(400).json({ success: false, error: 'lat and lon are required' });
        }

        const nearest = await osrmService.getNearestPoint(parseFloat(lon), parseFloat(lat));
        res.json({ success: true, data: nearest });
    } catch (error) {
        console.error('Error finding nearest point:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /distance-matrix
 * Calculate distance matrix between points
 * Body: { sources: [{lat, lon}], destinations: [{lat, lon}] }
 */
router.post('/distance-matrix', async (req, res) => {
    try {
        const { sources, destinations } = req.body;

        if (!sources || !destinations || !Array.isArray(sources) || !Array.isArray(destinations)) {
            return res.status(400).json({
                success: false,
                error: 'sources and destinations arrays are required'
            });
        }

        const matrix = await osrmService.getDistanceMatrix(sources, destinations);
        res.json({ success: true, data: matrix });
    } catch (error) {
        console.error('Error calculating distance matrix:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
