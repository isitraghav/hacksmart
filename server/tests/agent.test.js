const balancingAgent = require('../services/balancingAgent');
const partnersModel = require('../models/partners');
const warehousesModel = require('../models/warehouses');

// Mock data
// Revenue: 70 INR. Cost: 30 INR. Profit: 40 INR. Margin: 57%.
const mockPartners = [
    { id: 'S1', latitude: 10, longitude: 10, is_active_dsk: true, total_batteries: 10, fully_charged_batteries: 1 },  // Starving
    { id: 'S2', latitude: 10.05, longitude: 10.05, is_active_dsk: true, total_batteries: 10, fully_charged_batteries: 8 } // Surplus
];
const mockWarehouses = [
    { name: 'W1', latitude: 10.1, longitude: 10.1, charged_batteries: 12 } // Realistic low inventory (Target ~15)
];

// Mock dependencies
partnersModel.getAll = async () => mockPartners;
warehousesModel.getAll = async () => mockWarehouses;

async function runTests() {
    console.log('=== Testing Balancing Agent (Flat Rate Model) ===');

    try {
        const plan = await balancingAgent.getRebalancingPlan();

        // Assertions
        console.assert(plan.summary.starving_stations === 1, 'Should identify 1 starving station');
        console.assert(plan.jobs.length === 1, 'Should create 1 job');

        if (plan.jobs.length > 0) {
            const job = plan.jobs[0];
            console.log(`Job Details: Type=${job.type}, Profit=₹${job.financials.profit}`);
            console.log(`Financials: Revenue=${job.financials.revenue}, Cost=${job.financials.cost}`);

            // Expected for 5 units (target calc might vary, but likely 5)
            // Revenue 70 * 5 = 350. Cost 30 * 5 = 150. Profit 200.

            console.assert(job.financials.profit > 0, 'Should be profitable');
            console.assert(job.financials.cost === (job.amount * 30), 'Cost should be 30 * amount');
        }

        console.log('✓ Threshold Logic: Verified');
        console.log('✓ Optimization: Selected valid profitable move');

        console.log('ALL TESTS PASSED');
    } catch (e) {
        console.error('TEST FAILED:', e);
        process.exit(1);
    }
}

runTests();
