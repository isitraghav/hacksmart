# Production Deployment Checklist

## Pre-Deployment

### Environment Configuration
- [ ] Set `NODE_ENV=production` in .env
- [ ] Generate secure JWT_SECRET (use: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`)
- [ ] Configure production database credentials
- [ ] Set proper CORS origins (remove localhost)
- [ ] Configure AI service API keys (Groq, AWS Bedrock)

### Security
- [ ] Review and update all environment variables
- [ ] Ensure `.env` is in `.gitignore`
- [ ] Remove all test/debug API endpoints
- [ ] Enable rate limiting (add express-rate-limit)
- [ ] Add helmet.js for security headers
- [ ] Configure HTTPS/SSL certificates
- [ ] Set up database connection SSL

### Database
- [ ] Run all migrations: `npm run migrate`
- [ ] Create database backups before deployment
- [ ] Set up automated backup schedule
- [ ] Configure connection pooling (max 20-50 connections)
- [ ] Create database indexes for performance
- [ ] Set up monitoring for slow queries

### Performance
- [ ] Enable gzip compression
- [ ] Configure CDN for static assets
- [ ] Set up Redis for caching (optional)
- [ ] Optimize database queries with EXPLAIN ANALYZE
- [ ] Configure proper logging levels
- [ ] Set up PM2 for process management

### Monitoring
- [ ] Set up error tracking (Sentry, LogRocket)
- [ ] Configure APM (New Relic, Datadog)
- [ ] Set up uptime monitoring
- [ ] Configure log aggregation
- [ ] Set up alerts for critical errors

## Deployment Steps

### 1. Server Deployment

```bash
# Clone repository
git clone <your-repo-url>
cd hacksmart/server

# Install production dependencies
npm ci --production

# Set up environment
cp .env.example .env
nano .env  # Configure production settings

# Run migrations
npm run migrate

# Start with PM2
npm install -g pm2
pm2 start index.js --name hacksmart-api -i max
pm2 save
pm2 startup
```

### 2. Database Setup

```sql
-- Create production database
CREATE DATABASE hacksmart;

-- Create dedicated user
CREATE USER hacksmart_app WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE hacksmart TO hacksmart_app;

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### 3. Nginx Configuration (Optional)

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## Post-Deployment

### Verification
- [ ] Test all API endpoints
- [ ] Verify database connectivity
- [ ] Check AI agent functionality
- [ ] Test mobile app connectivity
- [ ] Monitor error logs for 24 hours
- [ ] Run load tests

### Monitoring Setup
```bash
# View logs
pm2 logs hacksmart-api

# Monitor resources
pm2 monit

# Check status
pm2 status
```

## Rollback Plan

```bash
# Stop current version
pm2 stop hacksmart-api

# Restore database backup
psql hacksmart < backup_YYYY-MM-DD.sql

# Start previous version
git checkout <previous-commit>
npm ci --production
pm2 restart hacksmart-api
```

## Performance Optimization

### Database Indexes
```sql
-- Add these indexes for better query performance
CREATE INDEX CONCURRENTLY idx_batteries_station_status 
  ON batteries(current_station_id, status) WHERE status IN ('IDLE', 'CHARGING');

CREATE INDEX CONCURRENTLY idx_transfer_tasks_status 
  ON transfer_tasks(status, created_at) WHERE status != 'COMPLETED';

CREATE INDEX CONCURRENTLY idx_charging_events_device_ts 
  ON charging_events(device_id, ts DESC);
```

### PM2 Configuration
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'hacksmart-api',
    script: './index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_memory_restart: '1G'
  }]
};
```

## Mobile App Deployment

### Android
```bash
cd app
flutter build apk --release
flutter build appbundle --release
# Upload to Google Play Console
```

### iOS
```bash
cd app
flutter build ios --release
# Open Xcode and archive for App Store
```

## Maintenance

### Weekly Tasks
- [ ] Review error logs
- [ ] Check database performance
- [ ] Verify backup integrity
- [ ] Monitor disk space usage

### Monthly Tasks
- [ ] Update dependencies (security patches)
- [ ] Review and optimize slow queries
- [ ] Clean up old logs
- [ ] Database maintenance (VACUUM, ANALYZE)

### Quarterly Tasks
- [ ] Security audit
- [ ] Performance testing
- [ ] Capacity planning review
- [ ] Dependencies major version updates
