const express = require('express');
const router = express.Router();
const chargingEventsModel = require('../models/chargingEvents');

/**
 * GET /
 * Get all charging events with optional filtering
 * Query params: deviceId, startDate, endDate, minSoc, limit, offset
 */
router.get('/', async (req, res) => {
    try {
        const filters = {
            deviceId: req.query.deviceId,
            startDate: req.query.startDate,
            endDate: req.query.endDate,
            minSoc: req.query.minSoc ? parseInt(req.query.minSoc) : undefined,
            limit: req.query.limit ? parseInt(req.query.limit) : undefined,
            offset: req.query.offset ? parseInt(req.query.offset) : undefined,
        };
        const events = await chargingEventsModel.getAll(filters);
        res.json({ success: true, count: events.length, data: events });
    } catch (error) {
        console.error('Error fetching charging events:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /stats
 * Get aggregated statistics for charging events
 */
router.get('/stats', async (req, res) => {
    try {
        const filters = {
            deviceId: req.query.deviceId,
            startDate: req.query.startDate,
            endDate: req.query.endDate,
        };
        const stats = await chargingEventsModel.getStats(filters);
        res.json({ success: true, data: stats });
    } catch (error) {
        console.error('Error fetching charging stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /daily
 * Get daily summary of charging events
 */
router.get('/daily', async (req, res) => {
    try {
        const days = req.query.days ? parseInt(req.query.days) : 30;
        const summary = await chargingEventsModel.getDailySummary(days);
        res.json({ success: true, count: summary.length, data: summary });
    } catch (error) {
        console.error('Error fetching daily summary:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /devices
 * Get list of unique device IDs
 */
router.get('/devices', async (req, res) => {
    try {
        const devices = await chargingEventsModel.getDevices();
        res.json({ success: true, count: devices.length, data: devices });
    } catch (error) {
        console.error('Error fetching devices:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /device/:deviceId
 * Get charging events for a specific device
 */
router.get('/device/:deviceId', async (req, res) => {
    try {
        const events = await chargingEventsModel.getByDeviceId(req.params.deviceId, {
            limit: req.query.limit ? parseInt(req.query.limit) : undefined,
        });
        res.json({ success: true, count: events.length, data: events });
    } catch (error) {
        console.error('Error fetching device events:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /:id
 * Get a specific charging event by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const event = await chargingEventsModel.getById(parseInt(req.params.id));
        if (!event) {
            return res.status(404).json({ success: false, error: 'Event not found' });
        }
        res.json({ success: true, data: event });
    } catch (error) {
        console.error('Error fetching charging event:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
