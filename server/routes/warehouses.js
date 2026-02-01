const express = require('express');
const router = express.Router();
const warehousesModel = require('../models/warehouses');

/**
 * GET /
 * Get all warehouses
 */
router.get('/', async (req, res) => {
    try {
        const data = await warehousesModel.getAll();
        res.json({ success: true, count: data.length, data });
    } catch (error) {
        console.error('Error fetching warehouses:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /:id
 * Get warehouse by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const data = await warehousesModel.getById(req.params.id);
        if (data) {
            res.json({ success: true, data });
        } else {
            res.status(404).json({ success: false, error: 'Warehouse not found' });
        }
    } catch (error) {
        console.error('Error fetching warehouse:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
