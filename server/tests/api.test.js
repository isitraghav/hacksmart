/**
 * API Tests for HackSmart Server
 * Run with: npm test
 */

const BASE_URL = process.env.API_URL || 'http://localhost:1234';

// Simple test runner
const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
    tests.push({ name, fn });
}

async function runTests() {
    console.log('\n===========================================');
    console.log('       HackSmart API Test Suite           ');
    console.log('===========================================\n');
    console.log(`Testing: ${BASE_URL}\n`);

    for (const { name, fn } of tests) {
        try {
            await fn();
            console.log(`✓ ${name}`);
            passed++;
        } catch (error) {
            console.log(`✗ ${name}`);
            console.log(`  Error: ${error.message}\n`);
            failed++;
        }
    }

    console.log('\n===========================================');
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('===========================================\n');

    process.exit(failed > 0 ? 1 : 0);
}

// Helper to make API requests
async function api(endpoint, options = {}) {
    const url = `${BASE_URL}${endpoint}`;
    const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    });
    const data = await response.json();
    return { status: response.status, data };
}

function expect(actual) {
    return {
        toBe(expected) {
            if (actual !== expected) {
                throw new Error(`Expected ${expected} but got ${actual}`);
            }
        },
        toBeGreaterThan(expected) {
            if (actual <= expected) {
                throw new Error(`Expected ${actual} to be greater than ${expected}`);
            }
        },
        toBeTruthy() {
            if (!actual) {
                throw new Error(`Expected truthy value but got ${actual}`);
            }
        },
        toBeArray() {
            if (!Array.isArray(actual)) {
                throw new Error(`Expected array but got ${typeof actual}`);
            }
        },
        toHaveProperty(prop) {
            if (!(prop in actual)) {
                throw new Error(`Expected object to have property "${prop}"`);
            }
        },
    };
}

// ==========================================
// Health Check Tests
// ==========================================

test('GET / - Health check', async () => {
    const { status, data } = await api('/');
    expect(status).toBe(200);
    expect(data.name).toBe('HackSmart API Server');
});

test('GET /api/health - API health check', async () => {
    const { status, data } = await api('/api/health');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
});

// ==========================================
// Partners API Tests
// ==========================================

test('GET /api/partners - Get all partners', async () => {
    const { status, data } = await api('/api/partners');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toBeArray();
    expect(data.count).toBeGreaterThan(0);
});

test('GET /api/partners?limit=5 - Get partners with limit', async () => {
    const { status, data } = await api('/api/partners?limit=5');
    expect(status).toBe(200);
    expect(data.data.length).toBe(5);
});

test('GET /api/partners/stats - Get partner stats', async () => {
    const { status, data } = await api('/api/partners/stats');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('total_partners');
    expect(data.data).toHaveProperty('active_partners');
    expect(data.data).toHaveProperty('inactive_partners');
});

test('GET /api/partners/active - Get active partners', async () => {
    const { status, data } = await api('/api/partners/active');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toBeArray();
});

test('GET /api/partners/inactive - Get inactive partners', async () => {
    const { status, data } = await api('/api/partners/inactive');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toBeArray();
});

test('GET /api/partners/:id - Get partner by ID', async () => {
    // First get a valid partner ID
    const { data: listData } = await api('/api/partners?limit=1');
    if (listData.data.length > 0) {
        const partnerId = listData.data[0].id;
        const { status, data } = await api(`/api/partners/${partnerId}`);
        expect(status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.id).toBe(partnerId);
    }
});

test('GET /api/partners/nearby?lat=26.85&lon=80.9&radius=10 - Get nearby partners', async () => {
    const { status, data } = await api('/api/partners/nearby?lat=26.85&lon=80.9&radius=10');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toBeArray();
});

// ==========================================
// Charging Events API Tests
// ==========================================

test('GET /api/charging-events - Get all charging events', async () => {
    const { status, data } = await api('/api/charging-events');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toBeArray();
});

test('GET /api/charging-events?limit=10 - Get charging events with limit', async () => {
    const { status, data } = await api('/api/charging-events?limit=10');
    expect(status).toBe(200);
    expect(data.data.length).toBe(10);
});

test('GET /api/charging-events/stats - Get charging event stats', async () => {
    const { status, data } = await api('/api/charging-events/stats');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('total_events');
});

test('GET /api/charging-events/devices - Get device list', async () => {
    const { status, data } = await api('/api/charging-events/devices');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toBeArray();
});

test('GET /api/charging-events/daily - Get daily stats', async () => {
    const { status, data } = await api('/api/charging-events/daily');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toBeArray();
});

// ==========================================
// Battery Logs API Tests
// ==========================================

test('GET /api/battery-logs - Get all battery logs', async () => {
    const { status, data } = await api('/api/battery-logs');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toBeArray();
});

test('GET /api/battery-logs?limit=10 - Get battery logs with limit', async () => {
    const { status, data } = await api('/api/battery-logs?limit=10');
    expect(status).toBe(200);
    expect(data.data.length).toBe(10);
});

test('GET /api/battery-logs/stats - Get battery log stats', async () => {
    const { status, data } = await api('/api/battery-logs/stats');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('total_logs');
});

test('GET /api/battery-logs/occupants - Get occupant list', async () => {
    const { status, data } = await api('/api/battery-logs/occupants');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toBeArray();
});

test('GET /api/battery-logs/misplaced - Get misplaced batteries', async () => {
    const { status, data } = await api('/api/battery-logs/misplaced');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toBeArray();
});

// ==========================================
// OSRM API Tests  
// ==========================================

test('GET /api/osrm/route - Get route', async () => {
    const { status, data } = await api('/api/osrm/route?startLat=26.85&startLon=80.9&endLat=26.87&endLon=80.95');
    // May fail if OSRM server is unavailable, just check structure
    expect(status).toBe(200);
    expect(data).toHaveProperty('success');
});

test('GET /api/osrm/nearest?lon=80.9&lat=26.85 - Get nearest road point', async () => {
    const { status, data } = await api('/api/osrm/nearest?lon=80.9&lat=26.85');
    expect(status).toBe(200);
    expect(data).toHaveProperty('success');
});

// ==========================================
// Navigation API Tests
// ==========================================

test('POST /api/navigation/plan - Plan route', async () => {
    // Short route (direct)
    const { status, data } = await api('/api/navigation/plan', {
        method: 'POST',
        body: JSON.stringify({
            startLat: 26.85,
            startLon: 80.9,
            endLat: 26.87,
            endLon: 80.95
        })
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('type');
});

// ==========================================
// Error Handling Tests
// ==========================================

test('GET /api/partners/INVALID_ID - Returns 404 for invalid partner', async () => {
    const { status, data } = await api('/api/partners/INVALID_ID_THAT_DOES_NOT_EXIST');
    expect(status).toBe(404);
    expect(data.success).toBe(false);
});

test('GET /api/nonexistent - Returns 404 for unknown endpoint', async () => {
    const { status } = await api('/api/nonexistent');
    expect(status).toBe(404);
});

// Run all tests
runTests();
