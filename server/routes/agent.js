/**
 * AI Agent API Routes
 * Endpoints for interacting with the LangChain inventory management agent
 */

const express = require('express');
const router = express.Router();
const agentService = require('../services/ai/agent');

/**
 * POST /chat
 * Send a message to the AI agent
 * Body: { message, sessionId?, context? }
 */
router.post('/chat', async (req, res) => {
    try {
        const { message, sessionId, context } = req.body;
        
        if (!message) {
            return res.status(400).json({ success: false, error: 'Message is required' });
        }
        
        const result = await agentService.processRequest(
            message,
            sessionId || `session_${Date.now()}`,
            context || {}
        );
        
        res.json(result);
    } catch (error) {
        console.error('Agent chat error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /analyze
 * Analyze the network and get rebalancing recommendations
 */
router.post('/analyze', async (req, res) => {
    try {
        const { sessionId } = req.body;
        const result = await agentService.agentActions.analyzeNetwork(sessionId);
        res.json(result);
    } catch (error) {
        console.error('Agent analyze error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /request-rebalancing
 * Request inventory rebalancing for a specific station
 * Body: { stationId, sessionId? }
 */
router.post('/request-rebalancing', async (req, res) => {
    try {
        const { stationId, sessionId } = req.body;
        
        if (!stationId) {
            return res.status(400).json({ success: false, error: 'stationId is required' });
        }
        
        const result = await agentService.agentActions.requestRebalancing(stationId, sessionId);
        res.json(result);
    } catch (error) {
        console.error('Agent rebalancing error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /station-status/:stationId
 * Get AI analysis of a station's status
 */
router.get('/station-status/:stationId', async (req, res) => {
    try {
        const { stationId } = req.params;
        const result = await agentService.agentActions.getStationStatus(stationId);
        res.json(result);
    } catch (error) {
        console.error('Agent station status error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /auto-approve
 * Auto-approve high priority pending tasks
 * Body: { approverId }
 */
router.post('/auto-approve', async (req, res) => {
    try {
        const { approverId } = req.body;
        
        if (!approverId) {
            return res.status(400).json({ success: false, error: 'approverId is required' });
        }
        
        const result = await agentService.agentActions.autoApproveHighPriority(approverId);
        res.json(result);
    } catch (error) {
        console.error('Agent auto-approve error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /session/:sessionId
 * Clear chat history for a session
 */
router.delete('/session/:sessionId', (req, res) => {
    try {
        const { sessionId } = req.params;
        agentService.clearHistory(sessionId);
        res.json({ success: true, message: `Session ${sessionId} cleared` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /health
 * Check if the AI agent is properly configured
 */
router.get('/health', (req, res) => {
    const hasApiKey = !!process.env.GROQ_API_KEY;
    res.json({
        success: true,
        status: hasApiKey ? 'ready' : 'missing_api_key',
        message: hasApiKey 
            ? 'AI Agent is ready' 
            : 'GROQ_API_KEY not configured. Set it in .env file.'
    });
});

module.exports = router;
