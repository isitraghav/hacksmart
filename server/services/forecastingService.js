/**
 * Enhanced Forecasting Service
 * Implements multiple statistical methods for accurate demand prediction:
 * - Double Exponential Smoothing (Holt's Linear Trend)
 * - Triple Exponential Smoothing (Holt-Winters for seasonality)
 * - Weighted Moving Average
 * - Day-of-week seasonality adjustment
 */

const dailySwapHistoryModel = require('../models/dailySwapHistory');

/**
 * Calculate standard deviation
 */
const getStandardDeviation = (array) => {
    const n = array.length;
    if (n === 0) return 0;
    const mean = array.reduce((a, b) => a + b, 0) / n;
    return Math.sqrt(array.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / n);
};

/**
 * Calculate mean
 */
const getMean = (array) => {
    if (array.length === 0) return 0;
    return array.reduce((a, b) => a + b, 0) / array.length;
};

/**
 * Double Exponential Smoothing (Holt's Linear Trend)
 * Best for data with a trend but no seasonality.
 */
const holtsLinearTrend = (data, alpha = 0.5, beta = 0.3, horizonDays = 1) => {
    if (!data || data.length < 2) return { forecast: data[0] || 0, confidence: 0, trend: 0 };

    let level = data[0];
    let trend = data[1] - data[0];

    // Warm up the model over the history
    for (let i = 1; i < data.length; i++) {
        const prevLevel = level;
        const prevTrend = trend;
        level = alpha * data[i] + (1 - alpha) * (prevLevel + prevTrend);
        trend = beta * (level - prevLevel) + (1 - beta) * prevTrend;
    }

    // Forecast h steps ahead
    const forecast = level + horizonDays * trend;
    
    // Calculate confidence based on recent variance
    const recentHistory = data.slice(-7);
    const stdDev = getStandardDeviation(recentHistory);
    const marginOfError = 1.96 * stdDev;
    const confidence = Math.max(10, Math.min(95, 100 - (marginOfError / Math.max(forecast, 1) * 100)));

    return {
        forecast: Math.max(0, parseFloat(forecast.toFixed(1))),
        confidence: parseFloat(confidence.toFixed(1)),
        trend: parseFloat(trend.toFixed(2)),
        level: parseFloat(level.toFixed(2))
    };
};

/**
 * Weekly Seasonality Detection
 * Detects day-of-week patterns in the data
 */
const detectWeeklySeasonality = (data) => {
    if (data.length < 14) return null; // Need at least 2 weeks
    
    // Calculate average for each day of week (assuming data ends today)
    const dayOfWeekTotals = [0, 0, 0, 0, 0, 0, 0];
    const dayOfWeekCounts = [0, 0, 0, 0, 0, 0, 0];
    
    const today = new Date().getDay();
    for (let i = 0; i < data.length; i++) {
        const daysAgo = data.length - 1 - i;
        const dayOfWeek = (today - daysAgo % 7 + 7) % 7;
        dayOfWeekTotals[dayOfWeek] += data[i];
        dayOfWeekCounts[dayOfWeek]++;
    }
    
    const dayOfWeekAvg = dayOfWeekTotals.map((total, idx) => 
        dayOfWeekCounts[idx] > 0 ? total / dayOfWeekCounts[idx] : 0
    );
    
    const overallAvg = getMean(data);
    
    // Seasonal indices (how much each day differs from average)
    const seasonalIndices = dayOfWeekAvg.map(avg => 
        overallAvg > 0 ? avg / overallAvg : 1
    );
    
    // Check if seasonality is significant (variance in indices > 10%)
    const indexVariance = getStandardDeviation(seasonalIndices);
    const isSignificant = indexVariance > 0.1;
    
    return {
        indices: seasonalIndices,
        dayAverages: dayOfWeekAvg,
        isSignificant,
        variance: indexVariance
    };
};

/**
 * Triple Exponential Smoothing (Holt-Winters)
 * For data with both trend and weekly seasonality
 */
