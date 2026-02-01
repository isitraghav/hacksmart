/**
 * Notification System Tests
 * Tests for notification creation, delivery, and filtering
 */

require('dotenv').config();
const { pool } = require('../config/database');

async function setupTestData() {
    console.log('Setting up test notifications...');
    
    // Clear test notifications
    await pool.query(`DELETE FROM notifications WHERE recipient_id LIKE 'TEST%'`);
    
    console.log('✓ Test data setup complete');
}

async function cleanupTestData() {
    console.log('Cleaning up test notifications...');
    await pool.query(`DELETE FROM notifications WHERE recipient_id LIKE 'TEST%'`);
    console.log('✓ Test data cleanup complete');
}

// Test 1: Create Transfer Request Notification
async function testCreateTransferNotification() {
    console.log('\n--- Test 1: Create Transfer Request Notification ---');
    
    try {
        const result = await pool.query(`
            INSERT INTO notifications (
                recipient_type, recipient_id, type, title, message, data, is_read
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [
            'PARTNER',
            'TEST_P001',
            'TRANSFER_REQUEST',
            '📦 Task Assigned: Deliver 5 Batteries',
            'AI Agent has assigned you a delivery task.\n\n📍 Destination: Station A\n🔋 Quantity: 5 batteries',
            { taskId: 'TEST_TASK_001', quantity: 5, urgency: 'CRITICAL', autoApproved: true },
            false
        ]);
        
        const notification = result.rows[0];
        
        console.log('Created Notification:', {
            id: notification.id,
            type: notification.type,
            recipient: notification.recipient_id,
            title: notification.title
        });
        
        if (!notification.id) {
            console.log('❌ Notification not created');
            return false;
        }
        
        if (notification.recipient_type !== 'PARTNER') {
            console.log('❌ Incorrect recipient type');
            return false;
        }
        
        const data = notification.data;
        if (!data.autoApproved) {
            console.log('❌ Auto-approved flag not set');
            return false;
        }
        
        console.log('✅ Test 1 PASSED: Transfer notification created successfully');
        return true;
        
    } catch (error) {
        console.error('❌ Test 1 FAILED:', error.message);
        return false;
    }
}

// Test 2: Filter Notifications by Type
async function testFilterNotifications() {
    console.log('\n--- Test 2: Filter Notifications by Type ---');
    
    try {
        // Create multiple notification types
        const types = ['TRANSFER_REQUEST', 'TRANSFER_COMPLETED', 'LOW_INVENTORY', 'CONGESTION_DETECTED'];
        
        for (const type of types) {
            await pool.query(`
                INSERT INTO notifications (recipient_type, recipient_id, type, title, message, data, is_read)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, ['PARTNER', 'TEST_P002', type, `Test ${type}`, 'Test message', '{}', false]);
        }
        
        // Query specific type
        const transferNotifs = await pool.query(`
            SELECT * FROM notifications 
            WHERE recipient_id = $1 AND type = $2
            ORDER BY created_at DESC
        `, ['TEST_P002', 'TRANSFER_REQUEST']);
        
        console.log('Transfer Notifications:', transferNotifs.rows.length);
        
        if (transferNotifs.rows.length !== 1) {
            console.log('❌ Expected 1 transfer notification, got', transferNotifs.rows.length);
            return false;
        }
        
        // Query all for recipient
        const allNotifs = await pool.query(`
            SELECT * FROM notifications WHERE recipient_id = $1
        `, ['TEST_P002']);
        
        console.log('All Notifications:', allNotifs.rows.length);
        
        if (allNotifs.rows.length !== types.length) {
            console.log('❌ Expected', types.length, 'notifications, got', allNotifs.rows.length);
            return false;
        }
        
        console.log('✅ Test 2 PASSED: Notification filtering works');
        return true;
        
    } catch (error) {
        console.error('❌ Test 2 FAILED:', error.message);
        return false;
    }
}

