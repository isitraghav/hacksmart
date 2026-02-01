/**
 * Navigation Service
 * Handles route planning with EV battery constraints and smart station load balancing
 */

const osrmService = require('./osrm');
const partnersModel = require('../models/partners');

const MAX_RANGE_KM = 10; // Max range on 100% charge
const SAFE_BUFFER_KM = 5; // Buffer to ensure we reach station
const EFFECTIVE_RANGE = MAX_RANGE_KM - SAFE_BUFFER_KM; // Target range for next stop

/**
 * Plan a route with battery swap stops
 */
const planRoute = async (startLat, startLon, endLat, endLon) => {
    // 1. Get initial direct route
    const directRoute = await osrmService.getRoute(startLon, startLat, endLon, endLat);
    const totalDistanceKm = directRoute.routes[0].distance / 1000;

    // If reachable directly, return direct route
    if (totalDistanceKm <= EFFECTIVE_RANGE) {
        return {
            type: 'direct',
            totalDistanceKm,
            stops: [],
            route: directRoute.routes[0]
        };
    }

    // 2. If not reachable, we need to find stops
    const waypoints = [];
    let currentLat = startLat;
    let currentLon = startLon;
    let remainingDistance = totalDistanceKm;
    let iteration = 0;
    const MAX_STOPS = 10;

    while (remainingDistance > EFFECTIVE_RANGE && iteration < MAX_STOPS) {
        iteration++;

        // Target point along ideal line
        const ratio = EFFECTIVE_RANGE / remainingDistance;
        const targetLat = currentLat + (endLat - currentLat) * ratio;
        const targetLon = currentLon + (endLon - currentLon) * ratio;

        // Find nearby ACTIVE stations
        // We use a larger radius (15km) to give us choices for load balancing
        const nearbyPartners = await partnersModel.getNearby(targetLat, targetLon, 15);
        const activePartners = nearbyPartners.filter(p => p.is_active_dsk);

        if (activePartners.length === 0) {
            throw new Error(`No swap stations found reachable from current location (at ~${EFFECTIVE_RANGE}km mark).`);
        }

        // --- SMART SCORING LOGIC ---
        // Score = DistanceCost + LoadPenalty
        const bestStation = activePartners.reduce((best, candidate) => {
            const dist = parseFloat(candidate.distance_km);
            const batteries = candidate.fully_charged_batteries || 0;

            // Heuristic weights:
            // Distance: 1km = 1 point
            // Low Battery: penalize heavily.
            // Formula: Cost = Dist + (10 / (Batteries + 1))
            // Example:
            // Station A: 2km away, 0 batteries. Cost = 2 + 10 = 12
            // Station B: 5km away, 10 batteries. Cost = 5 + 0.9 = 5.9 -> Winner takes B (detour worth it)

            const loadPenalty = 20 / (batteries + 0.5); // Steep penalty for 0
            const score = dist + loadPenalty;

            candidate.score = score; // For debug

            if (!best || score < best.score) {
                return candidate;
            }
            return best;
        }, null);

        if (!bestStation) throw new Error("Failed to select a valid station.");

        // Log choice for debugging
        // console.log(`Selected Station ${bestStation.id}: Dist=${bestStation.distance_km.toFixed(2)}km, Batt=${bestStation.fully_charged_batteries}, Score=${bestStation.score.toFixed(2)}`);

        waypoints.push(bestStation);

        currentLat = parseFloat(bestStation.latitude);
        currentLon = parseFloat(bestStation.longitude);

        const distToDest = getDistanceFromLatLonInKm(currentLat, currentLon, endLat, endLon);
        remainingDistance = distToDest;
    }

    // 3. Calculate final multi-stop route
    const allPoints = [
        { lat: startLat, lon: startLon },
        ...waypoints.map(p => ({ lat: parseFloat(p.latitude), lon: parseFloat(p.longitude) })),
        { lat: endLat, lon: endLon }
    ];

    const finalRoute = await osrmService.getMultiPointRoute(allPoints);

    return {
        type: 'multi_stop',
        totalDistanceKm: finalRoute.routes[0].distance / 1000,
        stops: waypoints,
        route: finalRoute.routes[0]
    };
};

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = deg2rad(lat2 - lat1);
    var dLon = deg2rad(lon2 - lon1);
    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180)
}

module.exports = {
    planRoute
};
