const EventEmitter = require('events');

class AppEventBus extends EventEmitter { }

const eventBus = new AppEventBus();

// Event Names
eventBus.EVENTS = {
    // Inventory events
    PARTNER_STOCK_UPDATE: 'PARTNER_STOCK_UPDATE',
    PARTNER_DEMAND_UPDATE: 'PARTNER_DEMAND_UPDATE',
    TASK_COMPLETED: 'TASK_COMPLETED',
    
    // Battery swap events - triggers rebalancing check
    BATTERY_SWAP_COMPLETED: 'BATTERY_SWAP_COMPLETED',
    BATTERY_LOW_SOC: 'BATTERY_LOW_SOC',
    
    // Driver location events - for congestion detection
    DRIVER_LOCATION_UPDATE: 'DRIVER_LOCATION_UPDATE',
    DRIVERS_BATCH_LOCATION_UPDATE: 'DRIVERS_BATCH_LOCATION_UPDATE',
    
    // Congestion events
    STATION_CONGESTION_DETECTED: 'STATION_CONGESTION_DETECTED',
    STATION_CONGESTION_CLEARED: 'STATION_CONGESTION_CLEARED',
};

module.exports = eventBus;
