const eventBus = require('../utils/eventBus');
const driverService = require('../services/driverService');

/**
 * Driver Event Subscriber
 * Handles active route updates.
 */

// Listener: When stock changes, check if drivers need rerouting
eventBus.on(eventBus.EVENTS.PARTNER_STOCK_UPDATE, async (partner) => {
    // If stock drops low, check active drivers
    if (partner.fully_charged_batteries <= 1) {
        try {
            await driverService.checkReroute(partner.id, partner.fully_charged_batteries);
        } catch (err) {
            console.error('[DriverSubscriber] Reroute check failed:', err);
        }
    }
});

console.log('✓ Driver Event Subscribers Initialized');
