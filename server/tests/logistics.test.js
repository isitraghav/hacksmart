// const app = require('../index'); // Removed to avoid port conflict
const logisticsAgent = require('../services/logisticsAgent');
const transferTasksModel = require('../models/transferTasks');
const partnersModel = require('../models/partners');
const warehousesModel = require('../models/warehouses');

// Mock Data
const mockPartners = [
    { id: 'S1', is_active_dsk: true, total_batteries: 10, fully_charged_batteries: 1, latitude: 10, longitude: 10 },
    { id: 'S2', is_active_dsk: true, total_batteries: 10, fully_charged_batteries: 8, latitude: 10.05, longitude: 10.05 }
];
const mockWarehouses = [
    { name: 'W1', charged_batteries: 15, latitude: 10.1, longitude: 10.1 }
];

// Mock dependencies
partnersModel.getAll = async () => mockPartners;
warehousesModel.getAll = async () => mockWarehouses;
// We mock transferTasksModel slightly differently to simulate DB behavior in-memory
let mockDb = [];
transferTasksModel.getActive = async () => mockDb.filter(t => t.status !== 'COMPLETED');
transferTasksModel.getAll = async () => mockDb;
transferTasksModel.create = async (task) => {
    const newTask = { ...task, id: 'JOB-' + Math.floor(Math.random() * 1000), created_at: new Date() };
    mockDb.push(newTask);
    return newTask;
};
transferTasksModel.updateStatus = async (id, status) => {
    const task = mockDb.find(t => t.id === id);
    if (task) task.status = status;
    return task;
};


async function runTest() {
    console.log('=== Testing Logistics Agent End-to-End ===');

    // 1. Run Scan
    console.log('1. Running Agent Scan...');
    const result = await logisticsAgent.runProtocol();
    console.log(`   Tasks Created: ${result.tasksCreated}`);

    console.assert(result.tasksCreated === 1, 'Should create 1 task');
    console.assert(mockDb.length === 1, 'DB should have 1 record');

    const task = mockDb[0];
    console.log(`   Task Generated: ${task.type} from ${task.source_id}`);

    // 2. Simulate Completion
    console.log('2. Simulating Completion...');
    await logisticsAgent.completeTask(task.id);

    console.assert(mockDb[0].status === 'COMPLETED', 'Task status should be COMPLETED');
    console.log('   Task marked COMPLETED');

    console.log('ALL TESTS PASSED');
}

runTest();
