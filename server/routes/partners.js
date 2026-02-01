const express = require('express');
const router = express.Router();
const partnersModel = require('../models/partners');
const batteriesModel = require('../models/batteries');
const dailySwapHistoryModel = require('../models/dailySwapHistory');

/**
 * GET /
 * Get all partners with optional filtering
 */
router.get('/', async (req, res) => {
    try {
        const filters = {
            isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
            limit: req.query.limit ? parseInt(req.query.limit) : undefined,
            offset: req.query.offset ? parseInt(req.query.offset) : undefined,
        };
        const partners = await partnersModel.getAll(filters);
        res.json({ success: true, count: partners.length, data: partners });
    } catch (error) {
        console.error('Error fetching partners:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /stats
 * Get partner statistics
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = await partnersModel.getStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        console.error('Error fetching partner stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /active
 * Get only active partners
 */
router.get('/active', async (req, res) => {
    try {
        const partners = await partnersModel.getActive();
        res.json({ success: true, count: partners.length, data: partners });
    } catch (error) {
        console.error('Error fetching active partners:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /inactive
 * Get only inactive partners
 */
router.get('/inactive', async (req, res) => {
    try {
        const partners = await partnersModel.getInactive();
        res.json({ success: true, count: partners.length, data: partners });
    } catch (error) {
        console.error('Error fetching inactive partners:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /nearby
 * Get partners near a location
 * Query params: lat, lon, radius (km, default 10)
 */
router.get('/nearby', async (req, res) => {
    try {
        const { lat, lon, radius } = req.query;
        if (!lat || !lon) {
            return res.status(400).json({ success: false, error: 'lat and lon are required' });
        }
        const partners = await partnersModel.getNearby(
            parseFloat(lat),
            parseFloat(lon),
            parseFloat(radius) || 10
        );
        res.json({ success: true, count: partners.length, data: partners });
    } catch (error) {
        console.error('Error fetching nearby partners:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /bounds
 * Get partners within a bounding box
 * Query params: minLat, maxLat, minLon, maxLon
 */
router.get('/bounds', async (req, res) => {
    try {
        const { minLat, maxLat, minLon, maxLon } = req.query;
        if (!minLat || !maxLat || !minLon || !maxLon) {
            return res.status(400).json({
                success: false,
                error: 'minLat, maxLat, minLon, and maxLon are required'
            });
        }
        const partners = await partnersModel.getInBounds(
            parseFloat(minLat),
            parseFloat(maxLat),
            parseFloat(minLon),
            parseFloat(maxLon)
        );
        res.json({ success: true, count: partners.length, data: partners });
    } catch (error) {
        console.error('Error fetching partners in bounds:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /inventory-need
 * Get partners sorted by inventory need (lowest batteries first)
 * Query: limit (default 20)
 */
router.get('/inventory-need', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const partners = await partnersModel.getByInventoryNeed(limit);
        res.json({ success: true, count: partners.length, data: partners });
    } catch (error) {
        console.error('Error fetching inventory need:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /with-surplus
 * Get partners with surplus batteries (can donate to others)
 * Query: minSurplus (default 3)
 */
router.get('/with-surplus', async (req, res) => {
    try {
        const minSurplus = parseInt(req.query.minSurplus) || 3;
        const partners = await partnersModel.getWithSurplus(minSurplus);
        res.json({ success: true, count: partners.length, data: partners });
    } catch (error) {
        console.error('Error fetching partners with surplus:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /:id
 * Get a specific partner by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const partner = await partnersModel.getById(req.params.id);
        if (!partner) {
            return res.status(404).json({ success: false, error: 'Partner not found' });
        }
        res.json({ success: true, data: partner });
    } catch (error) {
        console.error('Error fetching partner:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /:id/batteries
 * Get all batteries at a specific partner station
 */
router.get('/:id/batteries', async (req, res) => {
    try {
        const partner = await partnersModel.getById(req.params.id);
        if (!partner) {
            return res.status(404).json({ success: false, error: 'Partner not found' });
        }
        const batteries = await batteriesModel.getByStation(req.params.id);
        res.json({
            success: true,
            count: batteries.length,
            data: batteries,
            summary: {
                total: batteries.length,
                charged: batteries.filter(b => b.soc >= 80).length,
                charging: batteries.filter(b => b.soc > 20 && b.soc < 80).length,
                low: batteries.filter(b => b.soc <= 20).length
            }
        });
    } catch (error) {
        console.error('Error fetching partner batteries:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /:id/inventory
 * Get inventory status for a specific partner (for rebalancing decisions)
 */
router.get('/:id/inventory', async (req, res) => {
    try {
        const data = await partnersModel.getInventoryStatus(req.params.id);
        if (!data || !data.id) {
            return res.status(404).json({ success: false, error: 'Partner not found' });
        }
        res.json({
            success: true,
            data: {
                partnerId: req.params.id,
                fullyChargedBatteries: data.fully_charged_batteries || 0,
                totalBatteries: data.total_batteries || 0,
                totalSwaps: data.total_swaps || 0,
                avgDailySwaps: parseFloat(data.avg_daily_swaps) || 0,
                lastSwapAt: data.last_swap_at,
                needsRebalancing: data.needsRebalancing || false
            }
        });
    } catch (error) {
        console.error('Error fetching inventory status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /:id/trigger-low-inventory
 * Set all batteries at a station to low SOC (10%) for testing
 */
router.post('/:id/trigger-low-inventory', async (req, res) => {
    try {
        const partner = await partnersModel.getById(req.params.id);
        if (!partner) {
            return res.status(404).json({ success: false, error: 'Partner not found' });
        }

        // Get all batteries at this station
        const batteries = await batteriesModel.getByStation(req.params.id);

        // Update each battery to 10% SOC
        let updated = 0;
        for (const battery of batteries) {
            await batteriesModel.updateSoc(battery.id, 10);
            updated++;
        }

        // Recalculate partner metrics
        await partnersModel.updateMetrics(
            req.params.id,
            batteries.length,
            0 // No batteries are charged at 10% SOC
        );

        res.json({
            success: true,
            message: `Set ${updated} batteries to 10% SOC`,
            data: {
                partnerId: req.params.id,
                batteriesUpdated: updated,
                newChargedCount: 0,
                totalBatteries: batteries.length
            }
        });
    } catch (error) {
        console.error('Error triggering low inventory:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /:id/analytics/swaps
 * Get time series data for swaps
 */
router.get('/:id/analytics/swaps', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;
        const stationId = req.params.id;

        // Ensure station exists
        const partner = await partnersModel.getById(stationId);
        if (!partner) {
            return res.status(404).json({ success: false, error: 'Partner not found' });
        }

        // Get daily counts
        const dailyCounts = await dailySwapHistoryModel.getSwapCountArray(stationId, days);

        // Get hourly pattern (average)
        const hourlyPattern = await dailySwapHistoryModel.getHourlyPattern(stationId, days);

        res.json({
            success: true,
            data: {
                daily: dailyCounts,
                hourly: hourlyPattern,
                period: `${days} days`
            }
        });
    } catch (error) {
        console.error('Error fetching swap analytics:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
