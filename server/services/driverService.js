const partnersModel = require('../models/partners');
const osrmService = require('./osrm');

const driversModel = require('../models/drivers');
const batteriesModel = require('../models/batteries');

// In-memory state for active driver routes
// Map<driverId, { stationId, driverLat, driverLon, timestamp }>
const activeRoutes = new Map();

const driverService = {
    /**
     * Find the best station for a driver
     * Logic: Nearest station with at least 1 charged battery (prefer > 2)
     */
    findBestStation: async (lat, lon, radiusKm = 20) => {
        const partners = await partnersModel.getNearby(lat, lon, radiusKm);

        // Filter for active stations with stock
        const candidates = partners.filter(p =>
            p.is_active_dsk &&
            p.fully_charged_batteries > 0
        );

        if (candidates.length === 0) return null;

        // Score candidates: 
        // Lower distance is better. Higher stock is better.
        // Simple heuristic: Score = Distance - (Stock * 0.5)
        // This means every battery counts as "0.5 km closer"
        const scored = candidates.map(p => ({
            ...p,
            score: p.distance_km - (p.fully_charged_batteries * 0.5)
        }));

        // Sort by score (ascending)
        scored.sort((a, b) => a.score - b.score);

        return scored[0];
    },

    /**
     * Register a driver starting a route
     */
    startRoute: async (driverId, stationId, lat, lon) => {
        const station = await partnersModel.getById(stationId);
        if (!station) throw new Error('Station not found');

        // [NEW] Ensure Driver Exists
        let driver = await driversModel.getById(driverId);
        if (!driver) {
            // Auto-signup for demo
            driver = await driversModel.create({
                id: driverId,
                name: 'Driver ' + driverId,
                phone: '0000000000',
                lat, lon
            });
        }

        // Update Driver Location
        await driversModel.updateLocation(driverId, lat, lon);

        activeRoutes.set(driverId, {
            stationId,
            driverLat: lat,
            driverLon: lon,
            timestamp: Date.now()
        });

        console.log(`[DriverService] Driver ${driverId} started route to ${stationId}`);
        return { success: true, message: 'Route started' };
    },

    /**
     * Complete a route (e.g. swap done)
     */
    endRoute: (driverId) => {
        if (activeRoutes.has(driverId)) {
            activeRoutes.delete(driverId);
            console.log(`[DriverService] Driver ${driverId} ended route.`);
        }
    },

    /**
     * Check if drivers heading to this station need rerouting
     * Called when station stock updates
     */
    checkReroute: async (stationId, currentStock) => {
        // Only care if stock is critical (0 or 1)
        if (currentStock > 1) return;

        console.log(`[DriverService] Checking reroutes for station ${stationId} (Stock: ${currentStock})...`);

        // Find affected drivers
        const affectedDriverIds = [];
        for (const [dId, route] of activeRoutes.entries()) {
            if (route.stationId === stationId) {
                affectedDriverIds.push(dId);
            }
        }

        if (affectedDriverIds.length === 0) return;

        // Reroute each driver
        for (const driverId of affectedDriverIds) {
            const route = activeRoutes.get(driverId);
            const newBest = await driverService.findBestStation(route.driverLat, route.driverLon, 50);

            if (newBest && newBest.id !== stationId) {
                // Update route
                activeRoutes.set(driverId, {
                    ...route,
                    stationId: newBest.id
                });

                // In a real app, this would use WebSockets/Push
                console.log(`⚠️ [REROUTE] Driver ${driverId} rerouted from ${stationId} to ${newBest.id} (Stock: ${newBest.fully_charged_batteries}, Dist: ${newBest.distance_km.toFixed(1)}km)`);
            } else {
                console.log(`⚠️ [REROUTE FAILED] No better station found for Driver ${driverId}`);
            }
        }
    }
};

module.exports = driverService;
