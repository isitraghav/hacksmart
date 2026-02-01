# Repository Structure

## Overview
HackSmart is organized into backend (server) and frontend (app) components with clear separation of concerns.

## Directory Structure

```
hacksmart/
│
├── README.md                    # Main project documentation
├── DEPLOYMENT.md               # Production deployment guide
├── CONTRIBUTING.md             # Contribution guidelines
├── .gitignore                  # Git ignore rules
│
├── server/                     # Backend API (Node.js/Express)
│   ├── .env.example           # Environment template
│   ├── package.json           # Dependencies and scripts
│   ├── index.js               # Application entry point
│   │
│   ├── config/                # Configuration files
│   │   ├── database.js        # PostgreSQL connection
│   │   └── logistics.js       # Logistics constants
│   │
│   ├── models/                # Data models
│   │   ├── batteries.js       # Battery operations
│   │   ├── partners.js        # Partner/station operations
│   │   ├── drivers.js         # Driver operations
│   │   ├── warehouses.js      # Warehouse operations
│   │   ├── transferTasks.js   # Transfer task operations
│   │   ├── notifications.js   # Notification operations
│   │   └── ...               # Other models
│   │
│   ├── routes/                # API endpoints
│   │   ├── index.js          # Main router
│   │   ├── auth.js           # Authentication
│   │   ├── partners.js       # Partner endpoints
│   │   ├── driver.js         # Driver endpoints
│   │   ├── warehouses.js     # Warehouse endpoints
│   │   ├── logistics.js      # Transfer task endpoints
│   │   └── ...              # Other routes
│   │
│   ├── services/             # Business logic
│   │   ├── inventoryRebalancer.js  # Auto-rebalancing system
│   │   ├── forecastingService.js   # Demand forecasting
│   │   ├── ai/               # AI agent services
│   │   └── ...              # Other services
│   │
│   ├── subscribers/          # Event handlers
│   │   ├── agentSubscriber.js     # AI agent events
│   │   └── driverSubscriber.js    # Driver events
│   │
│   ├── utils/                # Utilities
│   │   └── eventBus.js       # Event system
│   │
│   ├── scripts/              # Database & utilities
│   │   ├── migrate.js        # Database migrations
│   │   ├── generateDemoData.js    # Demo data generator
│   │   ├── dbDump.js         # Database backup
│   │   ├── dbLoad.js         # Database restore
│   │   ├── checkDistances.js # Warehouse coverage check
│   │   ├── checkTasks.js     # Task verification
│   │   └── importAll.js      # CSV import utility
│   │
│   ├── tests/                # Test suites
│   │   ├── api.test.js       # API endpoint tests
│   │   ├── rebalancing.test.js    # Rebalancing logic tests
│   │   ├── logistics.test.js      # Transfer task tests
│   │   ├── agent.test.js     # AI agent tests
│   │   └── ...              # Other tests
│   │
│   ├── docs/                 # API documentation
│   │   ├── API_DOCS.md
│   │   └── API_INTEGRATION_AUDIT.md
│   │
│   ├── data/                 # CSV data files
│   │   ├── Partners.xlsx - result.csv
│   │   ├── BatteryLogs.xlsx - result.csv
│   │   └── ChargingEvents.xlsx - result.csv
│   │
│   └── public/               # Static files
│       └── index.html        # API landing page
│
└── app/                      # Flutter mobile application
    ├── pubspec.yaml          # Flutter dependencies
    ├── analysis_options.yaml # Dart analysis config
    ├── README.md            # App-specific documentation
    │
    ├── lib/                 # Application code
    │   ├── main.dart        # App entry point
    │   ├── home_screen.dart # Main navigation
    │   │
    │   ├── services/        # API integration
    │   │   └── api_service.dart
    │   │
    │   ├── tabs/            # Main app screens
    │   │   ├── driver_tab.dart      # Driver interface
    │   │   ├── partner_tab.dart     # Partner interface
    │   │   └── warehouse_tab.dart   # Warehouse interface
    │   │
    │   ├── widgets/         # Reusable components
    │   │   ├── notifications_widget.dart
    │   │   └── rebalancing_widget.dart
    │   │
    │   └── utils/           # App utilities
    │       └── app_colors.dart
    │
    ├── android/             # Android build files
    ├── ios/                 # iOS build files
    ├── web/                 # Web build files
    ├── linux/               # Linux build files
    ├── macos/               # macOS build files
    └── windows/             # Windows build files
```

## Key Files

### Backend
- **index.js**: Server initialization, middleware setup, route registration
- **config/database.js**: PostgreSQL connection pool and query wrapper
- **services/inventoryRebalancer.js**: Core rebalancing logic with AI
- **services/forecastingService.js**: ARIMA-based demand prediction
- **models/*.js**: Database operations for each entity
- **routes/*.js**: API endpoint definitions

### Frontend  
- **lib/main.dart**: App initialization and theme
- **lib/home_screen.dart**: Tab navigation controller
- **lib/services/api_service.dart**: HTTP client for backend API
- **lib/tabs/*.dart**: Main feature screens
- **lib/widgets/*.dart**: Shared UI components

## Important Scripts

```bash
# Server
npm start              # Start production server
npm run dev           # Development with hot reload
npm run migrate       # Run database migrations
npm run db:reset      # Reset database with demo data
npm run test:all      # Run all tests

# App
flutter run           # Run app in debug mode
flutter build apk     # Build Android APK
flutter build ios     # Build iOS app
```

## Environment Setup

1. Copy `.env.example` to `.env` in server directory
2. Configure database credentials
3. Set JWT secret
4. Configure AI service keys (optional)

## Data Flow

1. **Mobile App** → HTTP Request → **Express Routes**
2. **Routes** → Call → **Models** (Database operations)
3. **Models** ← Query → **PostgreSQL Database**
4. **Services** → Background processing (rebalancing, forecasting)
5. **Event Bus** → **Subscribers** (AI agent, notifications)
6. **Response** ← Return ← **Mobile App**

## Production Considerations

- All debug files removed
- Build artifacts excluded
- Environment variables templated
- Comprehensive .gitignore configured
- Documentation complete
- Test suites organized
- Scripts optimized for production

## Next Steps

1. Review DEPLOYMENT.md for production setup
2. Configure environment variables
3. Run tests: `npm run test:all`
4. Deploy following DEPLOYMENT.md checklist
5. Monitor logs and performance
