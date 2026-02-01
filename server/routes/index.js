const express = require('express');
const router = express.Router();

const partnersRoutes = require('./partners');
const chargingEventsRoutes = require('./chargingEvents');
const batteryLogsRoutes = require('./batteryLogs');
const osrmRoutes = require('./osrm');
const navigationRoutes = require('./navigation');
const warehousesRoutes = require('./warehouses');
const logisticsRoutes = require('./logistics');
const driverRoutes = require('./driver');
const authRoutes = require('./auth');
const notificationsRoutes = require('./notifications');
const agentRoutes = require('./agent');

router.use('/partners', partnersRoutes);
router.use('/charging-events', chargingEventsRoutes);
router.use('/battery-logs', batteryLogsRoutes);
router.use('/osrm', osrmRoutes);
router.use('/navigation', navigationRoutes);
router.use('/warehouses', warehousesRoutes);
router.use('/logistics', logisticsRoutes);
router.use('/driver', driverRoutes);
router.use('/auth', authRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/agent', agentRoutes);

/**
 * GET /health
 */
router.get('/health', (req, res) => {
    res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
    });
});

module.exports = router;
