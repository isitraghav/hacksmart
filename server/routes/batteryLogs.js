const express = require('express');
const router = express.Router();
const batteryLogsModel = require('../models/batteryLogs');
const batteryHealthService = require('../services/batteryHealthService');

/**
 * POST /telemetry
 * Receive battery telemetry and trigger health analysis
 */
router.post('/telemetry', async (req, res) => {
    try {
        const { batteryId, ...telemetry } = req.body;
        if (!batteryId) return res.status(400).json({ success: false, error: 'batteryId required' });

        const result = await batteryHealthService.analyzeTelemetry(batteryId, telemetry);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Error processing telemetry:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /
 * Get all battery logs with optional filtering
 */
router.get('/', async (req, res) => {
    try {
        const filters = {
            batteryId: req.query.batteryId,
            occupant: req.query.occupant,
            isMisplaced: req.query.isMisplaced !== undefined ? req.query.isMisplaced === 'true' : undefined,
            includeDeleted: req.query.includeDeleted === 'true',
            limit: req.query.limit ? parseInt(req.query.limit) : undefined,
            offset: req.query.offset ? parseInt(req.query.offset) : undefined,
        };
        const logs = await batteryLogsModel.getAll(filters);
        res.json({ success: true, count: logs.length, data: logs });
    } catch (error) {
        console.error('Error fetching battery logs:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /stats
 * Get battery log statistics
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = await batteryLogsModel.getStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        console.error('Error fetching battery stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /misplaced
 * Get all misplaced batteries
 */
router.get('/misplaced', async (req, res) => {
    try {
        const logs = await batteryLogsModel.getMisplaced();
        res.json({ success: true, count: logs.length, data: logs });
    } catch (error) {
        console.error('Error fetching misplaced batteries:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /occupant-summary
 * Get summary of batteries per occupant
 */
router.get('/occupant-summary', async (req, res) => {
    try {
        const summary = await batteryLogsModel.getOccupantSummary();
        res.json({ success: true, count: summary.length, data: summary });
    } catch (error) {
        console.error('Error fetching occupant summary:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /occupants
 * Get list of unique occupants
 */
router.get('/occupants', async (req, res) => {
    try {
        const occupants = await batteryLogsModel.getOccupants();
        res.json({ success: true, count: occupants.length, data: occupants });
    } catch (error) {
        console.error('Error fetching occupants:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /occupant/:occupant
 * Get battery logs for a specific occupant
 */
router.get('/occupant/:occupant', async (req, res) => {
    try {
        const logs = await batteryLogsModel.getByOccupant(req.params.occupant);
        res.json({ success: true, count: logs.length, data: logs });
    } catch (error) {
        console.error('Error fetching occupant logs:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /:batteryId
 * Get logs for a specific battery
 */
router.get('/:batteryId', async (req, res) => {
    try {
        const log = await batteryLogsModel.getByBatteryId(req.params.batteryId);
        if (!log) {
            return res.status(404).json({ success: false, error: 'Battery log not found' });
        }
        res.json({ success: true, data: log });
    } catch (error) {
        console.error('Error fetching battery log:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /:batteryId/history
 * Get full history for a specific battery
 */
router.get('/:batteryId/history', async (req, res) => {
    try {
        const logs = await batteryLogsModel.getBatteryHistory(req.params.batteryId);
        res.json({ success: true, count: logs.length, data: logs });
    } catch (error) {
        console.error('Error fetching battery history:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
