/**
 * Inventory Balancing Agent
 * Autonomous agent that monitors network health and suggests transfers
 * NOW WITH COST OPTIMIZATION
 */

const partnersModel = require('../models/partners');
const warehousesModel = require('../models/warehouses');

// Constants
const REVENUE_PER_SWAP = 70;    // Revenue per battery in Rupees
const TOTAL_COST_PER_BATTERY = 30; // Flat cost (Includes Transport & Handling)
const MIN_PROFIT_MARGIN = 0.10; // 10%

// Thresholds
const DEFICIT_THRESHOLD_PERCENT = 0.25; // Trigger if < 25% capacity
const MIN_SURPLUS = 5; // Can donate if has decent stock

/**
 * Run Analysis and Generate Rebalancing Plan
 */
const getRebalancingPlan = async () => {
    // 1. Fetch current Network State
    const allPartners = await partnersModel.getAll();
    const warehouses = await warehousesModel.getAll();

    // Filter Active Stations
    const activeStations = allPartners.filter(p => p.is_active_dsk);

    // 2. Identify Needs and Surplus
    // Trigger condition: current < 25% of total
    const starvingStations = activeStations.filter(p => {
        const capacity = p.total_batteries || 10; // default if missing
        const threshold = Math.ceil(capacity * DEFICIT_THRESHOLD_PERCENT);
        return p.fully_charged_batteries <= threshold;
    });

    const surplusStations = activeStations.filter(p => p.fully_charged_batteries >= MIN_SURPLUS);

    const jobs = [];
    const satisfiedIds = new Set();

    // 3. Solve for Starving Stations
    for (const receiver of starvingStations) {
        if (satisfiedIds.has(receiver.id)) continue;

        const capacity = receiver.total_batteries || 10;
        const current = receiver.fully_charged_batteries;
        const target = Math.floor(capacity * 0.8); // Aim to fill to 80%
        const needed = Math.max(1, target - current); // Amount to transfer

        // Find Best Source (Closest)
        let bestJob = null;
        let minDist = Infinity;

        // --- Candidate Evaluation Function ---
        const evaluateCandidate = (candidate, type) => {
            const dist = getDistance(receiver.latitude, receiver.longitude, candidate.latitude, candidate.longitude);

            // Financials (Flat Rate Model)
            const revenue = needed * REVENUE_PER_SWAP;
            const cost = needed * TOTAL_COST_PER_BATTERY; // Distance irrelevant for cost
            const profit = revenue - cost; // Constant: 40 * needed
            const margin = profit / revenue; // Constant: ~57%

            if (margin < MIN_PROFIT_MARGIN) return null; // Should never happen with 30/70 split

            return {
                type: type === 'WAREHOUSE' ? 'WAREHOUSE_DISPATCH' : 'P2P_TRANSFER',
                priority: 'HIGH',
                fromId: candidate.id || candidate.name,
                fromType: type,
                toId: receiver.id,
                toType: 'STATION',
                amount: needed,
                distanceKm: parseFloat(dist.toFixed(2)),
                financials: {
                    revenue: revenue,
                    cost: cost,
                    details: {
                        notes: "Flat Rate (Transport included)"
                    },
                    profit: profit,
                    marginPercent: parseFloat((margin * 100).toFixed(1))
                },
                reason: `${type} (Dist: ${dist.toFixed(1)}km)`
            };
        };

        // A. Check Peer Stations
        for (const donor of surplusStations) {
            if (donor.id === receiver.id) continue;
            const job = evaluateCandidate(donor, 'STATION');
            if (job && job.distanceKm < minDist) {
                minDist = job.distanceKm;
                bestJob = job;
            }
        }

        // B. Check Warehouses
        for (const wh of warehouses) {
            if (wh.charged_batteries < needed) continue;
            const job = evaluateCandidate(wh, 'WAREHOUSE');
            if (job && job.distanceKm < minDist) {
                minDist = job.distanceKm;
                bestJob = job;
            }
        }

        if (bestJob) {
            jobs.push(bestJob);
            satisfiedIds.add(receiver.id);
        }
    }

    // 4. Return Plan
    return {
        timestamp: new Date(),
        config: {
            cost_per_item: TOTAL_COST_PER_BATTERY,
            revenue_per_item: REVENUE_PER_SWAP
        },
        summary: {
            starving_stations: starvingStations.length,
            surplus_stations: surplusStations.length,
            total_jobs: jobs.length,
            p2p_jobs: jobs.filter(j => j.type === 'P2P_TRANSFER').length,
            warehouse_jobs: jobs.filter(j => j.type === 'WAREHOUSE_DISPATCH').length,
            total_projected_profit: jobs.reduce((sum, j) => sum + j.financials.profit, 0)
        },
        jobs: jobs.sort((a, b) => a.distanceKm - b.distanceKm) // Sort by Distance (Speed)
    };
};

// Helper: Haversine Distance
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

module.exports = {
    getRebalancingPlan
};
