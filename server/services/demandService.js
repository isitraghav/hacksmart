/**
 * Demand Service
 * Manages access to demand history and generates forecasts.
 * Since we don't have a history table, this service mocks 30 days of history.
 */

const forecastingService = require('./forecastingService');
const partnersModel = require('../models/partners');

// In-memory cache for simulated history (so it doesn't change every request)
const historyCache = new Map();

/**
 * Generate synthetic history with patterns
 * @param {number} baseDemand - The average daily swaps from DB
 * @returns {number[]} Array of 30 days of swap counts
 */
const generateHistory = (baseDemand) => {
    const history = [];
    const trend = (Math.random() * 0.4) - 0.2; // Random trend between -0.2 and +0.2 per day

    for (let i = 0; i < 30; i++) {
        // 1. Base + Trend
        let val = baseDemand + (i * trend);

        // 2. Seasonality (Weekends are higher)
        // Let's assume day 0 is Monday
        const dayOfWeek = i % 7;
        if (dayOfWeek === 5 || dayOfWeek === 6) { // Sat/Sun
            val *= 1.2;
        }

        // 3. Random Noise (Weather, Traffic, Chance)
        const noise = (Math.random() * 4) - 2; // +/- 2 swaps
        val += noise;

        history.push(Math.max(0, Math.round(val)));
    }
    return history;
};

const getForecastForStation = async (stationId) => {
    const station = await partnersModel.getById(stationId);
    if (!station) return null;

    // Get or Generate History
    let history = historyCache.get(stationId);
    if (!history) {
        // Use current avg_daily_swaps as the "Truth" anchor
        const anchor = station.avg_daily_swaps || 10;
        history = generateHistory(anchor);
        historyCache.set(stationId, history);
    }

    // Run Forecast
    const prediction = forecastingService.predict(history);

    return {
        stationId: station.id,
        currentAvg: station.avg_daily_swaps,
        history: history, // Last 30 days
        forecast: prediction.forecast,
        confidence: prediction.confidence,
        model: "Double Exponential Smoothing (Holt's)"
    };
};

module.exports = {
    getForecastForStation,
    // Debug method to see the raw data
    getDebugData: (stationId) => historyCache.get(stationId)
};
