const { pool } = require('../config/database');

async function check() {
    console.log('--- Checking Transfer Tasks ---');
    const res = await pool.query('SELECT COUNT(*) FROM transfer_tasks');
    console.log(`Total Transfer Tasks: ${res.rows[0].count}`);

    // Show latest
    const latest = await pool.query('SELECT * FROM transfer_tasks ORDER BY created_at DESC LIMIT 1');
    if (latest.rows.length > 0) {
        console.log('Latest Task:', JSON.stringify(latest.rows[0], null, 2));
    }
    await pool.end();
}

check().catch(console.error);
