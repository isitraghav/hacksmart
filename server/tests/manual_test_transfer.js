const { pool } = require('../config/database');

async function test() {
    try {
        console.log('--- Manual Transfer Test ---');

        // 1. Get a partner
        const res = await pool.query('SELECT id FROM partners WHERE is_active_dsk = true LIMIT 1');
        if (res.rows.length === 0) throw new Error('No partners found');
        const partnerId = res.rows[0].id;
        console.log('1. Selected Partner:', partnerId);

        // 2. Create Transfer Request
        console.log('2. Creating transfer request...');
        const createRes = await fetch('http://localhost:1234/api/logistics/transfers/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sourceId: 4,
                targetId: partnerId,
                amount: 3,
                type: 'WAREHOUSE_DISPATCH',
                sourceType: 'WAREHOUSE',
                reason: 'Test AI Approval Flow'
            })
        });

        const createJson = await createRes.json();
        if (!createJson.success) throw new Error('Failed to create task: ' + (createJson.error || 'Unknown error'));
        const task = createJson.data;
        console.log('   Task Created:', task.id, '| Status:', task.status);

        if (task.status !== 'PENDING_SENDER_APPROVAL') throw new Error('Wrong initial status: ' + task.status);

        // 3. Trigger AI Approval
        console.log('3. Triggering AI Approval...');
        const approveRes = await fetch('http://localhost:1234/api/logistics/agent/process-approvals', {
            method: 'POST'
        });
        const approveJson = await approveRes.json();
        // console.log('   AI Response:', JSON.stringify(approveJson, null, 2));

        if (approveJson.success) {
            console.log('   AI Integration: Success');
            if (approveJson.result && approveJson.result.output) {
                console.log('   AI Output:', approveJson.result.output);
            }
        } else {
            console.log('   AI Integration: Failed/Error', approveJson);
        }

        // 4. Verify Task Status
        console.log('4. Verifying Task Status in DB...');
        const verifyRes = await pool.query('SELECT * FROM transfer_tasks WHERE id = $1', [task.id]);
        const updatedTask = verifyRes.rows[0];
        console.log('   Updated Task Status:', updatedTask.status);

        if (updatedTask.financials && typeof updatedTask.financials === 'object') {
            console.log('   Approved By:', updatedTask.financials.approvedBy);
            console.log('   Notes:', updatedTask.financials.approvalNotes);
        }

        if (updatedTask.status === 'ASSIGNED' || updatedTask.status === 'IN_PROGRESS' || updatedTask.status === 'APPROVED') {
            console.log('✅ SUCCESS: Task was approved!');
        } else if (updatedTask.status === 'CANCELLED' || updatedTask.status === 'REJECTED') {
            console.log('⚠️  Task was REJECTED');
        } else if (updatedTask.status === 'PENDING_SENDER_APPROVAL') {
            console.log('❌ FAILURE: Task status did not change (AI did not approve)');
        } else {
            console.log('❓ UNKNOWN: Status is ' + updatedTask.status);
        }

    } catch (e) {
        console.error('❌ Test Failed:', e.message);
        if (e.cause) console.error(e.cause);
    } finally {
        await pool.end();
    }
}

test();
