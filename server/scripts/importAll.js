/**
 * Import All CSV Data Script
 * Imports all CSV files from the data folder into the database
 * Usage: node scripts/importAll.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');
const { pool } = require('../config/database');

const DATA_DIR = path.join(__dirname, '..', 'data');

/**
 * Parse boolean values from CSV
 */
function parseBoolean(value) {
    if (value === null || value === undefined || value === '') return false;
    const lower = String(value).toLowerCase().trim();
    return lower === 'true' || lower === '1' || lower === 'yes';
}

/**
 * Parse timestamp or return null
 */
function parseTimestamp(value) {
    if (!value || value === 'null' || value === 'NULL' || value === '') return null;
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
}

/**
 * Parse number or return null
 */
function parseNumber(value) {
    if (value === null || value === undefined || value === '' || value === 'null') return null;
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
}

/**
 * Read and parse a CSV file
 */
async function readCsv(filePath) {
    return new Promise((resolve, reject) => {
        const records = [];
        fs.createReadStream(filePath)
            .pipe(parse({
                columns: true,
                skip_empty_lines: true,
                trim: true,
                delimiter: ',',
            }))
            .on('data', (row) => records.push(row))
            .on('end', () => resolve(records))
            .on('error', reject);
    });
}

/**
 * Import Charging Events
 */
async function importChargingEvents(filePath) {
    console.log('\n📊 Importing Charging Events...');
    const records = await readCsv(filePath);
    console.log(`   Parsed ${records.length} records`);

    let inserted = 0;
    const batchSize = 500;

    for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const values = [];
        const params = [];

        batch.forEach((r, idx) => {
            const base = idx * 8;
            values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`);
            params.push(
                r.date,
                r.deviceId,
                parseTimestamp(r.ts),
                parseNumber(r.lat),
                parseNumber(r.lon),
                parseNumber(r.soc),
                parseTimestamp(r.discharging_time),
                parseTimestamp(r.charge_start_time)
            );
        });

        try {
            await pool.query(`
        INSERT INTO charging_events (date, device_id, ts, lat, lon, soc, discharging_time, charge_start_time)
        VALUES ${values.join(', ')}
      `, params);
            inserted += batch.length;
            process.stdout.write(`\r   Inserted: ${inserted}/${records.length}`);
        } catch (error) {
            console.error(`\n   Error at batch ${Math.floor(i / batchSize)}:`, error.message);
        }
    }
    console.log(`\n   ✓ Completed: ${inserted} records`);
    return inserted;
}

/**
 * Import Partners
 */
async function importPartners(filePath) {
    console.log('\n🏢 Importing Partners...');
    const records = await readCsv(filePath);
    console.log(`   Parsed ${records.length} records`);

    let inserted = 0;
    const batchSize = 100;

    for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const values = [];
        const params = [];

        batch.forEach((r, idx) => {
            const base = idx * 4;
            values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
            params.push(
                r.id,
                parseNumber(r.latitude),
                parseNumber(r.longitude),
                parseBoolean(r.isActiveDsk)
            );
        });

        try {
            await pool.query(`
        INSERT INTO partners (id, latitude, longitude, is_active_dsk)
        VALUES ${values.join(', ')}
        ON CONFLICT (id) DO UPDATE SET
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          is_active_dsk = EXCLUDED.is_active_dsk
      `, params);
            inserted += batch.length;
            process.stdout.write(`\r   Inserted: ${inserted}/${records.length}`);
        } catch (error) {
            console.error(`\n   Error at batch ${Math.floor(i / batchSize)}:`, error.message);
        }
    }
    console.log(`\n   ✓ Completed: ${inserted} records`);
    return inserted;
}

/**
 * Import Battery Logs
 */
async function importBatteryLogs(filePath) {
    console.log('\n🔋 Importing Battery Logs...');
    const records = await readCsv(filePath);
    console.log(`   Parsed ${records.length} records`);

    let inserted = 0;
    const batchSize = 500;

    for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const values = [];
        const params = [];

        batch.forEach((r, idx) => {
            const base = idx * 6;
            values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`);
            params.push(
                r.batteryId,
                r.occupant,
                parseBoolean(r.isMisplaced),
                parseTimestamp(r.createdAt),
                parseTimestamp(r.updatedAt),
                parseTimestamp(r.deletedAt)
            );
        });

        try {
            await pool.query(`
        INSERT INTO battery_logs (battery_id, occupant, is_misplaced, created_at, updated_at, deleted_at)
        VALUES ${values.join(', ')}
      `, params);
            inserted += batch.length;
            process.stdout.write(`\r   Inserted: ${inserted}/${records.length}`);
        } catch (error) {
            console.error(`\n   Error at batch ${Math.floor(i / batchSize)}:`, error.message);
        }
    }
    console.log(`\n   ✓ Completed: ${inserted} records`);
    return inserted;
}

async function main() {
    console.log('===========================================');
    console.log('         CSV Data Import Script           ');
    console.log('===========================================');

    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.csv'));
    console.log(`\nFound ${files.length} CSV files in ${DATA_DIR}`);
    files.forEach(f => console.log(`  - ${f}`));

    const results = {};

    // Find and import charging events
    const chargingFile = files.find(f => f.toLowerCase().includes('charging'));
    if (chargingFile) {
        results.chargingEvents = await importChargingEvents(path.join(DATA_DIR, chargingFile));
    }

    // Find and import partners
    const partnersFile = files.find(f => f.toLowerCase().includes('partners'));
    if (partnersFile) {
        results.partners = await importPartners(path.join(DATA_DIR, partnersFile));
    }

    // Find and import battery logs
    const batteryFile = files.find(f => f.toLowerCase().includes('battery'));
    if (batteryFile) {
        results.batteryLogs = await importBatteryLogs(path.join(DATA_DIR, batteryFile));
    }

    console.log('\n===========================================');
    console.log('               Summary                     ');
    console.log('===========================================');
    console.log(`  Charging Events: ${results.chargingEvents || 0} records`);
    console.log(`  Partners:        ${results.partners || 0} records`);
    console.log(`  Battery Logs:    ${results.batteryLogs || 0} records`);
    console.log('===========================================\n');

    await pool.end();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
