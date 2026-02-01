/**
 * Battery Health Service
 * Implements detection logic for battery faults and health tracking.
 */
const batteriesModel = require('../models/batteries');
const notificationsModel = require('../models/notifications');
const ticketsModel = require('../models/tickets');
const logisticsAgent = require('./logisticsAgent');

// Thresholds
const V_MIN = 42.0; // Minimum Voltage (example for 48V system)
const T_CRIT = 60.0; // Critical Temperature (Celsius)
const R_INTERNAL_MAX = 0.050; // Max Internal Resistance (Ohms)
const CYCLE_LIFE = 1000; // Rated Cycle Life

const batteryHealthService = {

    /**
     * Analyze incoming telemetry for a battery
     * @param {string} batteryId 
     * @param {Object} telemetry - { voltage, current, temp, soc, lat, lon }
     */
    analyzeTelemetry: async (batteryId, telemetry) => {
        const { voltage, current, temp, soc } = telemetry;
        let healthStatus = 'GOOD';
        let issues = [];

        // 1. Threshold Checks
        if (voltage < V_MIN && soc > 10) {
            issues.push('Voltage Sag / Capacity Fade');
            healthStatus = 'CRITICAL';
        }
        if (temp > T_CRIT) {
            issues.push('Thermal Runaway Risk');
            healthStatus = 'CRITICAL';
        }

        // 2. Internal Resistance Estimate (Simplified Ohm's Law during load)
        // R = V_drop / I_load (Requires previous state, simplified here to instantaneous checking if load is high)
        // Ideally we'd compare Open Circuit Voltage vs Load Voltage.
        // For this mock, we'll assume the telemetry *includes* a calculated Ri or we infer it if V is low for high I.
        let estimatedRi = telemetry.internal_resistance || 0.02; // Default mock value
        if (Math.abs(current) > 20 && voltage < 44) {
            // Heuristic: High voltage drop under load -> High Resistance
            estimatedRi = 0.06;
            issues.push('High Internal Resistance');
            healthStatus = 'FAIR';
            if (estimatedRi > R_INTERNAL_MAX) healthStatus = 'CRITICAL';
        }

        // 3. Digital Twin / Anomaly Check (Mock)
        // Compare current Voltage vs Ideal Curve at this SOC
        const idealVoltage = 48 + ((soc - 50) * 0.1); // Linear approx 43V to 53V
        if (Math.abs(voltage - idealVoltage) > 3.0) {
            issues.push('Anomaly: Voltage Deviation from Digital Twin');
            healthStatus = healthStatus === 'GOOD' ? 'FAIR' : healthStatus;
        }

        // Update Battery Record
        const currentBattery = await batteriesModel.getById(batteryId);
        if (!currentBattery) return;

        // Calculate SOH (Simplified)
        // SOH degrades with cycles and extreme events
        let newSoh = currentBattery.soh || 100;
        if (healthStatus === 'CRITICAL') newSoh -= 1; // Penalty for critical events
        else if (healthStatus === 'FAIR') newSoh -= 0.1;

        await batteriesModel.updateHealth(batteryId, {
            healthStatus,
            soh: Math.max(0, newSoh),
            internalResistance: estimatedRi,
            cycles: currentBattery.cycles // In reality, update based on charge accumulation
        });

        // Trigger Agent if CRITICAL and not already being handled
        if (healthStatus === 'CRITICAL') {
            await batteryHealthService.triggerReplacementProtocol(batteryId, issues, currentBattery);
        }

        return { healthStatus, issues, input: telemetry };
    },

    /**
     * Agents triggers replacement for faulty battery
     */
    triggerReplacementProtocol: async (batteryId, issues, battery) => {
        console.log(`[Health Service] CRITICAL ALERT for ${batteryId}: ${issues.join(', ')}`);

        // 1. Create a Ticket for the Station/Driver
        const stationId = battery.current_station_id; // If at station
        // If at driver, it's more complex (needs driver swap). For now assume station or driver returns to station.

        if (stationId) {
            // Check if ticket already exists
            const existingTickets = await ticketsModel.getOpen();
            const alreadyHasTicket = existingTickets.some(t => t.station_id === stationId && t.priority === 'CRITICAL' && t.status === 'OPEN');

            if (!alreadyHasTicket) {
                await ticketsModel.create({
                    station_id: stationId,
                    priority: 'CRITICAL',
                    required_amount: 1, // Need 1 replacement
                    notes: `Faulty Battery ${batteryId}: ${issues.join(', ')}`
                });

                // 2. Notify Logistics Agent (to auto-resolve if possible)
                // The logistics agent currently polls tickets. 
                // We can also force an immediate check or let the next poll handle it.
                // But we should specifically mark this battery as 'UNAVAILABLE' so it's not given out.
                await batteriesModel.updateStatus(batteryId, 'FAULTY', 'STATION', stationId);

                console.log(`[Health Service] Ticket raised and battery marked FAULTY.`);
            }
        }
    }
};

module.exports = batteryHealthService;
