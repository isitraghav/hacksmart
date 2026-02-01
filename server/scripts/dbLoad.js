/**
 * Database Load Script
 * Restores database from a SQL file
 * Usage: node scripts/dbLoad.js <filename>
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const DUMP_DIR = path.join(__dirname, '..', 'backups');

const dumpFile = process.argv[2];
if (!dumpFile) {
    console.error('Usage: node scripts/dbLoad.js <filename>');
    console.log('Available backups:');
    if (fs.existsSync(DUMP_DIR)) {
        fs.readdirSync(DUMP_DIR).forEach(f => console.log(` - ${f}`));
    }
    process.exit(1);
}

const filepath = path.join(DUMP_DIR, dumpFile);
if (!fs.existsSync(filepath)) {
    console.error(`File not found: ${filepath}`);
    process.exit(1);
}

console.log(`Restoring database from: ${dumpFile}`);
console.log('Use with caution! This adds data to existing DB.');

// pg_restore or psql depending on format. pg_dump default is plain text so psql is used.
// If we wanted custom format (-Fc), we'd use pg_restore.
// Standard pg_dump > file output is SQL script, so use psql.

const cmd = `psql -U ${process.env.DB_USER} -h ${process.env.DB_HOST} -p ${process.env.DB_PORT} -d ${process.env.DB_NAME} -f "${filepath}"`;

const env = { ...process.env, PGPASSWORD: process.env.DB_PASSWORD };

exec(cmd, { env }, (error, stdout, stderr) => {
    if (error) {
        console.error(`Restore failed: ${error.message}`);
        return;
    }
    console.log(stdout);
    if (stderr) console.error(stderr);
    console.log(`\n✓ Database restored from: ${dumpFile}`);
});
