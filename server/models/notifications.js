const { query } = require('../config/database');

const notificationsModel = {
    /**
     * Create a new notification
     */
    create: async ({ recipientType, recipientId, type, title, message, data = null }) => {
        const sql = `
            INSERT INTO notifications (recipient_type, recipient_id, type, title, message, data)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `;
        const res = await query(sql, [recipientType, recipientId, type, title, message, data ? JSON.stringify(data) : null]);
        return res.rows[0];
    },

    /**
     * Get notifications for a recipient
     */
    getByRecipient: async (recipientType, recipientId, { limit = 50, unreadOnly = false } = {}) => {
        let sql = `
            SELECT * FROM notifications 
            WHERE recipient_type = $1 AND recipient_id = $2
        `;
        const params = [recipientType, recipientId];
        
        if (unreadOnly) {
            sql += ` AND is_read = FALSE`;
        }
        
        sql += ` ORDER BY created_at DESC LIMIT $3`;
        params.push(limit);
        
        const res = await query(sql, params);
        return res.rows;
    },

    /**
     * Get unread count for a recipient
     */
    getUnreadCount: async (recipientType, recipientId) => {
        const sql = `
            SELECT COUNT(*) as count FROM notifications 
            WHERE recipient_type = $1 AND recipient_id = $2 AND is_read = FALSE
        `;
        const res = await query(sql, [recipientType, recipientId]);
        return parseInt(res.rows[0].count) || 0;
    },

    /**
     * Mark a single notification as read
     */
    markAsRead: async (id) => {
        const sql = `UPDATE notifications SET is_read = TRUE WHERE id = $1 RETURNING *`;
        const res = await query(sql, [id]);
        return res.rows[0];
    },

    /**
     * Mark all notifications as read for a recipient
     */
    markAllAsRead: async (recipientType, recipientId) => {
        const sql = `
            UPDATE notifications SET is_read = TRUE 
            WHERE recipient_type = $1 AND recipient_id = $2 AND is_read = FALSE
            RETURNING *
        `;
        const res = await query(sql, [recipientType, recipientId]);
        return res.rows;
    },

    /**
     * Delete old notifications (older than X days)
     */
    deleteOld: async (days = 30) => {
        const sql = `
            DELETE FROM notifications 
            WHERE created_at < NOW() - INTERVAL '${days} days'
            RETURNING id
        `;
        const res = await query(sql);
        return res.rows.length;
    },

    /**
     * Send notification to multiple recipients
     */
    broadcast: async (recipientType, recipientIds, { type, title, message, data = null }) => {
        const notifications = [];
        for (const recipientId of recipientIds) {
            const notif = await notificationsModel.create({
                recipientType,
                recipientId,
                type,
                title,
                message,
                data
            });
            notifications.push(notif);
        }
        return notifications;
    }
};

// Notification types enum for consistency
const NotificationTypes = {
    // Driver notifications
    SWAP_COMPLETE: 'SWAP_COMPLETE',
    LOW_BATTERY_WARNING: 'LOW_BATTERY_WARNING',
    STATION_NEARBY: 'STATION_NEARBY',
    PAYMENT_DUE: 'PAYMENT_DUE',
    LEAVE_PENALTY: 'LEAVE_PENALTY',
    SERVICE_CHARGE: 'SERVICE_CHARGE',
    PENALTY_CLEARED: 'PENALTY_CLEARED',
    
    // Partner notifications
    BATTERY_RECEIVED: 'BATTERY_RECEIVED',
    BATTERY_DISPATCHED: 'BATTERY_DISPATCHED',
    LOW_INVENTORY: 'LOW_INVENTORY',
    INVENTORY_CRITICAL: 'INVENTORY_CRITICAL',
    TRANSFER_REQUEST: 'TRANSFER_REQUEST',
    TRANSFER_APPROVED: 'TRANSFER_APPROVED',
    TRANSFER_REJECTED: 'TRANSFER_REJECTED',
    REBALANCING_INITIATED: 'REBALANCING_INITIATED',
    REBALANCING_URGENT: 'REBALANCING_URGENT',
    REBALANCING_PLANNED: 'REBALANCING_PLANNED',
    
    // Warehouse notifications
    DISPATCH_REQUEST: 'DISPATCH_REQUEST',
    TRANSFER_COMPLETE: 'TRANSFER_COMPLETE',
    INVENTORY_ALERT: 'INVENTORY_ALERT',
    APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
    
    // General
    SYSTEM_ALERT: 'SYSTEM_ALERT',
    INFO: 'INFO'
};

module.exports = { notificationsModel, NotificationTypes };
