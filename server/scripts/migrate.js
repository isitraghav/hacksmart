/**
 * Database Migration Script
 * Creates all required tables for the HackSmart application
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('../config/database');

const migrations = [
  {
    name: 'create_charging_events_table',
    sql: `
      CREATE TABLE IF NOT EXISTS charging_events (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        device_id VARCHAR(50) NOT NULL,
        ts TIMESTAMP NOT NULL,
        lat DECIMAL(10, 8),
        lon DECIMAL(11, 8),
        soc INTEGER,
        discharging_time TIMESTAMP,
        charge_start_time TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_charging_events_device_id ON charging_events(device_id);
      CREATE INDEX IF NOT EXISTS idx_charging_events_date ON charging_events(date);
      CREATE INDEX IF NOT EXISTS idx_charging_events_ts ON charging_events(ts);
    `,
  },
  {
    name: 'create_partners_table',
    sql: `
      CREATE TABLE IF NOT EXISTS partners (
        id VARCHAR(20) PRIMARY KEY,
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        is_active_dsk BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_partners_active ON partners(is_active_dsk);
      CREATE INDEX IF NOT EXISTS idx_partners_location ON partners(latitude, longitude);
    `,
  },
  {
    name: 'create_battery_logs_table',
    sql: `
      CREATE TABLE IF NOT EXISTS battery_logs (
        id SERIAL PRIMARY KEY,
        battery_id VARCHAR(50) NOT NULL,
        occupant VARCHAR(50),
        is_misplaced BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        deleted_at TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_battery_logs_battery_id ON battery_logs(battery_id);
      CREATE INDEX IF NOT EXISTS idx_battery_logs_occupant ON battery_logs(occupant);
      CREATE INDEX IF NOT EXISTS idx_battery_logs_misplaced ON battery_logs(is_misplaced);
    `,
  },
  {
    name: 'create_drivers_table',
    sql: `
        CREATE TABLE IF NOT EXISTS drivers (
            id VARCHAR(50) PRIMARY KEY,
            name VARCHAR(100),
            phone VARCHAR(20),
            current_latitude DECIMAL(10, 8),
            current_longitude DECIMAL(11, 8),
            current_battery_id VARCHAR(50),
            status VARCHAR(20) DEFAULT 'OFFLINE',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status);
        `,
  },
  {
    name: 'create_batteries_table',
    sql: `
        CREATE TABLE IF NOT EXISTS batteries (
            id VARCHAR(50) PRIMARY KEY,
            status VARCHAR(20) DEFAULT 'IDLE',
            current_station_id VARCHAR(20),
            current_driver_id VARCHAR(50),
            soc INTEGER DEFAULT 100,
            temp_anomaly BOOLEAN DEFAULT FALSE,
            voltage_anomaly BOOLEAN DEFAULT FALSE,
            soc_derived_feature JSONB,
            last_lat DECIMAL(10, 8),
            last_lon DECIMAL(11, 8),
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_misplaced BOOLEAN DEFAULT FALSE
        );
        CREATE INDEX IF NOT EXISTS idx_batteries_status ON batteries(status);
        CREATE INDEX IF NOT EXISTS idx_batteries_station ON batteries(current_station_id);
        CREATE INDEX IF NOT EXISTS idx_batteries_driver ON batteries(current_driver_id);
        `,
  },
  {
    name: 'update_batteries_schema',
    sql: `ALTER TABLE batteries ADD COLUMN IF NOT EXISTS is_misplaced BOOLEAN DEFAULT FALSE;`
  },
  {
    name: 'create_warehouses_table',
    sql: `
          CREATE TABLE IF NOT EXISTS warehouses (
              id SERIAL PRIMARY KEY,
              name VARCHAR(255) NOT NULL,
              latitude DECIMAL(10, 8) NOT NULL,
              longitude DECIMAL(11, 8) NOT NULL,
              charged_batteries INTEGER DEFAULT 0,
              uncharged_batteries INTEGER DEFAULT 0,
              batteries_45w INTEGER DEFAULT 0,
              batteries_110w INTEGER DEFAULT 0,
              toolkits INTEGER DEFAULT 0,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
      `
  },
  {
    name: 'create_transfer_tasks_table',
    sql: `
          CREATE TABLE IF NOT EXISTS transfer_tasks (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              type VARCHAR(20) NOT NULL CHECK (type IN ('P2P_TRANSFER', 'WAREHOUSE_DISPATCH')),
              status VARCHAR(20) NOT NULL DEFAULT 'ASSIGNED' CHECK (status IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED')),
              source_id VARCHAR(50) NOT NULL,
              source_type VARCHAR(20) NOT NULL,
              target_id VARCHAR(50) NOT NULL,
              target_type VARCHAR(20) NOT NULL,
              amount INTEGER NOT NULL CHECK (amount > 0),
              distance_km DECIMAL(10, 2),
              financials JSONB,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              completed_at TIMESTAMP
          );
      `
  },
  {
    name: 'create_users_table',
    sql: `
          CREATE TABLE IF NOT EXISTS users (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              username VARCHAR(100) UNIQUE NOT NULL,
              password_hash VARCHAR(255) NOT NULL,
              role VARCHAR(20) NOT NULL CHECK (role IN ('DRIVER', 'PARTNER', 'WAREHOUSE')),
              entity_id VARCHAR(50), 
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
          CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
          CREATE INDEX IF NOT EXISTS idx_users_entity_id ON users(entity_id);
      `
  },
  {
    name: 'add_partner_metrics',
    sql: `
        ALTER TABLE partners 
        ADD COLUMN IF NOT EXISTS total_batteries INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS fully_charged_batteries INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS avg_daily_swaps INTEGER DEFAULT 0;
    `
  },
  {
    name: 'create_tickets_table',
    sql: `
        CREATE TABLE IF NOT EXISTS tickets (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            station_id VARCHAR(50) NOT NULL,
            priority VARCHAR(20) NOT NULL CHECK (priority IN ('CRITICAL', 'HIGH', 'MEDIUM')),
            status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVING', 'RESOLVED')),
            required_amount INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            resolved_at TIMESTAMP
        );
    `
  },
  {
    name: 'add_swap_frequency_column',
    sql: `ALTER TABLE partners ADD COLUMN IF NOT EXISTS total_swaps INTEGER DEFAULT 0;`
  },
  {
    name: 'create_notifications_table',
    sql: `
        CREATE TABLE IF NOT EXISTS notifications (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            recipient_type VARCHAR(20) NOT NULL CHECK (recipient_type IN ('DRIVER', 'PARTNER', 'WAREHOUSE')),
            recipient_id VARCHAR(50) NOT NULL,
            type VARCHAR(50) NOT NULL,
            title VARCHAR(255) NOT NULL,
            message TEXT NOT NULL,
            data JSONB,
            is_read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_type, recipient_id);
        CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(recipient_id, is_read) WHERE is_read = FALSE;
        CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
    `
  },
  {
    name: 'add_busy_score_column',
    sql: `
        ALTER TABLE partners 
        ADD COLUMN IF NOT EXISTS busy_score DECIMAL(5,2) DEFAULT 0.0,
        ADD COLUMN IF NOT EXISTS last_swap_at TIMESTAMP;
        
        CREATE INDEX IF NOT EXISTS idx_partners_busy_score ON partners(busy_score DESC);
    `
  },
  {
    name: 'create_daily_swap_history_table',
    sql: `
        CREATE TABLE IF NOT EXISTS daily_swap_history (
            id SERIAL PRIMARY KEY,
            station_id VARCHAR(50) NOT NULL,
            swap_date DATE NOT NULL,
            swap_count INTEGER NOT NULL DEFAULT 0,
            hour_breakdown JSONB DEFAULT '{}',
            peak_hour INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(station_id, swap_date)
        );
        CREATE INDEX IF NOT EXISTS idx_daily_swap_station ON daily_swap_history(station_id);
        CREATE INDEX IF NOT EXISTS idx_daily_swap_date ON daily_swap_history(swap_date DESC);
        CREATE INDEX IF NOT EXISTS idx_daily_swap_station_date ON daily_swap_history(station_id, swap_date DESC);
    `
  },
  {
    name: 'update_transfer_tasks_status_constraint',
    sql: `
        DO $$ 
        BEGIN
            -- Drop the old constraint if it exists
            ALTER TABLE transfer_tasks DROP CONSTRAINT IF EXISTS transfer_tasks_status_check;
            
            -- Add the new constraint with IN_PROGRESS and PENDING_SENDER_APPROVAL status
            ALTER TABLE transfer_tasks 
            ADD CONSTRAINT transfer_tasks_status_check 
            CHECK (status IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED', 'PENDING_SENDER_APPROVAL'));
        END $$;
    `
  }
  ,
  {
    name: 'create_driver_accounts_table',
    sql: `
          CREATE TABLE IF NOT EXISTS driver_accounts(
      id SERIAL PRIMARY KEY,
      driver_id VARCHAR(50) UNIQUE NOT NULL,
      balance DECIMAL(10, 2) DEFAULT 10000,
      total_swaps INTEGER DEFAULT 0,
      pending_leave_penalty DECIMAL(10, 2) DEFAULT 0,
      pending_service_charge DECIMAL(10, 2) DEFAULT 0,
      leave_days_used INTEGER DEFAULT 0,
      current_month DATE,
      last_swap_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
          CREATE INDEX IF NOT EXISTS idx_driver_accounts_driver ON driver_accounts(driver_id);
`
  },
  {
    name: 'create_swap_transactions_table',
    sql: `
          CREATE TABLE IF NOT EXISTS swap_transactions(
  id SERIAL PRIMARY KEY,
  driver_id VARCHAR(50) NOT NULL,
  station_id VARCHAR(50),
  swap_price DECIMAL(10, 2) NOT NULL,
  zone VARCHAR(20) DEFAULT 'URBAN',
  penalty_deduction DECIMAL(10, 2) DEFAULT 0,
  service_deduction DECIMAL(10, 2) DEFAULT 0,
  total_amount DECIMAL(10, 2) NOT NULL,
  battery_received_id VARCHAR(50),
  battery_returned_id VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
          CREATE INDEX IF NOT EXISTS idx_swap_transactions_driver ON swap_transactions(driver_id, created_at DESC);
`
  },
  {
    name: 'add_partner_pricing_columns',
    sql: `
          ALTER TABLE partners 
          ADD COLUMN IF NOT EXISTS zone VARCHAR(20) DEFAULT 'URBAN',
  ADD COLUMN IF NOT EXISTS low_inventory_threshold INTEGER DEFAULT 3,
    ADD COLUMN IF NOT EXISTS auto_rebalance_enabled BOOLEAN DEFAULT true;
`
  },
  {
    name: 'add_battery_health_columns',
    sql: `
          ALTER TABLE batteries 
          ADD COLUMN IF NOT EXISTS health_status VARCHAR(20) DEFAULT 'GOOD',
  ADD COLUMN IF NOT EXISTS soh DECIMAL(5, 2) DEFAULT 100.00,
    ADD COLUMN IF NOT EXISTS internal_resistance DECIMAL(8, 4) DEFAULT 0.0,
      ADD COLUMN IF NOT EXISTS cycles INTEGER DEFAULT 0;
          
          CREATE INDEX IF NOT EXISTS idx_batteries_health ON batteries(health_status);
`
  },
  {
    name: 'update_tickets_status_partial',
    sql: `
          ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
          ALTER TABLE tickets ADD CONSTRAINT tickets_status_check CHECK(status IN('OPEN', 'RESOLVING', 'RESOLVED', 'PARTIAL'));
`
  },
  {
    name: 'add_driver_accounts_balance_column',
    sql: `
          ALTER TABLE driver_accounts 
          ADD COLUMN IF NOT EXISTS balance DECIMAL(10, 2) DEFAULT 10000;
          
          UPDATE driver_accounts SET balance = 10000 WHERE balance IS NULL;
`
  },
  {
    name: 'update_transfer_status_length_and_constraint',
    sql: `
        ALTER TABLE transfer_tasks ALTER COLUMN status TYPE VARCHAR(50);
        ALTER TABLE transfer_tasks DROP CONSTRAINT IF EXISTS transfer_tasks_status_check;
        ALTER TABLE transfer_tasks ADD CONSTRAINT transfer_tasks_status_check 
        CHECK (status IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED', 'PENDING_SENDER_APPROVAL'));
    `
  }
];

async function runMigrations(closePool = true) {
  console.log('Starting database migrations...\n');

  const client = await pool.connect();

  try {
    for (const migration of migrations) {
      console.log(`Running migration: ${migration.name} `);
      await client.query(migration.sql);
      console.log(`✓ ${migration.name} completed\n`);
    }

    console.log('All migrations completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    if (closePool) {
      await pool.end();
    }
  }
}

// Run migrations if this is the main module
if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations, migrations };
