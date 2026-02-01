const express = require('express');
const router = express.Router();
const navigationService = require('../services/navigation');

/**
 * POST /plan
 * Plan a route with battery swap stops
 * Body: { startLat, startLon, endLat, endLon }
 */
router.post('/plan', async (req, res) => {
    try {
        const { startLat, startLon, endLat, endLon } = req.body;

        if (!startLat || !startLon || !endLat || !endLon) {
            return res.status(400).json({
                success: false,
                error: 'startLat, startLon, endLat, and endLon are required'
            });
        }

        const plan = await navigationService.planRoute(
            parseFloat(startLat),
            parseFloat(startLon),
            parseFloat(endLat),
            parseFloat(endLon)
        );

        res.json({ success: true, data: plan });
    } catch (error) {
        console.error('Error planning route:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
