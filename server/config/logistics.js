/**
 * Logistics Configuration
 * Centralized business logic constants.
 */

module.exports = {
    // Financials (in currency units)
    FINANCIALS: {
        REVENUE_PER_SWAP: 70,
        TOTAL_COST_PER_BATTERY: 30, // Transport + Handling
        MIN_PROFIT_MARGIN: 0.10,
    },

    // Inventory Thresholds
    THRESHOLDS: {
        DEFICIT_PERCENT: 0.25,      // Trigger if capacity < 25%
        MIN_SURPLUS: 5,             // Station considered "donor" if > 5 charged
        CRITICAL_HOURS_STOCK: 3,    // Critical if stock lasts < 3 hours
        HIGH_HOURS_STOCK: 6,        // High priority if stock lasts < 6 hours
    },

    // Operational Constraints
    OPERATIONS: {
        MAX_P2P_DISTANCE_KM: 20,    // Max distance for Peer-to-Peer transfer
        MAX_WAREHOUSE_DISTANCE_KM: 30, // Max distance for Warehouse dispatch
        DEFAULT_CAPACITY: 10,
        DEFAULT_DEMAND: 10,
    }
};
