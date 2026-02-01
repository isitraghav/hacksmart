/**
 * HackSmart Express API Server
 * Main entry point
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Import routes
const apiRoutes = require('./routes/index');

// Initialize Agent Subscribers
require('./subscribers/agentSubscriber');
require('./subscribers/driverSubscriber');
const logisticsAgent = require('./services/logisticsAgent');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 1234;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
    });
    next();
});

// Mount API routes
app.use('/api', apiRoutes);

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'HackSmart API Server',
        version: '1.0.0',
        endpoints: {
            health: '/api/health',
            chargingEvents: '/api/charging-events',
            partners: '/api/partners',
            batteryLogs: '/api/battery-logs',
            osrm: '/api/osrm',
        },
        documentation: {
            chargingEvents: {
                'GET /api/charging-events': 'Get all events (filters: deviceId, startDate, endDate, minSoc, limit, offset)',
                'GET /api/charging-events/stats': 'Get aggregated statistics',
                'GET /api/charging-events/daily': 'Get daily summary (query: days)',
                'GET /api/charging-events/device/:deviceId': 'Get events by device',
                'GET /api/charging-events/:id': 'Get specific event',
            },
            partners: {
                'GET /api/partners': 'Get all partners (filters: isActive, limit, offset)',
                'GET /api/partners/stats': 'Get partner statistics',
                'GET /api/partners/active': 'Get active partners only',
                'GET /api/partners/nearby': 'Get nearby partners (query: lat, lon, radius)',
                'GET /api/partners/bounds': 'Get partners in bounds (query: minLat, maxLat, minLon, maxLon)',
                'GET /api/partners/:id': 'Get specific partner',
            },
            batteryLogs: {
                'GET /api/battery-logs': 'Get all logs (filters: batteryId, occupant, isMisplaced, includeDeleted)',
                'GET /api/battery-logs/stats': 'Get battery statistics',
                'GET /api/battery-logs/misplaced': 'Get misplaced batteries',
                'GET /api/battery-logs/occupant-summary': 'Get batteries per occupant',
                'GET /api/battery-logs/occupant/:occupant': 'Get logs by occupant',
                'GET /api/battery-logs/:batteryId': 'Get specific battery log',
                'GET /api/battery-logs/:batteryId/history': 'Get battery history',
            },
            osrm: {
                'GET /api/osrm/route': 'Get route (query: startLat, startLon, endLat, endLon, profile)',
                'POST /api/osrm/route/multi': 'Get multi-point route (body: {waypoints, profile})',
                'GET /api/osrm/nearest': 'Find nearest road point (query: lat, lon)',
                'POST /api/osrm/distance-matrix': 'Calculate distance matrix (body: {sources, destinations})',
            },
        },
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.originalUrl,
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    let localIp = 'localhost';

    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                localIp = net.address;
            }
        }
    }
    console.log(`
╔════════════════════════════════════════════════════╗
║       HackSmart API Server                         ║
╠════════════════════════════════════════════════════╣
║  Server running on http://0.0.0.0:${PORT}            ║
║  Local Network Access: http://${localIp}:${PORT}     ║
║  API endpoints available at /api                   ║
║                                                    ║
║  Endpoints:                                        ║
║    • /api/charging-events                          ║
║    • /api/partners                                 ║
║    • /api/battery-logs                             ║
║    • /api/osrm                                     ║
║    • /api/health                                   ║
╚════════════════════════════════════════════════════╝
  `);

    // Start Agent Heartbeat (Every 5 minutes)
    const HEARTBEAT_INTERVAL = 5 * 60 * 1000;
    setInterval(async () => {
        try {
            await logisticsAgent.runProtocol();
        } catch (e) {
            console.error('[Agent Heartbeat] Error:', e);
        }
    }, HEARTBEAT_INTERVAL);

});

module.exports = app;
