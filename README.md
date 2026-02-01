# HackSmart - Battery Swapping Network Management System

A comprehensive battery swapping network management platform with AI-powered inventory rebalancing, real-time tracking, and logistics optimization.

## 🚀 Features

### Core Functionality
- **Real-time Battery Tracking**: Monitor battery SOC, location, and status across the network
- **AI-Powered Rebalancing**: Automatic inventory optimization using time series forecasting
- **Partner & Driver Management**: Complete lifecycle management for network participants
- **Warehouse Operations**: Multi-warehouse inventory and dispatch management
- **Transfer Task Automation**: AI-approved battery transfers with minimal manual intervention
- **Smart Notifications**: Context-aware notifications for all stakeholders

### Technical Highlights
- **Predictive Analytics**: ARIMA-based demand forecasting for proactive rebalancing
- **Multi-source Routing**: Partner-to-partner and warehouse-to-partner transfers
- **Real-time Updates**: Event-driven architecture with instant status propagation
- **Mobile-first Design**: Flutter app for drivers, partners, and warehouse operators
- **RESTful API**: Clean, documented API for all operations

## 📁 Project Structure

```
hacksmart/
├── server/                 # Express.js backend
│   ├── config/            # Database and logistics configuration
│   ├── models/            # Data models
│   ├── routes/            # API endpoints
│   ├── services/          # Business logic (AI, forecasting, rebalancing)
│   ├── subscribers/       # Event handlers
│   ├── scripts/           # Database utilities and migrations
│   ├── tests/             # API and integration tests
│   └── utils/             # Helper utilities
│
└── app/                   # Flutter mobile application
    ├── lib/
    │   ├── services/      # API integration
    │   ├── tabs/          # Main app screens
    │   ├── widgets/       # Reusable UI components
    │   └── utils/         # App utilities
    └── android/ios/web/   # Platform-specific builds
```

## 🛠️ Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Flutter 3.0+ (for mobile app)

### Backend Setup

1. **Install dependencies**
```bash
cd server
npm install
```

2. **Configure environment**
```bash
cp .env.example .env
# Edit .env with your database credentials
```

3. **Initialize database**
```bash
npm run db:init
```

4. **Start server**
```bash
npm start              # Production
npm run dev           # Development with hot reload
```

### Mobile App Setup

1. **Install dependencies**
```bash
cd app
flutter pub get
```

2. **Run app**
```bash
flutter run           # Debug mode
flutter run --release # Release mode
```

## 📊 API Endpoints

### Core Resources
- `GET /partners` - List all partner stations
- `GET /drivers` - List all drivers
- `GET /warehouses` - List all warehouses
- `GET /batteries` - List battery inventory
- `GET /transfer-tasks` - List transfer tasks

### Transfer Operations
- `POST /logistics/transfer-task` - Create transfer task
- `POST /logistics/approve/:id` - Approve transfer
- `POST /logistics/reject/:id` - Reject transfer
- `POST /logistics/complete/:id` - Complete transfer

### Authentication
- `POST /auth/login` - User login
- `POST /auth/verify` - Verify token

## 🤖 AI Rebalancing System

The system uses predictive analytics to automatically rebalance inventory:

1. **Forecasting**: ARIMA models predict demand for each station
2. **Analysis**: Compare forecasted demand vs available inventory
3. **Triggering**: Automatically create transfer tasks when shortage detected
4. **Routing**: Smart source selection (partners or warehouses)
5. **Execution**: AI-approved tasks bypass manual approval

### Rebalancing Modes
- **CRITICAL**: Immediate shortage (< 2 batteries or shortage in 2 hours)
- **URGENT**: Shortage within 8 hours
- **PLANNED**: Forecasted spike in 1-2 days

## 📱 Mobile App Features

### Driver App
- Current battery status and SOC
- Nearest swap stations
- Navigation to partners
- Swap history

### Partner App
- Station inventory overview
- Incoming transfers
- Battery swap logs
- Shortage alerts

### Warehouse App
- Multi-warehouse inventory
- Dispatch requests
- Transfer task management
- Delivery tracking

## 🧪 Testing

```bash
# Run all tests
npm run test:all

# Individual test suites
npm run test                # API tests
npm run test:rebalancing    # Rebalancing logic
npm run test:notifications  # Notification system
npm run test:logistics      # Transfer tasks
npm run test:agent          # AI agent
```

## 🔧 Database Management

```bash
npm run migrate           # Run migrations
npm run db:reset         # Reset with demo data
npm run db:dump          # Backup database
npm run db:load          # Restore backup
```

## 📈 Production Deployment

### Environment Variables
```env
NODE_ENV=production
PORT=3000
DB_HOST=your-db-host
DB_PORT=5432
DB_NAME=hacksmart
DB_USER=your-user
DB_PASSWORD=your-password
JWT_SECRET=your-secret-key
```

### Performance Tips
- Enable PostgreSQL connection pooling
- Use Redis for caching (optional)
- Configure proper CORS origins
- Enable compression middleware
- Set up monitoring (PM2, New Relic, etc.)

## 📄 License

MIT

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📞 Support

For issues and questions, please open a GitHub issue.