const holtWinters = (data, alpha = 0.4, beta = 0.3, gamma = 0.3, seasonLength = 7) => {
    if (!data || data.length < seasonLength * 2) {
        return holtsLinearTrend(data, alpha, beta);
    }

    // Initialize level, trend, and seasonal components
    let level = getMean(data.slice(0, seasonLength));
    let trend = (getMean(data.slice(seasonLength, seasonLength * 2)) - level) / seasonLength;
    
    // Initialize seasonal indices
    const seasonal = [];
    for (let i = 0; i < seasonLength; i++) {
        seasonal.push(data[i] / (level > 0 ? level : 1));
    }
    
    // Apply the model
    for (let i = seasonLength; i < data.length; i++) {
        const seasonIdx = i % seasonLength;
        const prevLevel = level;
        const prevTrend = trend;
        
        // Update level
        level = alpha * (data[i] / (seasonal[seasonIdx] || 1)) + (1 - alpha) * (prevLevel + prevTrend);
        
        // Update trend
        trend = beta * (level - prevLevel) + (1 - beta) * prevTrend;
        
        // Update seasonal component
        seasonal[seasonIdx] = gamma * (data[i] / (level > 0 ? level : 1)) + (1 - gamma) * seasonal[seasonIdx];
    }
    
    // Forecast next day
    const forecastSeasonIdx = data.length % seasonLength;
    const forecast = (level + trend) * (seasonal[forecastSeasonIdx] || 1);
    
    // Confidence calculation
    const recentHistory = data.slice(-7);
    const stdDev = getStandardDeviation(recentHistory);
    const marginOfError = 1.96 * stdDev;
    const confidence = Math.max(10, Math.min(95, 100 - (marginOfError / Math.max(forecast, 1) * 100)));

    return {
        forecast: Math.max(0, parseFloat(forecast.toFixed(1))),
        confidence: parseFloat(confidence.toFixed(1)),
        trend: parseFloat(trend.toFixed(2)),
        seasonalIndices: seasonal.map(s => parseFloat(s.toFixed(2)))
    };
};

/**
 * Weighted Moving Average with recency bias
 */
const weightedMovingAverage = (data, weights = null) => {
    if (!data || data.length === 0) return { forecast: 0, confidence: 0 };
    
    // Default weights: more recent days get higher weights
    if (!weights) {
        const n = Math.min(data.length, 7);
        weights = [];
        for (let i = 0; i < n; i++) {
            weights.push(i + 1); // 1, 2, 3, 4, 5, 6, 7
        }
    }
    
    const recentData = data.slice(-weights.length);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    
    let weightedSum = 0;
    for (let i = 0; i < recentData.length; i++) {
        weightedSum += recentData[i] * weights[i];
    }
    
    const forecast = weightedSum / totalWeight;
    
    return {
        forecast: parseFloat(forecast.toFixed(1)),
        confidence: 75 // Static moderate confidence for WMA
    };
};

/**
 * Ensemble forecast - combines multiple methods
 */
