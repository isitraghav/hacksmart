/**
 * Pricing Model for Driver Swap Payments
 * Handles swap pricing, leave penalties, and service charges
 */

const { query } = require('../config/database');

// Pricing Constants
const PRICING = {
    BASE_SWAP_PRICE: 170,           // First swap of the day ₹170
    SECONDARY_SWAP_PRICE: 70,       // Additional swaps ₹70
    EXTRA_CHARGE: 40,               // Extra charge on all swaps ₹40
    LEAVE_PENALTY: 120,             // Penalty for exceeding leave limit in ₹
    LEAVE_PENALTY_RECOVERY: 60,     // Amount recovered per swap for leave penalty
    SERVICE_CHARGE: 40,             // Service charge per swap in ₹
    FREE_LEAVE_DAYS: 4,             // Free leave days per month

    // Zone-based pricing multipliers
    ZONE_MULTIPLIERS: {
        'METRO': 1.2,               // Metro cities (higher pricing)
        'URBAN': 1.0,               // Urban areas (base pricing)
        'SEMI_URBAN': 0.9,          // Semi-urban (slightly lower)
        'RURAL': 0.8                // Rural areas (lowest)
    },

    // Dynamic Pricing Constants
    BATTERY_CAPACITY_KWH: 2.0,      // Standard Battery Capacity
    KWH_RATE: 85,                   // Rate per kWh (derived from base price)
    DYNAMIC_MODE_ENABLED: true      // Feature flag
}
const pricingModel = {
    /**
     * Get pricing constants
     */
    getConstants: () => PRICING,

    /**
     * Calculate swap price based on zone
     * First swap: ₹170 + ₹40 extra = ₹210
     * Additional swaps: ₹70 + ₹40 extra = ₹110
     * @param {string} zone - Zone type (METRO, URBAN, SEMI_URBAN, RURAL)
     * @param {boolean} isSecondary - Whether this is a secondary swap
     * @returns {number} Swap price in ₹
     */
    getSwapPrice: (zone = 'URBAN', isSecondary = false) => {
        const basePrice = isSecondary ? PRICING.SECONDARY_SWAP_PRICE : PRICING.BASE_SWAP_PRICE;
        const priceWithExtra = basePrice + PRICING.EXTRA_CHARGE;
        const multiplier = PRICING.ZONE_MULTIPLIERS[zone] || 1.0;
        return Math.round(priceWithExtra * multiplier);
    },

    /**
     * Calculate total payment breakdown for a swap
     * @param {Object} params - { driverId, zone, isSecondary, pendingPenalty, pendingServiceCharge }
     * @returns {Object} Payment breakdown
     */
    calculateSwapPayment: async (driverId, zone = 'URBAN', isSecondary = false) => {
        // Get driver's pending charges
        let driverAccount = null;
        try {
            driverAccount = await pricingModel.getDriverAccount(driverId);
        } catch (error) {
            // If driver_accounts table doesn't exist yet, continue with null account
            if (error.code !== '42P01') {
                throw error;
            }
            console.warn(`[Pricing] driver_accounts table not found. Run migrations to create it.`);
        }

        const swapPrice = pricingModel.getSwapPrice(zone, isSecondary);

        // Calculate deductions
        let penaltyDeduction = 0;
        let serviceDeduction = 0;

        if (driverAccount) {
            // Recover leave penalty at ₹60/swap
            if (driverAccount.pending_leave_penalty > 0) {
                penaltyDeduction = Math.min(PRICING.LEAVE_PENALTY_RECOVERY, driverAccount.pending_leave_penalty);
            }

            // Recover service charge at ₹40/swap
            if (driverAccount.pending_service_charge > 0) {
                serviceDeduction = Math.min(PRICING.SERVICE_CHARGE, driverAccount.pending_service_charge);
            }
        }

        const totalPayment = swapPrice + penaltyDeduction + serviceDeduction;
        const netToDriver = swapPrice;
        const platformRevenue = penaltyDeduction + serviceDeduction;

        return {
            swapPrice,
            zone,
            isSecondary,
            paymentMode: 'FIXED',
            penaltyDeduction,
            serviceDeduction,
            totalPayment,
            netToDriver,
            platformRevenue,
            breakdown: {
                base: swapPrice,
                leavePenaltyRecovery: penaltyDeduction,
                serviceChargeRecovery: serviceDeduction
            }
        };
    },

    /**
     * Calculate dynamic swap payment based on energy usage (kWh)
     * @param {Object} params - { driverId, zone, socReceived, socReturned }
     */
    calculateDynamicSwapPayment: async (driverId, zone = 'URBAN', socReceived, socReturned) => {
        // Get driver's pending charges
        let driverAccount = null;
        try {
            driverAccount = await pricingModel.getDriverAccount(driverId);
        } catch (error) {
            // If driver_accounts table doesn't exist yet, continue with null account
            if (error.code !== '42P01') {
                throw error;
            }
            console.warn(`[Pricing] driver_accounts table not found. Run migrations to create it.`);
        }

        // Calculate Energy Consumed
        // If user returns 10% and gets 100%, they consumed the difference? 
        // No, the model says "pay only the /kWh cost". Usually this means pay for the energy *received*.
        // But "amount will be refunded to him when he returns" implies a net usage model.
        // Let's implement: Cost = (SOC_Received - SOC_Returned) * Capacity * Rate
        // If SOC_Returned > SOC_Received (unlikely), cost is negative (refund).

        const socDiff = Math.max(0, socReceived - socReturned); // Prevent negative for now unless refund logic is explicit
        const energyConsumedKwh = (socDiff / 100.0) * PRICING.BATTERY_CAPACITY_KWH;

        const multiplier = PRICING.ZONE_MULTIPLIERS[zone] || 1.0;
        const basePrice = Math.round(energyConsumedKwh * PRICING.KWH_RATE * multiplier);
        const swapPrice = basePrice + PRICING.EXTRA_CHARGE; // Still add fixed extra charge? Assuming yes strictly for 'swap' service.

        // Calculate deductions (same as fixed)
        let penaltyDeduction = 0;
        let serviceDeduction = 0;

        if (driverAccount) {
            if (driverAccount.pending_leave_penalty > 0) {
                penaltyDeduction = Math.min(PRICING.LEAVE_PENALTY_RECOVERY, driverAccount.pending_leave_penalty);
            }
            if (driverAccount.pending_service_charge > 0) {
                serviceDeduction = Math.min(PRICING.SERVICE_CHARGE, driverAccount.pending_service_charge);
            }
        }

        const totalPayment = swapPrice + penaltyDeduction + serviceDeduction;

        return {
            swapPrice,
            zone,
            paymentMode: 'DYNAMIC',
            energyConsumedKwh,
            socDiff,
            penaltyDeduction,
            serviceDeduction,
            totalPayment,
            breakdown: {
                base: swapPrice,
                energyCost: basePrice,
                extraCharge: PRICING.EXTRA_CHARGE,
                leavePenaltyRecovery: penaltyDeduction,
                serviceChargeRecovery: serviceDeduction
            }
        };
    },

    /**
     * Get or create driver account
     */
    getDriverAccount: async (driverId) => {
        const res = await query(
            `SELECT * FROM driver_accounts WHERE driver_id = $1`,
            [driverId]
        );
        return res.rows[0];
    },

    /**
     * Create driver account if not exists
     */
    ensureDriverAccount: async (driverId) => {
        let account = await pricingModel.getDriverAccount(driverId);
        if (!account) {
            const res = await query(
                `INSERT INTO driver_accounts (driver_id, balance, total_swaps, pending_leave_penalty, pending_service_charge, leave_days_used, current_month)
                 VALUES ($1, 10000, 0, 0, 0, 0, DATE_TRUNC('month', CURRENT_DATE))
                 RETURNING *`,
                [driverId]
            );
            account = res.rows[0];
        }
        return account;
    },

    /**
     * Record a swap payment
     */
    recordSwapPayment: async (driverId, paymentDetails) => {
        const account = await pricingModel.ensureDriverAccount(driverId);

        // Update pending charges after deductions and DEDUCT BALANCE
        await query(
            `UPDATE driver_accounts 
             SET total_swaps = total_swaps + 1,
                 balance = balance - $4,
                 pending_leave_penalty = GREATEST(0, pending_leave_penalty - $2),
                 pending_service_charge = GREATEST(0, pending_service_charge - $3),
                 last_swap_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE driver_id = $1`,
            [
                driverId,
                paymentDetails.penaltyDeduction,
                paymentDetails.serviceDeduction,
                paymentDetails.totalPayment
            ]
        );

        // Record transaction
        await query(
            `INSERT INTO swap_transactions 
             (driver_id, station_id, swap_price, zone, penalty_deduction, service_deduction, total_amount, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
            [
                driverId,
                paymentDetails.stationId,
                paymentDetails.swapPrice,
                paymentDetails.zone,
                paymentDetails.penaltyDeduction,
                paymentDetails.serviceDeduction,
                paymentDetails.totalPayment
            ]
        );

        return paymentDetails;
    },

    /**
     * Record driver leave/absence
     */
    recordLeave: async (driverId) => {
        const account = await pricingModel.ensureDriverAccount(driverId);

        // Check if we need to reset for new month
        const currentMonth = new Date().toISOString().slice(0, 7);
        const accountMonth = account.current_month?.toISOString().slice(0, 7);

        if (currentMonth !== accountMonth) {
            // Reset leave days for new month
            await query(
                `UPDATE driver_accounts 
                 SET leave_days_used = 1, current_month = DATE_TRUNC('month', CURRENT_DATE), updated_at = CURRENT_TIMESTAMP
                 WHERE driver_id = $1`,
                [driverId]
            );
            return { leaveDaysUsed: 1, penaltyApplied: false };
        }

        const newLeaveDays = account.leave_days_used + 1;
        let penaltyApplied = false;

        if (newLeaveDays > PRICING.FREE_LEAVE_DAYS) {
            // Apply leave penalty
            await query(
                `UPDATE driver_accounts 
                 SET leave_days_used = $2, 
                     pending_leave_penalty = pending_leave_penalty + $3,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE driver_id = $1`,
                [driverId, newLeaveDays, PRICING.LEAVE_PENALTY]
            );
            penaltyApplied = true;
        } else {
            await query(
                `UPDATE driver_accounts 
                 SET leave_days_used = $2, updated_at = CURRENT_TIMESTAMP
                 WHERE driver_id = $1`,
                [driverId, newLeaveDays]
            );
        }

        return {
            leaveDaysUsed: newLeaveDays,
            freeRemaining: Math.max(0, PRICING.FREE_LEAVE_DAYS - newLeaveDays),
            penaltyApplied,
            penaltyAmount: penaltyApplied ? PRICING.LEAVE_PENALTY : 0
        };
    },

    /**
     * Add service charge to driver account
     */
    addServiceCharge: async (driverId, amount = null) => {
        const chargeAmount = amount || PRICING.SERVICE_CHARGE;
        await pricingModel.ensureDriverAccount(driverId);

        await query(
            `UPDATE driver_accounts 
             SET pending_service_charge = pending_service_charge + $2,
                 updated_at = CURRENT_TIMESTAMP
             WHERE driver_id = $1`,
            [driverId, chargeAmount]
        );

        return { chargeAdded: chargeAmount };
    },

    /**
     * Get driver's current balance/status
     */
    getDriverBalance: async (driverId) => {
        const account = await pricingModel.ensureDriverAccount(driverId);

        return {
            driverId, balance: parseFloat(account.balance) || 0, totalSwaps: account.total_swaps,
            pendingLeavePenalty: parseFloat(account.pending_leave_penalty) || 0,
            pendingServiceCharge: parseFloat(account.pending_service_charge) || 0,
            leaveDaysUsed: account.leave_days_used,
            freeLeaveRemaining: Math.max(0, PRICING.FREE_LEAVE_DAYS - account.leave_days_used),
            totalPending: (parseFloat(account.pending_leave_penalty) || 0) + (parseFloat(account.pending_service_charge) || 0),
            swapsNeededToClear: Math.ceil(
                ((parseFloat(account.pending_leave_penalty) || 0) / PRICING.LEAVE_PENALTY_RECOVERY) +
                ((parseFloat(account.pending_service_charge) || 0) / PRICING.SERVICE_CHARGE)
            ),
            lastSwapAt: account.last_swap_at
        };
    },

    /**
     * Get driver transaction history
     */
    getTransactionHistory: async (driverId, limit = 20) => {
        const res = await query(
            `SELECT * FROM swap_transactions 
             WHERE driver_id = $1 
             ORDER BY created_at DESC 
             LIMIT $2`,
            [driverId, limit]
        );
        return res.rows;
    },

    /**
     * Record a battery return refund transaction
     */
    recordRefund: async (driverId, refundDetails) => {
        const { amount, batteryId, soc, stationId, kwhReturned } = refundDetails;

        // Record as a negative transaction (credit to driver)
        await query(
            `INSERT INTO swap_transactions 
             (driver_id, transaction_type, amount, battery_id, station_id, notes, metadata)
             VALUES ($1, 'REFUND', $2, $3, $4, $5, $6)`,
            [
                driverId,
                -amount, // Negative amount = credit to driver
                batteryId,
                stationId,
                `Battery return refund - ${soc}% SOC`,
                JSON.stringify({
                    soc,
                    kwhReturned: kwhReturned.toFixed(2),
                    refundRate: PRICING.KWH_RATE
                })
            ]
        );

        // Update driver account balance (credit the refund)
        await query(
            `UPDATE driver_accounts 
             SET balance = balance + $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE driver_id = $2`,
            [amount, driverId]
        );

        console.log(`[Pricing] Refund recorded: Driver ${driverId} credited ₹${amount}`);
    }
};

module.exports = { pricingModel, PRICING };