// Test 3: Mark Notification as Read
async function testMarkAsRead() {
    console.log('\n--- Test 3: Mark Notification as Read ---');
    
    try {
        // Create unread notification
        const createResult = await pool.query(`
            INSERT INTO notifications (recipient_type, recipient_id, type, title, message, data, is_read)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, ['PARTNER', 'TEST_P003', 'LOW_INVENTORY', 'Low Inventory Alert', 'Test', '{}', false]);
        
        const notifId = createResult.rows[0].id;
        
        // Verify it's unread
        if (createResult.rows[0].is_read) {
            console.log('❌ Notification should be unread initially');
            return false;
        }
        
        // Mark as read
        await pool.query(`
            UPDATE notifications SET is_read = true
            WHERE id = $1
        `, [notifId]);
        
        // Verify it's now read
        const checkResult = await pool.query(`
            SELECT * FROM notifications WHERE id = $1
        `, [notifId]);
        
        const updated = checkResult.rows[0];
        
        if (!updated.is_read) {
            console.log('❌ Notification should be marked as read');
            return false;
        }
        
        console.log('✅ Test 3 PASSED: Mark as read works correctly');
        return true;
        
    } catch (error) {
        console.error('❌ Test 3 FAILED:', error.message);
        return false;
    }
}

// Test 4: Notification Data Integrity
async function testDataIntegrity() {
    console.log('\n--- Test 4: Notification Data Integrity ---');
    
    try {
        const testData = {
            taskId: 'TASK_123',
            sourceId: 'P001',
            targetId: 'P002',
            quantity: 10,
            urgency: 'CRITICAL',
            autoApproved: true,
            estimatedArrival: '30-60 mins'
        };
        
        // Create notification with complex data
        const result = await pool.query(`
            INSERT INTO notifications (recipient_type, recipient_id, type, title, message, data, is_read)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [
            'PARTNER',
            'TEST_P004',
            'TRANSFER_REQUEST',
            'Test Data Integrity',
            'Test message',
            testData,
            false
        ]);
        
        const notification = result.rows[0];
        const retrievedData = notification.data;
        
        // Verify all fields
        const fieldsMatch = Object.keys(testData).every(key => {
            const match = retrievedData[key] === testData[key];
            if (!match) {
                console.log(`❌ Field mismatch: ${key} - Expected ${testData[key]}, got ${retrievedData[key]}`);
            }
            return match;
        });
        
        if (!fieldsMatch) {
            console.log('❌ Data fields do not match');
            return false;
        }
        
        console.log('✅ Test 4 PASSED: Data integrity maintained');
        return true;
        
    } catch (error) {
        console.error('❌ Test 4 FAILED:', error.message);
        return false;
    }
}

// Test 5: Unread Count
async function testUnreadCount() {
    console.log('\n--- Test 5: Unread Count ---');
    
    try {
        // Create mix of read and unread
        await pool.query(`
            INSERT INTO notifications (recipient_type, recipient_id, type, title, message, data, is_read)
            VALUES 
                ('PARTNER', 'TEST_P005', 'TRANSFER_REQUEST', 'Unread 1', 'Test', '{}', false),
                ('PARTNER', 'TEST_P005', 'TRANSFER_REQUEST', 'Unread 2', 'Test', '{}', false),
                ('PARTNER', 'TEST_P005', 'TRANSFER_REQUEST', 'Read 1', 'Test', '{}', true),
                ('PARTNER', 'TEST_P005', 'TRANSFER_REQUEST', 'Read 2', 'Test', '{}', true)
        `);
        
        // Count unread
        const unreadResult = await pool.query(`
            SELECT COUNT(*) as count FROM notifications 
            WHERE recipient_id = $1 AND is_read = false
        `, ['TEST_P005']);
        
        const unreadCount = parseInt(unreadResult.rows[0].count);
        
        console.log('Unread Count:', unreadCount);
        
        if (unreadCount !== 2) {
            console.log('❌ Expected 2 unread notifications, got', unreadCount);
            return false;
        }
        
        console.log('✅ Test 5 PASSED: Unread count correct');
        return true;
        
    } catch (error) {
        console.error('❌ Test 5 FAILED:', error.message);
        return false;
    }
}

// Main Test Runner
async function runTests() {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║  NOTIFICATION SYSTEM TEST SUITE                        ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    
    try {
        await setupTestData();
        
        const results = {
            createTransferNotification: await testCreateTransferNotification(),
            filterNotifications: await testFilterNotifications(),
            markAsRead: await testMarkAsRead(),
            dataIntegrity: await testDataIntegrity(),
            unreadCount: await testUnreadCount()
        };
        
        await cleanupTestData();
        
        // Summary
        console.log('\n╔════════════════════════════════════════════════════════╗');
        console.log('║  TEST SUMMARY                                          ║');
        console.log('╚════════════════════════════════════════════════════════╝');
        
        const passed = Object.values(results).filter(r => r).length;
        const total = Object.keys(results).length;
        
        Object.entries(results).forEach(([name, passed]) => {
            const icon = passed ? '✅' : '❌';
            console.log(`${icon} ${name}: ${passed ? 'PASSED' : 'FAILED'}`);
        });
        
        console.log(`\n${passed}/${total} tests passed`);
        
        if (passed === total) {
            console.log('\n🎉 All tests passed!\n');
        } else {
            console.log(`\n⚠️  ${total - passed} test(s) failed\n`);
        }
        
        process.exit(passed === total ? 0 : 1);
        
    } catch (error) {
        console.error('Test suite error:', error);
        await cleanupTestData();
        process.exit(1);
    }
}

// Run tests if called directly
if (require.main === module) {
    runTests();
}

module.exports = { runTests };