const ensembleForecast = (data) => {
    if (!data || data.length < 3) {
        return {
            forecast: data[data.length - 1] || 0,
            confidence: 30,
            method: 'last_value',
            details: {}
        };
    }
    
    const results = {};
    
    // 1. Holt's Linear Trend
    const holts = holtsLinearTrend(data);
    results.holts = holts;
    
    // 2. Weighted Moving Average
    const wma = weightedMovingAverage(data);
    results.wma = wma;
    
    // 3. Holt-Winters (if enough data)
    if (data.length >= 14) {
        const hw = holtWinters(data);
        results.holtWinters = hw;
    }
    
    // 4. Detect seasonality
    const seasonality = detectWeeklySeasonality(data);
    results.seasonality = seasonality;
    
    // Ensemble: weighted average of methods based on confidence
    let totalWeight = 0;
    let weightedForecast = 0;
    
    const methodWeights = {
        holts: 0.4,
        wma: 0.3,
        holtWinters: 0.3
    };
    
    for (const [method, weight] of Object.entries(methodWeights)) {
        if (results[method]) {
            const adjustedWeight = weight * (results[method].confidence / 100);
            weightedForecast += results[method].forecast * adjustedWeight;
            totalWeight += adjustedWeight;
        }
    }
    
    const finalForecast = totalWeight > 0 ? weightedForecast / totalWeight : holts.forecast;
    
    // Apply day-of-week adjustment if seasonality is significant
    let adjustedForecast = finalForecast;
    if (seasonality && seasonality.isSignificant) {
        const tomorrow = (new Date().getDay() + 1) % 7;
        adjustedForecast = finalForecast * seasonality.indices[tomorrow];
    }
    
    // Calculate combined confidence
    const avgConfidence = Object.values(results)
        .filter(r => r && r.confidence)
        .map(r => r.confidence)
        .reduce((a, b) => a + b, 0) / Object.keys(results).filter(k => results[k]?.confidence).length;
    
    return {
        forecast: Math.max(0, parseFloat(adjustedForecast.toFixed(1))),
        confidence: parseFloat((avgConfidence || 50).toFixed(1)),
        trend: results.holts?.trend || 0,
        method: 'ensemble',
        details: results
    };
};

/**
 * Main forecasting interface
 */
const forecastingService = {
    /**
     * Predict demand for a station
     * @param {string} stationId - Station ID
     * @param {number} days - Number of days of history to use
     * @param {number} horizon - Days ahead to forecast
     */
    predictDemand: async (stationId, days = 30, horizon = 1) => {
        try {
            // Get historical swap data
            const history = await dailySwapHistoryModel.getSwapCountArray(stationId, days);
            
            // Get hourly pattern for time-of-day adjustments
            const hourlyPattern = await dailySwapHistoryModel.getHourlyPattern(stationId, 14);
            
            // Get statistics
            const stats = await dailySwapHistoryModel.getStats(stationId, days);
            
            // Run ensemble forecast
            const prediction = ensembleForecast(history);
            
            // Calculate hourly forecast for today
            const totalDailyForecast = prediction.forecast;
            const hourlyForecasts = hourlyPattern.map((hourAvg, hour) => {
                const hourlySum = hourlyPattern.reduce((a, b) => a + b, 0);
                const proportion = hourlySum > 0 ? hourAvg / hourlySum : 1/24;
                return parseFloat((totalDailyForecast * proportion).toFixed(2));
            });
            
            return {
                stationId,
                dailyForecast: prediction.forecast,
                confidence: prediction.confidence,
                trend: prediction.trend,
                method: prediction.method,
                hourlyForecasts,
                peakHour: stats.peakHour,
                stats: {
                    avgDaily: stats.avgDaily,
                    maxDaily: stats.maxDaily,
                    stddev: stats.stddevDaily
                },
                details: prediction.details
            };
        } catch (error) {
            console.error('[Forecasting] Error predicting demand:', error.message);
            return {
                stationId,
                dailyForecast: 10, // Default fallback
                confidence: 20,
                trend: 0,
                method: 'fallback',
                error: error.message
            };
        }
    },

    /**
     * Simple predict function for backward compatibility
     */
    predict: (history) => {
        return ensembleForecast(history);
    },

    /**
     * Get demand forecast for next N hours
     */
    predictHourlyDemand: async (stationId, hours = 8) => {
        const prediction = await forecastingService.predictDemand(stationId);
        
        const currentHour = new Date().getHours();
        let totalDemand = 0;
        
        for (let h = 0; h < hours; h++) {
            const hour = (currentHour + h) % 24;
            totalDemand += prediction.hourlyForecasts?.[hour] || (prediction.dailyForecast / 24);
        }
        
        return {
            hours,
            totalDemand: Math.ceil(totalDemand),
            confidence: prediction.confidence,
            breakdown: prediction.hourlyForecasts?.slice(currentHour, currentHour + hours) || []
        };
    }
};

module.exports = forecastingService;
