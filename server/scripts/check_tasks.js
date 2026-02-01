const { pool } = require('../config/database');

async function check() {
    try {
        const res = await pool.query("SELECT id, status, source_id, target_id, created_at FROM transfer_tasks WHERE status IN ('PENDING', 'PENDING_SENDER_APPROVAL') ORDER BY created_at DESC");
        console.log('Pending Tasks in DB:', JSON.stringify(res.rows, null, 2));
        console.log('Total Count:', res.rows.length);

        const allRes = await pool.query("SELECT id, status FROM transfer_tasks LIMIT 5");
        console.log('Sample Tasks (All Status):', allRes.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

check();
