/**
 * Daily Swap History Model
 * Tracks swap frequency per station per day for time series analysis
 */

const { query } = require('../config/database');

const dailySwapHistoryModel = {
    /**
     * Record a swap for a station (increment today's count)
     */
    recordSwap: async (stationId) => {
        const today = new Date().toISOString().split('T')[0];
        const currentHour = new Date().getHours();
        
        try {
            // Upsert: insert or update today's record
            const res = await query(`
                INSERT INTO daily_swap_history (station_id, swap_date, swap_count, hour_breakdown, peak_hour)
                VALUES ($1, $2, 1, $3, $4)
                ON CONFLICT (station_id, swap_date) 
                DO UPDATE SET 
                    swap_count = daily_swap_history.swap_count + 1,
                    hour_breakdown = daily_swap_history.hour_breakdown || $3,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING *
            `, [stationId, today, JSON.stringify({ [currentHour]: 1 }), currentHour]);
            
            // Update hour breakdown properly (increment hour count)
            if (res.rows[0]) {
                const record = res.rows[0];
                const hourBreakdown = record.hour_breakdown || {};
                hourBreakdown[currentHour] = (hourBreakdown[currentHour] || 0) + 1;
                
                // Find peak hour
                let peakHour = currentHour;
                let maxCount = 0;
                for (const [hour, count] of Object.entries(hourBreakdown)) {
                    if (count > maxCount) {
                        maxCount = count;
                        peakHour = parseInt(hour);
                    }
                }
                
                await query(`
                    UPDATE daily_swap_history 
                    SET hour_breakdown = $2, peak_hour = $3
                    WHERE id = $1
                `, [record.id, JSON.stringify(hourBreakdown), peakHour]);
            }
            
            return res.rows[0];
        } catch (error) {
            console.error('[DailySwapHistory] Error recording swap:', error.message);
            return null;
        }
    },

    /**
     * Get swap history for a station (last N days)
     */
    getHistory: async (stationId, days = 30) => {
        try {
            const res = await query(`
                SELECT swap_date, swap_count, hour_breakdown, peak_hour
                FROM daily_swap_history
                WHERE station_id = $1
                  AND swap_date >= CURRENT_DATE - INTERVAL '${days} days'
                ORDER BY swap_date ASC
            `, [stationId]);
            
            return res.rows;
        } catch (error) {
            console.error('[DailySwapHistory] Error getting history:', error.message);
            return [];
        }
    },

    /**
     * Get swap counts as an array for time series analysis
     * Returns array of daily swap counts (oldest to newest)
     */
    getSwapCountArray: async (stationId, days = 30) => {
        try {
            const history = await dailySwapHistoryModel.getHistory(stationId, days);
            
            // Fill in missing days with 0
            const result = [];
            const today = new Date();
            const historyMap = new Map(history.map(h => [h.swap_date.toISOString().split('T')[0], h.swap_count]));
            
            for (let i = days - 1; i >= 0; i--) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];
                result.push(historyMap.get(dateStr) || 0);
            }
            
            return result;
        } catch (error) {
            console.error('[DailySwapHistory] Error getting swap count array:', error.message);
            return new Array(days).fill(0);
        }
    },

    /**
     * Get hourly pattern for a station (average swaps per hour)
     */
    getHourlyPattern: async (stationId, days = 14) => {
        try {
            const history = await dailySwapHistoryModel.getHistory(stationId, days);
            
            // Aggregate hourly counts
            const hourlyTotals = new Array(24).fill(0);
            let daysWithData = 0;
            
            for (const day of history) {
                if (day.hour_breakdown && Object.keys(day.hour_breakdown).length > 0) {
                    daysWithData++;
                    for (const [hour, count] of Object.entries(day.hour_breakdown)) {
                        hourlyTotals[parseInt(hour)] += count;
                    }
                }
            }
            
            // Calculate averages
            const hourlyAverages = hourlyTotals.map(total => 
                daysWithData > 0 ? parseFloat((total / daysWithData).toFixed(2)) : 0
            );
            
            return hourlyAverages;
        } catch (error) {
            console.error('[DailySwapHistory] Error getting hourly pattern:', error.message);
            return new Array(24).fill(0);
        }
    },

    /**
     * Get statistics for a station
     */
    getStats: async (stationId, days = 30) => {
        try {
            const res = await query(`
                SELECT 
                    COUNT(*) as days_with_swaps,
                    COALESCE(SUM(swap_count), 0) as total_swaps,
                    COALESCE(AVG(swap_count), 0) as avg_daily,
                    COALESCE(MAX(swap_count), 0) as max_daily,
                    COALESCE(MIN(swap_count), 0) as min_daily,
                    COALESCE(STDDEV(swap_count), 0) as stddev_daily,
                    MODE() WITHIN GROUP (ORDER BY peak_hour) as most_common_peak_hour
                FROM daily_swap_history
                WHERE station_id = $1
                  AND swap_date >= CURRENT_DATE - INTERVAL '${days} days'
            `, [stationId]);
            
            const stats = res.rows[0] || {};
            return {
                daysWithSwaps: parseInt(stats.days_with_swaps) || 0,
                totalSwaps: parseInt(stats.total_swaps) || 0,
                avgDaily: parseFloat(stats.avg_daily) || 0,
                maxDaily: parseInt(stats.max_daily) || 0,
                minDaily: parseInt(stats.min_daily) || 0,
                stddevDaily: parseFloat(stats.stddev_daily) || 0,
                peakHour: parseInt(stats.most_common_peak_hour) || 12
            };
        } catch (error) {
            console.error('[DailySwapHistory] Error getting stats:', error.message);
            return {
                daysWithSwaps: 0,
                totalSwaps: 0,
                avgDaily: 0,
                maxDaily: 0,
                minDaily: 0,
                stddevDaily: 0,
                peakHour: 12
            };
        }
    },

    /**
     * Backfill history from partners table for existing stations
     */
    backfillFromPartners: async () => {
        try {
            // Get all partners with swap data
            const partners = await query(`
                SELECT id, total_swaps, avg_daily_swaps, created_at
                FROM partners
                WHERE total_swaps > 0 OR avg_daily_swaps > 0
            `);
            
            for (const partner of partners.rows) {
                const avgDaily = partner.avg_daily_swaps || 5;
                
                // Create 30 days of synthetic history
                const today = new Date();
                for (let i = 29; i >= 0; i--) {
                    const date = new Date(today);
                    date.setDate(date.getDate() - i);
                    const dateStr = date.toISOString().split('T')[0];
                    
                    // Add some variance (+/- 40%) with weekend pattern
                    const dayOfWeek = date.getDay();
                    const weekendMultiplier = (dayOfWeek === 0 || dayOfWeek === 6) ? 0.7 : 1.0;
                    const peakDayMultiplier = (dayOfWeek === 3 || dayOfWeek === 4) ? 1.2 : 1.0; // Wed/Thu busier
                    const variance = 0.6 + Math.random() * 0.8;
                    const swapCount = Math.max(1, Math.round(avgDaily * variance * weekendMultiplier * peakDayMultiplier));
                    
                    // Create hour breakdown (synthetic)
                    const hourBreakdown = {};
                    const peakHours = [9, 10, 11, 14, 15, 16, 17, 18];
                    for (let j = 0; j < swapCount; j++) {
                        const hour = peakHours[Math.floor(Math.random() * peakHours.length)];
                        hourBreakdown[hour] = (hourBreakdown[hour] || 0) + 1;
                    }
                    const peakHour = Object.entries(hourBreakdown)
                        .sort((a, b) => b[1] - a[1])[0]?.[0] || 12;
                    
                    await query(`
                        INSERT INTO daily_swap_history (station_id, swap_date, swap_count, hour_breakdown, peak_hour)
                        VALUES ($1, $2, $3, $4, $5)
                        ON CONFLICT (station_id, swap_date) 
                        DO UPDATE SET swap_count = $3, hour_breakdown = $4, peak_hour = $5
                    `, [partner.id, dateStr, swapCount, JSON.stringify(hourBreakdown), parseInt(peakHour)]);
                }
            }
            
            console.log(`[DailySwapHistory] Backfilled 30-day history for ${partners.rows.length} stations`);
        } catch (error) {
            console.error('[DailySwapHistory] Error backfilling:', error.message);
        }
    }
};

module.exports = dailySwapHistoryModel;
