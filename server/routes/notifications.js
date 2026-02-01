const express = require('express');
const router = express.Router();
const { notificationsModel, NotificationTypes } = require('../models/notifications');

/**
 * GET /
 * Get notifications for a recipient
 * Query: recipientType, recipientId, limit?, unreadOnly?
 */
router.get('/', async (req, res) => {
    try {
        const { recipientType, recipientId, limit, unreadOnly } = req.query;
        
        if (!recipientType || !recipientId) {
            return res.status(400).json({ error: 'recipientType and recipientId required' });
        }
        
        const notifications = await notificationsModel.getByRecipient(
            recipientType.toUpperCase(),
            recipientId,
            { 
                limit: parseInt(limit) || 50, 
                unreadOnly: unreadOnly === 'true' 
            }
        );
        
        const unreadCount = await notificationsModel.getUnreadCount(
            recipientType.toUpperCase(),
            recipientId
        );
        
        res.json({ 
            success: true, 
            data: notifications,
            unreadCount,
            count: notifications.length
        });
    } catch (e) {
        console.error('Error fetching notifications:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * GET /unread-count
 * Get unread count for a recipient
 */
router.get('/unread-count', async (req, res) => {
    try {
        const { recipientType, recipientId } = req.query;
        
        if (!recipientType || !recipientId) {
            return res.status(400).json({ error: 'recipientType and recipientId required' });
        }
        
        const count = await notificationsModel.getUnreadCount(
            recipientType.toUpperCase(),
            recipientId
        );
        
        res.json({ success: true, count });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /
 * Create a new notification (for testing/admin)
 * Body: { recipientType, recipientId, type, title, message, data? }
 */
router.post('/', async (req, res) => {
    try {
        const { recipientType, recipientId, type, title, message, data } = req.body;
        
        if (!recipientType || !recipientId || !type || !title || !message) {
            return res.status(400).json({ 
                error: 'recipientType, recipientId, type, title, and message are required' 
            });
        }
        
        const notification = await notificationsModel.create({
            recipientType: recipientType.toUpperCase(),
            recipientId,
            type,
            title,
            message,
            data
        });
        
        res.json({ success: true, data: notification });
    } catch (e) {
        console.error('Error creating notification:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * PUT /:id/read
 * Mark a notification as read
 */
router.put('/:id/read', async (req, res) => {
    try {
        const notification = await notificationsModel.markAsRead(req.params.id);
        
        if (!notification) {
            return res.status(404).json({ error: 'Notification not found' });
        }
        
        res.json({ success: true, data: notification });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * PUT /mark-all-read
 * Mark all notifications as read for a recipient
 */
router.put('/mark-all-read', async (req, res) => {
    try {
        const { recipientType, recipientId } = req.body;
        
        if (!recipientType || !recipientId) {
            return res.status(400).json({ error: 'recipientType and recipientId required' });
        }
        
        const notifications = await notificationsModel.markAllAsRead(
            recipientType.toUpperCase(),
            recipientId
        );
        
        res.json({ 
            success: true, 
            message: `Marked ${notifications.length} notifications as read`,
            count: notifications.length
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * GET /types
 * Get available notification types
 */
router.get('/types', (req, res) => {
    res.json({ success: true, types: NotificationTypes });
});

module.exports = router;
