# HackSmart API Documentation

## Overview
The HackSmart API provides endpoints for managing partners, charging events, battery logs, routing (OSRM), navigation, warehouses, logistics, and driver operations.

**Base URL**: `/api`

## Authentication
Authentication is handled via JSON Web Tokens (JWT).

**Header Requirement**:
For protected endpoints, provide the token in the `Authorization` header:
`Authorization: Bearer <your_token>`

## API Endpoints

### Auth
**Base Path**: `/auth`

| Method | Endpoint | Description | Query Parameters / Body |
| :--- | :--- | :--- | :--- |
| `POST` | `/login` | Authenticate user and get JWT | Body: `{ username, password }` |

### Partners
**Base Path**: `/partners`

| Method | Endpoint | Description | Query Parameters / Body |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Get all partners with optional filtering | `isActive` (boolean), `limit` (number), `offset` (number) |
| `GET` | `/stats` | Get partner statistics | - |
| `GET` | `/active` | Get only active partners | - |
| `GET` | `/inactive` | Get only inactive partners | - |
| `GET` | `/nearby` | Get partners near a location | `lat` (required), `lon` (required), `radius` (km, default 10) |
| `GET` | `/bounds` | Get partners within a bounding box | `minLat`, `maxLat`, `minLon`, `maxLon` (all required) |
| `GET` | `/:id` | Get a specific partner by ID | - |

### Charging Events
**Base Path**: `/charging-events`

| Method | Endpoint | Description | Query Parameters / Body |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Get all charging events | `deviceId`, `startDate`, `endDate`, `minSoc`, `limit`, `offset` |
| `GET` | `/stats` | Get aggregated statistics | `deviceId`, `startDate`, `endDate` |
| `GET` | `/daily` | Get daily summary | `days` (default 30) |
| `GET` | `/devices` | Get list of unique device IDs | - |
| `GET` | `/device/:deviceId` | Get events for a specific device | `limit` |
| `GET` | `/:id` | Get a specific charging event by ID | - |

### Battery Logs
**Base Path**: `/battery-logs`

| Method | Endpoint | Description | Query Parameters / Body |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Get all battery logs | `batteryId`, `occupant`, `isMisplaced` (boolean), `includeDeleted` (boolean), `limit`, `offset` |
| `GET` | `/stats` | Get battery log statistics | - |
| `GET` | `/misplaced` | Get all misplaced batteries | - |
| `GET` | `/occupant-summary` | Get summary of batteries per occupant | - |
| `GET` | `/occupants` | Get list of unique occupants | - |
| `GET` | `/occupant/:occupant` | Get logs for a specific occupant | - |
| `GET` | `/:batteryId` | Get logs for a specific battery | - |
| `GET` | `/:batteryId/history` | Get full history for a specific battery | - |

### OSRM (Routing)
**Base Path**: `/osrm`

| Method | Endpoint | Description | Query Parameters / Body |
| :--- | :--- | :--- | :--- |
| `GET` | `/route` | Get a route between two points | `startLat`, `startLon`, `endLat`, `endLon`, `profile` (default 'driving') |
| `POST` | `/route/multi` | Get a route through multiple waypoints | Body: `{ waypoints: [{lat, lon}, ...], profile }` |
| `GET` | `/nearest` | Find nearest road point | `lat`, `lon` |
| `POST` | `/distance-matrix` | Calculate distance matrix | Body: `{ sources: [{lat, lon}], destinations: [{lat, lon}] }` |

### Navigation
**Base Path**: `/navigation`

| Method | Endpoint | Description | Query Parameters / Body |
| :--- | :--- | :--- | :--- |
| `POST` | `/plan` | Plan a route with battery swap stops | Body: `{ startLat, startLon, endLat, endLon }` |

### Warehouses
**Base Path**: `/warehouses`

| Method | Endpoint | Description | Query Parameters / Body |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Get all warehouses | - |

### Logistics
**Base Path**: `/logistics`

| Method | Endpoint | Description | Query Parameters / Body |
| :--- | :--- | :--- | :--- |
| `GET` | `/agent/rebalance-plan` | Get autonomous rebalancing recommendations | - |
| `POST` | `/run` | Phase A + B: Detect and Resolve (Run Agent Protocol) | - |
| `POST` | `/tickets/scan` | Detect deficits and raise tickets | - |
| `GET` | `/tickets` | Get open tickets | - |
| `POST` | `/debug/spike` | Simulate a demand critical spike | - |
| `GET` | `/tasks` | Get list of transfer tasks | - |
| `POST` | `/tasks/:id/complete` | Mark task as completed | - |

### Driver
**Base Path**: `/driver`

| Method | Endpoint | Description | Query Parameters / Body |
| :--- | :--- | :--- | :--- |
| `POST` | `/find-best-station` | Find nearest/best station with stock | Body: `{ lat, lon, radius }` |
| `POST` | `/start-route` | Driver initiates route to station | Body: `{ driverId, stationId, lat, lon }` |
| `POST` | `/swap` | Execute battery swap | Body: `{ driverId, stationId }` |

### Health Check
**Base Path**: `/` (API Root)

| Method | Endpoint | Description | Response |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Server health check | `{ success: true, status: 'healthy', timestamp: ... }` |

## Features

- **Partner Management**: Track and manage charging station partners, including location-based searches and status filtering.
- **Charging Event Tracking**: Monitor charging events, retrieve statistics, and analyze daily summaries.
- **Battery Logistics**: Track battery location, history, and status (e.g., misplaced).
- **Intelligent Routing (OSRM)**: Integrated OSRM for calculating routes, distances, and matrices.
- **Navigation & Trip Planning**: Plan routes that include necessary battery swap stops.
- **Warehouse Management**: Basic warehouse inventory listing.
- **Autonomous Logistics Agent**:
  - **Deficit Detection**: Automatically scans for station deficits.
  - **Rebalancing**: Generates rebalancing plans to move batteries where needed.
  - **Ticket Management**: Raises tickets for issues.
  - **Simulation**: Includes debug tools to simulate demand spikes.
- **Driver Support**:
  - **Station Finder**: Helps drivers find the best nearby station with available batteries.
  - **Route Tracking**: Manages active routes to stations.
  - **Swap Execution**: Handles the logic for battery swapping and inventory updates.
