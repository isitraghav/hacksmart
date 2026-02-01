/**
 * Database Dump Script
 * Dumps the PostgreSQL database to a SQL file
 * Usage: node scripts/dbDump.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const DUMP_DIR = path.join(__dirname, '..', 'backups');
if (!fs.existsSync(DUMP_DIR)) fs.mkdirSync(DUMP_DIR);

const filename = `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.sql`;
const filepath = path.join(DUMP_DIR, filename);

// Assuming 'pg_dump' is in PATH. If not, user needs to ensure it is.
// Using connection details from env
const cmd = `pg_dump -U ${process.env.DB_USER} -h ${process.env.DB_HOST} -p ${process.env.DB_PORT} ${process.env.DB_NAME} > "${filepath}"`;

console.log(`Creating database dump: ${filename}`);
console.log(`Running: ${cmd}`);
console.log('(Password might be requested if not in .pgpass)');

// Note: On Windows, setting PGPASSWORD env var works for avoiding prompt
const env = { ...process.env, PGPASSWORD: process.env.DB_PASSWORD };

exec(cmd, { env }, (error, stdout, stderr) => {
    if (error) {
        console.error(`Dump failed: ${error.message}`);
        return;
    }
    if (stderr) {
        // pg_dump often prints verbose info to stderr even on success
        console.log(`pg_dump info: ${stderr}`);
    }
    console.log(`\n✓ Database dumped to: ${filepath}`);
});
