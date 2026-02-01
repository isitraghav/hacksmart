/**
 * Congestion Detection Service
 * 
 * Detects congestion at partner stations by tracking drivers with batteries (IN_USE).
 * If a cluster of drivers with low SOC batteries are nearby a station, mark it as congested.
 * 
 * This helps predict upcoming demand spikes before they happen.
 */

const { query } = require('../config/database');
const eventBus = require('../utils/eventBus');

// Configuration
const CONFIG = {
    // Distance in km to consider a driver "nearby" a station
    NEARBY_RADIUS_KM: 1.5,
    
    // Minimum number of nearby drivers to trigger congestion
    MIN_DRIVERS_FOR_CONGESTION: 3,
    
    // SOC threshold - drivers likely need a swap soon
    LOW_SOC_THRESHOLD: 30,
    
    // Very low SOC - driver definitely needs a swap
    CRITICAL_SOC_THRESHOLD: 15,
    
    // Congestion levels
    LEVELS: {
        NONE: 'NONE',
        MODERATE: 'MODERATE',  // 3-5 drivers nearby
        HIGH: 'HIGH',          // 6-10 drivers nearby
        CRITICAL: 'CRITICAL',  // 10+ drivers nearby
    }
};

/**
 * Calculate distance between two points using Haversine formula
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Track current congestion state per station
const congestionState = new Map();

const congestionDetector = {
    /**
     * Get all drivers with their current location and battery SOC
     * Only considers batteries that are IN_USE (with drivers)
     */
    getDriversWithBatteries: async () => {
        const result = await query(`
            SELECT 
                d.id as driver_id,
                d.name as driver_name,
                d.current_latitude,
                d.current_longitude,
                d.current_battery_id,
                b.soc as battery_soc,
                b.status as battery_status
            FROM drivers d
            LEFT JOIN batteries b ON d.current_battery_id = b.id
            WHERE d.status = 'ACTIVE'
              AND d.current_latitude IS NOT NULL
              AND d.current_longitude IS NOT NULL
              AND b.status = 'IN_USE'
        `);
        
        return result.rows.map(row => ({
            driverId: row.driver_id,
            driverName: row.driver_name,
            latitude: parseFloat(row.current_latitude),
            longitude: parseFloat(row.current_longitude),
            batteryId: row.current_battery_id,
            batterySoc: parseInt(row.battery_soc) || 0,
            needsSwapSoon: parseInt(row.battery_soc) <= CONFIG.LOW_SOC_THRESHOLD,
            needsSwapNow: parseInt(row.battery_soc) <= CONFIG.CRITICAL_SOC_THRESHOLD,
        }));
    },

    /**
     * Get all partner stations with their locations
     */
    getStations: async () => {
        const result = await query(`
            SELECT id, latitude, longitude
            FROM partners
            WHERE latitude IS NOT NULL AND longitude IS NOT NULL
        `);
        
        return result.rows.map(row => ({
            id: row.id,
            latitude: parseFloat(row.latitude),
            longitude: parseFloat(row.longitude),
        }));
    },

    /**
     * Detect congestion at all stations based on driver clustering
     */
    detectCongestion: async () => {
        try {
            const drivers = await congestionDetector.getDriversWithBatteries();
            const stations = await congestionDetector.getStations();
            
            const congestionReport = [];
            
            for (const station of stations) {
                // Find drivers nearby this station
                const nearbyDrivers = drivers.filter(driver => {
                    const distance = haversineDistance(
                        driver.latitude, driver.longitude,
                        station.latitude, station.longitude
                    );
                    return distance <= CONFIG.NEARBY_RADIUS_KM;
                });
                
                // Filter to drivers who need swaps soon (low SOC)
                const driversNeedingSwap = nearbyDrivers.filter(d => d.needsSwapSoon);
                const driversNeedingSwapNow = nearbyDrivers.filter(d => d.needsSwapNow);
                
                // Determine congestion level based on drivers needing swaps
                let level = CONFIG.LEVELS.NONE;
                const count = driversNeedingSwap.length;
                
                if (count >= 10) {
                    level = CONFIG.LEVELS.CRITICAL;
                } else if (count >= 6) {
                    level = CONFIG.LEVELS.HIGH;
                } else if (count >= CONFIG.MIN_DRIVERS_FOR_CONGESTION) {
                    level = CONFIG.LEVELS.MODERATE;
                }
                
                const previousLevel = congestionState.get(station.id) || CONFIG.LEVELS.NONE;
                const levelChanged = previousLevel !== level;
                
                // Update state
                congestionState.set(station.id, level);
                
                // Emit events if congestion changed
                if (levelChanged) {
                    if (level !== CONFIG.LEVELS.NONE) {
                        eventBus.emit(eventBus.EVENTS.STATION_CONGESTION_DETECTED, {
                            stationId: station.id,
                            level,
                            previousLevel,
                            nearbyDriversTotal: nearbyDrivers.length,
                            driversNeedingSwap: count,
                            driversNeedingSwapNow: driversNeedingSwapNow.length,
                            drivers: driversNeedingSwap.map(d => ({
                                id: d.driverId,
                                soc: d.batterySoc,
                            })),
                        });
                        console.log(`[Congestion] Station ${station.id}: ${level} (${count} drivers need swap)`);
                    } else if (previousLevel !== CONFIG.LEVELS.NONE) {
                        eventBus.emit(eventBus.EVENTS.STATION_CONGESTION_CLEARED, {
                            stationId: station.id,
                            previousLevel,
                        });
                        console.log(`[Congestion] Station ${station.id}: CLEARED (was ${previousLevel})`);
                    }
                }
                
                if (level !== CONFIG.LEVELS.NONE || nearbyDrivers.length > 0) {
                    congestionReport.push({
                        stationId: station.id,
                        level,
                        nearbyDriversTotal: nearbyDrivers.length,
                        driversNeedingSwap: count,
                        driversNeedingSwapNow: driversNeedingSwapNow.length,
                        avgSoc: driversNeedingSwap.length > 0 
                            ? Math.round(driversNeedingSwap.reduce((s, d) => s + d.batterySoc, 0) / driversNeedingSwap.length)
                            : null,
                    });
                }
            }
            
            return congestionReport.filter(r => r.level !== CONFIG.LEVELS.NONE);
        } catch (error) {
            console.error('[Congestion] Detection error:', error.message);
            return [];
        }
    },

    /**
     * Check congestion for a specific station
     */
    checkStation: async (stationId) => {
        try {
            const drivers = await congestionDetector.getDriversWithBatteries();
            const stationResult = await query(`
                SELECT id, latitude, longitude FROM partners WHERE id = $1
            `, [stationId]);
            
            if (stationResult.rows.length === 0) return null;
            
            const station = {
                id: stationResult.rows[0].id,
                latitude: parseFloat(stationResult.rows[0].latitude),
                longitude: parseFloat(stationResult.rows[0].longitude),
            };
            
            const nearbyDrivers = drivers.filter(driver => {
                const distance = haversineDistance(
                    driver.latitude, driver.longitude,
                    station.latitude, station.longitude
                );
                return distance <= CONFIG.NEARBY_RADIUS_KM;
            });
            
            const driversNeedingSwap = nearbyDrivers.filter(d => d.needsSwapSoon);
            const count = driversNeedingSwap.length;
            
            let level = CONFIG.LEVELS.NONE;
            if (count >= 10) level = CONFIG.LEVELS.CRITICAL;
            else if (count >= 6) level = CONFIG.LEVELS.HIGH;
            else if (count >= CONFIG.MIN_DRIVERS_FOR_CONGESTION) level = CONFIG.LEVELS.MODERATE;
            
            return {
                stationId: station.id,
                level,
                nearbyDriversTotal: nearbyDrivers.length,
                driversNeedingSwap: count,
                drivers: nearbyDrivers.map(d => ({
                    id: d.driverId,
                    name: d.driverName,
                    soc: d.batterySoc,
                    needsSwapSoon: d.needsSwapSoon,
                    needsSwapNow: d.needsSwapNow,
                })),
            };
        } catch (error) {
            console.error(`[Congestion] Check station ${stationId} error:`, error.message);
            return null;
        }
    },

    /**
     * Get current congestion state for all stations
     */
    getCongestionState: () => {
        const state = {};
        for (const [stationId, level] of congestionState) {
            if (level !== CONFIG.LEVELS.NONE) {
                state[stationId] = level;
            }
        }
        return state;
    },

    /**
     * Handle driver location update - check if it changes congestion
     */
    handleDriverLocationUpdate: async (driverData) => {
        // Find which station this driver is near
        const stations = await congestionDetector.getStations();
        
        for (const station of stations) {
            const distance = haversineDistance(
                driverData.latitude, driverData.longitude,
                station.latitude, station.longitude
            );
            
            if (distance <= CONFIG.NEARBY_RADIUS_KM) {
                // Driver is near this station - recheck congestion
                await congestionDetector.checkStation(station.id);
                return;
            }
        }
    },
};

module.exports = { congestionDetector, CONFIG };
