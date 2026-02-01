const { agentActions } = require('../services/ai/agent');
require('dotenv').config();

async function test() {
    try {
        console.log('--- Direct Agent Test ---');
        console.log('Calling approvePendingTransfers...');
        const result = await agentActions.approvePendingTransfers();
        console.log('Result:', JSON.stringify(result, null, 2));
    } catch (e) {
        console.error('Agent Test Failed:', e);
    }
}

test();
