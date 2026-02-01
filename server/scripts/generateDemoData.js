/**
 * Generate Demo Data Script (Synthetic)
 * Generates Partners from CSV (locations), but purely synthetic Batteries, Drivers, and Logs.
 * Enforces: 4-15 batteries per station inventory.
 * Usage: node scripts/generateDemoData.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');
const { pool } = require('../config/database');
const migrate = require('./migrate');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PARTNERS_FILE = path.join(DATA_DIR, 'Partners.xlsx - result.csv');

// --- Helper Functions ---

function parseBoolean(value) {
    if (value === null || value === undefined || value === '') return false;
    const lower = String(value).toLowerCase().trim();
    return lower === 'true' || lower === '1' || lower === 'yes';
}

function parseNumber(value) {
    if (value === null || value === undefined || value === '' || value === 'null') return null;
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
}

function getRandomFloat(min, max, decimals = 4) {
    const str = (Math.random() * (max - min) + min).toFixed(decimals);
    return parseFloat(str);
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function readCsv(filePath) {
    if (!fs.existsSync(filePath)) return [];
    return new Promise((resolve, reject) => {
        const records = [];
        fs.createReadStream(filePath)
            .pipe(parse({
                columns: true,
                skip_empty_lines: true,
                trim: true,
                delimiter: [',', '\t'],
            }))
            .on('data', (row) => records.push(row))
            .on('end', () => resolve(records))
            .on('error', reject);
    });
}

function generateBatteryId(prefix, index) {
    // Unique ID: Prefix + Timestamp + Random + Index
    return `${prefix}_${Date.now().toString(36)}_${index}`;
}

async function bulkInsert(tableName, columns, rows, conflictParams = '') {
    if (rows.length === 0) return 0;
    let inserted = 0;
    const batchSize = 1000;

    for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const valuePlaceholders = [];
        const flatParams = [];

        batch.forEach((row) => {
            const rowPlaceholders = [];
            row.forEach((colVal) => {
                rowPlaceholders.push(`$${flatParams.length + 1}`);
                flatParams.push(colVal);
            });
            valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
        });

        const sql = `
            INSERT INTO ${tableName} (${columns.join(', ')})
            VALUES ${valuePlaceholders.join(', ')}
            ${conflictParams}
        `;

        try {
            await pool.query(sql, flatParams);
            inserted += batch.length;
            process.stdout.write(`\r   -> Table ${tableName}: Inserted ${inserted}/${rows.length}`);
        } catch (e) {
            console.error(`\n   Error inserting into ${tableName}:`, e.message);
        }
    }
    console.log('');
    return inserted;
}

// --- Main Logic ---

async function main() {
    console.log('🚀 Starting SYNTHETIC Data Generation...');

    // 1. Run Migrations
    console.log('\n--- 1. Database Migrations ---');
    await migrate.runMigrations(false);

    // 2. Clear Data
    console.log('\n--- 2. Clearing Existing Data ---');
    try {
        await pool.query('DELETE FROM battery_logs');
        await pool.query('DELETE FROM charging_events');
        await pool.query('DELETE FROM drivers');
        await pool.query('DELETE FROM batteries');
        await pool.query('DELETE FROM partners');
        await pool.query('DELETE FROM users');
        await pool.query('DELETE FROM warehouses');
        await pool.query('DELETE FROM tickets');
        await pool.query('DELETE FROM transfer_tasks');

        const check = await pool.query('SELECT count(*) FROM batteries');
        if (parseInt(check.rows[0].count) > 0) {
            throw new Error('Database not clear after delete');
        }
        console.log('   Stats: DB Cleared.');
    } catch (e) {
        console.error('   Error clearing data:', e.message);
        process.exit(1);
    }

    const genericPasswordHash = await bcrypt.hash('123456789', 10);

    // 3. Import Partners
    console.log('\n--- 3. Importing Partners & Generating Inventory ---');
    const partners = await readCsv(PARTNERS_FILE);
    console.log(`   Loaded ${partners.length} partners from CSV.`);

    const partnerRows = [];
    const userRows = [];
    const batteryRows = [];
    const logRows = [];
    const eventRows = [];
    const driverRows = [];

    // Arrays for bulk inserts

    // Logic:
    // For each partner:
    //  - Insert Partner
    //  - Create User (PARTNER)
    //  - Generate 4-15 batteries (Status=CHARGING/IDLE, current_station_id=PartnerID)
    //  - Generate 0-1 Drivers nearby (Status=ACTIVE, current_battery_id=NEW_BATTERY)

    let totalBatteries = 0;
    let totalDrivers = 0;

    for (const p of partners) {
        const pId = p.id;
        const lat = parseNumber(p.latitude);
        const lon = parseNumber(p.longitude);
        const isActive = parseBoolean(p.isActiveDsk);

        // Filter: Only include ACTIVE partners with valid location
        if (isActive && lat && lon) {
            let partnerTotalBatteries = 0;
            let partnerChargedBatteries = 0;

            // Station Inventory: 4 to 15
            const inventoryCount = getRandomInt(4, 15);
            for (let k = 0; k < inventoryCount; k++) {
                const bId = `B_${pId}_${k}`;
                const soc = getRandomInt(30, 100);
                const isCharging = Math.random() > 0.3; // 70% charging
                const status = isCharging ? 'CHARGING' : 'IDLE';

                if (soc > 90) partnerChargedBatteries++; // Consider >90% as fully charged for metrics

                // Battery
                batteryRows.push([
                    bId,
                    status,
                    soc,
                    pId, // current_station_id
                    null, // current_driver_id
                    false // is_misplaced
                ]);

                // Initial Log (Created)
                logRows.push([
                    bId,
                    pId, // occupant (station)
                    false,
                    new Date(Date.now() - 86400000), // 1 day ago
                    new Date(Date.now() - 86400000),
                    null
                ]);

                // Charging Event (Mock)
                if (isCharging) {
                    eventRows.push([
                        new Date(), // date
                        pId, // device_id (station)
                        new Date(), // ts
                        lat,
                        lon,
                        soc,
                        new Date(Date.now() - 3600000), // charge start
                        new Date() // created_at
                    ]);
                }
            }
            partnerTotalBatteries = inventoryCount;
            totalBatteries += inventoryCount;

            // Partner Record (Now includes calculated metrics)
            partnerRows.push([pId, lat, lon, isActive, partnerTotalBatteries, partnerChargedBatteries]);

            // Partner User
            userRows.push([pId, genericPasswordHash, 'PARTNER', pId]);


            // Nearby Driver (Chance 50%)
            if (Math.random() > 0.5) {
                const driverId = `D_${pId}`;
                // Random nearby location
                const dLat = lat + (Math.random() - 0.5) * 0.02;
                const dLon = lon + (Math.random() - 0.5) * 0.02;

                // Driver's Battery (Unique, NOT from station inventory to preserve count)
                const dBatteryId = `B_${driverId}`;
                const dSoc = getRandomInt(10, 80);

                // Driver Battery
                batteryRows.push([
                    dBatteryId,
                    'IN_USE',
                    dSoc,
                    null, // current_station_id
                    driverId, // current_driver_id
                    false
                ]);
                totalBatteries++;

                // Driver Log
                logRows.push([
                    dBatteryId,
                    driverId,
                    false,
                    new Date(),
                    new Date(),
                    null
                ]);

                // Driver Record
                driverRows.push([
                    driverId,
                    `Driver ${driverId}`,
                    '9999999999',
                    dLat,
                    dLon,
                    dBatteryId, // current_battery_id
                    'ACTIVE'
                ]);

                // Driver User
                userRows.push([driverId, genericPasswordHash, 'DRIVER', driverId]);
                totalDrivers++;
            }
        }
    }

    // Insert Partners (Updated columns)
    await bulkInsert('partners', ['id', 'latitude', 'longitude', 'is_active_dsk', 'total_batteries', 'fully_charged_batteries'], partnerRows, 'ON CONFLICT (id) DO NOTHING');

    // Insert Users (Partners + Drivers)
    await bulkInsert('users', ['username', 'password_hash', 'role', 'entity_id'], userRows, 'ON CONFLICT (username) DO NOTHING');

    // Insert Drivers
    await bulkInsert('drivers',
        ['id', 'name', 'phone', 'current_latitude', 'current_longitude', 'current_battery_id', 'status'],
        driverRows,
        'ON CONFLICT (id) DO NOTHING'
    );

    // Insert Batteries
    console.log(`\n--- 4. Inserting ${batteryRows.length} Batteries ---`);
    await bulkInsert('batteries',
        ['id', 'status', 'soc', 'current_station_id', 'current_driver_id', 'is_misplaced'],
        batteryRows,
        'ON CONFLICT (id) DO NOTHING'
    );

    // Insert Logs
    console.log(`\n--- 5. Inserting Logs ---`);
    await bulkInsert('battery_logs',
        ['battery_id', 'occupant', 'is_misplaced', 'created_at', 'updated_at', 'deleted_at'],
        logRows
    );

    // Insert Charging Events
    console.log(`\n--- 6. Inserting Charging Events ---`);
    await bulkInsert('charging_events',
        ['date', 'device_id', 'ts', 'lat', 'lon', 'soc', 'charge_start_time', 'created_at'],
        eventRows
    );


    // 7. Populate Warehouses (Synthetic)
    console.log('\n--- 7. Populating Warehouses ---');
    const numWarehouses = 10;
    const WAREHOUSES_NEAR_PARTNERS = 8; // Most near partners, few random for coverage
    const CENTER_LAT = 26.85;
    const CENTER_LON = 80.90;
    const whRows = [];
    const whUserRows = [];

    // Reset warehouse ID sequence to start from 1
    await pool.query('ALTER SEQUENCE warehouses_id_seq RESTART WITH 1');

    // Get active partner locations for strategic placement
    const activePartnerLocations = partners
        .filter(p => parseBoolean(p.isActiveDsk) && parseNumber(p.latitude) && parseNumber(p.longitude))
        .map(p => ({
            lat: parseNumber(p.latitude),
            lon: parseNumber(p.longitude)
        }));

    for (let i = 0; i < numWarehouses; i++) {
        let lat, lon;

        if (i < WAREHOUSES_NEAR_PARTNERS && activePartnerLocations.length > 0) {
            // Place near a random partner (within 2-8km for tighter coverage)
            const randomPartner = activePartnerLocations[Math.floor(Math.random() * activePartnerLocations.length)];
            const offsetKm = getRandomFloat(2, 8); // 2-8km away for better coverage
            const offsetDegrees = offsetKm / 111; // ~111km per degree
            lat = randomPartner.lat + (Math.random() - 0.5) * offsetDegrees;
            lon = randomPartner.lon + (Math.random() - 0.5) * offsetDegrees;
        } else {
            // Random placement around center
            lat = getRandomFloat(CENTER_LAT - 0.08, CENTER_LAT + 0.08);
            lon = getRandomFloat(CENTER_LON - 0.08, CENTER_LON + 0.08);
        }

        const total = getRandomInt(10, 30);
        const charged = Math.floor(total * 0.8);

        whRows.push([
            `Warehouse ${i + 1}`,
            lat,
            lon,
            charged,
            total - charged,
            Math.floor(total * 0.5),
            total - Math.floor(total * 0.5),
            getRandomInt(2, 5)
        ]);

        whUserRows.push([
            `WAREHOUSE_${i + 1}`,
            genericPasswordHash,
            'WAREHOUSE',
            null
        ]);
    }

    await bulkInsert('warehouses',
        ['name', 'latitude', 'longitude', 'charged_batteries', 'uncharged_batteries', 'batteries_45w', 'batteries_110w', 'toolkits'],
        whRows
    );
    await bulkInsert('users', ['username', 'password_hash', 'role', 'entity_id'], whUserRows, 'ON CONFLICT (username) DO NOTHING');


    console.log('\n✅ Data Generation Complete!');
    console.log(`   Partners: ${partners.length}`);
    console.log(`   Drivers: ${totalDrivers}`);
    console.log(`   Batteries: ${totalBatteries}`);
    process.exit(0);
}

main().catch(err => {
    console.error('Fatal Error:', err);
    process.exit(1);
});
