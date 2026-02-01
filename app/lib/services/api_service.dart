import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

class ApiService {
  // Use 10.0.2.2 for Android Emulator, localhost for iOS/Web
  // For physical device, use your machine's IP address
  static const String baseUrl = 'https://segfault122.duckdns.org/api';
  // static const String baseUrl = 'http://10.220.179.171:1234/api';

  // Store auth token
  static String? _authToken;

  // --- Auth ---
  Future<Map<String, dynamic>?> login(String username, String password) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/auth/login'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'username': username, 'password': password}),
      );
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['token'] != null) {
          _authToken = data['token'];
        }
        return data;
      }
    } catch (e) {
      print('Error logging in: $e');
    }
    return null;
  }

  void logout() {
    _authToken = null;
  }

  bool get isLoggedIn => _authToken != null;

  Map<String, String> get _authHeaders => {
    'Content-Type': 'application/json',
    if (_authToken != null) 'Authorization': 'Bearer $_authToken',
  };

  // --- Partners ---
  Future<List<dynamic>> getPartners() async {
    try {
      final response = await http.get(Uri.parse('$baseUrl/partners'));
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['data'] ?? [];
      }
    } catch (e) {
      print('Error fetching partners: $e');
    }
    return [];
  }

  Future<List<dynamic>> getNearbyPartners(double lat, double lon) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/partners/nearby?lat=$lat&lon=$lon'),
      );
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['data'] ?? [];
      }
    } catch (e) {
      print('Error fetching nearby partners: $e');
    }
    return [];
  }

  Future<Map<String, dynamic>?> getPartnerStats() async {
    try {
      final response = await http.get(Uri.parse('$baseUrl/partners/stats'));
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['data'];
      }
    } catch (e) {
      print('Error fetching partner stats: $e');
    }
    return null;
  }

  Future<Map<String, dynamic>?> getPartnerById(String id) async {
    try {
      final response = await http.get(Uri.parse('$baseUrl/partners/$id'));
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['data'];
      }
    } catch (e) {
      print('Error fetching partner: $e');
    }
    return null;
  }

  Future<Map<String, dynamic>?> triggerLowInventory(String partnerId) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/partners/$partnerId/trigger-low-inventory'),
        headers: {'Content-Type': 'application/json'},
      );
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data;
      }
    } catch (e) {
      print('Error triggering low inventory: $e');
    }
    return null;
  }

  // --- Driver Info ---
  Future<Map<String, dynamic>?> getDriverInfo(String driverId) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/driver/$driverId/info'),
      );
      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
    } catch (e) {
      print('Error fetching driver info: $e');
    }
    return null;
  }

  Future<Map<String, dynamic>> getPartnerBatteries(String partnerId) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/partners/$partnerId/batteries'),
      );
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return {
          'batteries': data['data'] ?? [],
          'summary': data['summary'] ?? {},
        };
      }
    } catch (e) {
      print('Error fetching partner batteries: $e');
    }
    return {'batteries': [], 'summary': {}};
  }

  Future<Map<String, dynamic>> getPartnerSwapAnalytics(String partnerId, {int days = 7}) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/partners/$partnerId/analytics/swaps?days=$days'),
      );
      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
      return {'success': false, 'error': 'Failed to load analytics'};
    } catch (e) {
      print('Error fetching analytics: $e');
      return {'success': false, 'error': e.toString()};
    }
  }

  // --- Battery Logs ---
  Future<List<dynamic>> getBatteryLogs({
    String? batteryId,
    String? occupant,
    int? limit,
  }) async {
    try {
      final params = <String, String>{};
      if (batteryId != null) params['batteryId'] = batteryId;
      if (occupant != null) params['occupant'] = occupant;
      if (limit != null) params['limit'] = limit.toString();

      final uri = Uri.parse(
        '$baseUrl/battery-logs',
      ).replace(queryParameters: params.isNotEmpty ? params : null);
      final response = await http.get(uri);
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['data'] ?? [];
      }
    } catch (e) {
      print('Error fetching battery logs: $e');
    }
    return [];
  }

  Future<Map<String, dynamic>?> getBatteryStats() async {
    try {
      final response = await http.get(Uri.parse('$baseUrl/battery-logs/stats'));
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['data'];
      }
    } catch (e) {
      print('Error fetching battery stats: $e');
    }
    return null;
  }

  Future<List<dynamic>> getBatteryLogsByOccupant(String occupant) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/battery-logs/occupant/$occupant'),
      );
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['data'] ?? [];
      }
    } catch (e) {
      print('Error fetching battery logs by occupant: $e');
    }
    return [];
  }

  Future<List<dynamic>> getOccupantSummary() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/battery-logs/occupant-summary'),
      );
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['data'] ?? [];
      }
    } catch (e) {
      print('Error fetching occupant summary: $e');
    }
    return [];
  }

  Future<List<dynamic>> getBatteryHistory(String batteryId) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/battery-logs/$batteryId/history'),
      );
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['data'] ?? [];
      }
    } catch (e) {
      print('Error fetching battery history: $e');
    }
    return [];
  }

  Future<Map<String, dynamic>> triggerBatteryFault(String batteryId) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/logistics/battery/$batteryId/fault'),
        headers: {'Content-Type': 'application/json'},
      );
      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
    } catch (e) {
      print('Error triggering battery fault: $e');
    }
    return {'success': false, 'error': 'Failed to trigger fault'};
  }

  // --- Warehouses ---
  Future<List<dynamic>> getWarehouses() async {
    try {
      final response = await http.get(Uri.parse('$baseUrl/warehouses'));
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['data'] ?? [];
      }
    } catch (e) {
      print('Error fetching warehouses: $e');
    }
    return [];
  }

  Future<Map<String, dynamic>?> getWarehouseById(String id) async {
    try {
      final response = await http.get(Uri.parse('$baseUrl/warehouses/$id'));
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['data'];
      }
    } catch (e) {
      print('Error fetching warehouse: $e');
    }
    return null;
  }

  // --- Logistics ---
  Future<List<dynamic>> getTransferTasks() async {
    try {
      final response = await http.get(Uri.parse('$baseUrl/logistics/tasks'));
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['data'] ?? [];
      }
    } catch (e) {
      print('Error fetching tasks: $e');
    }
    return [];
  }

  // --- Driver ---
  Future<dynamic> findBestStation(double lat, double lon, double radius) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/driver/find-best-station'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'lat': lat, 'lon': lon, 'radius': radius}),
      );
      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = json.decode(response.body);
        return data['station'];
      }
    } catch (e) {
      print('Error finding best station: $e');
    }
    return null;
  }

  Future<Map<String, dynamic>?> swapBattery(
    String driverId,
    String stationId, {
    int? currentBatterySoc,
    String? currentBatteryId,
    String? paymentMode,
  }) async {
    try {
      final Map<String, dynamic> body = {
        'driverId': driverId,
        'stationId': stationId,
      };
      if (currentBatterySoc != null) {
        body['driverSoc'] = currentBatterySoc;
      }
      if (currentBatteryId != null) {
        body['currentBatteryId'] = currentBatteryId;
      }
      if (paymentMode != null) {
        body['paymentMode'] = paymentMode;
      }
      final response = await http.post(
        Uri.parse('$baseUrl/driver/swap'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode(body),
      );
      if (response.statusCode == 200 || response.statusCode == 201) {
        return json.decode(response.body);
      }
    } catch (e) {
      print('Error swapping battery: $e');
    }
    return null;
  }

  Future<Map<String, dynamic>> returnBattery(
    String driverId,
    String stationId, {
    String? batteryId,
  }) async {
    try {
      final Map<String, dynamic> body = {
        'driverId': driverId,
        'stationId': stationId,
      };
      if (batteryId != null) {
        body['batteryId'] = batteryId;
      }
      final response = await http.post(
        Uri.parse('$baseUrl/driver/return'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode(body),
      );
      if (response.statusCode == 200 || response.statusCode == 201) {
        return json.decode(response.body);
      } else {
        return {
          'success': false,
          'error': 'Failed to return battery: ${response.statusCode}'
        };
      }
    } catch (e) {
      print('Error returning battery: $e');
      return {'success': false, 'error': e.toString()};
    }
  }

  // --- Navigation with automatic swap stops ---
  Future<Map<String, dynamic>?> planNavigationRoute(
    double startLat,
    double startLon,
    double endLat,
    double endLon,
  ) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/navigation/plan'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'startLat': startLat,
          'startLon': startLon,
          'endLat': endLat,
          'endLon': endLon,
        }),
      );

      if (response.statusCode == 200) {
        final jsonResponse = json.decode(response.body);
        final data = jsonResponse['data'];

        if (data != null && data['route'] != null) {
          final route = data['route'];
          final stops = data['stops'] as List? ?? [];

          // Extract coordinates from route geometry
          List<LatLng> coordinates = [];
          if (route['geometry'] != null) {
            final geometry = route['geometry'];
            if (geometry is Map && geometry['coordinates'] != null) {
              final coords = geometry['coordinates'] as List;
              coordinates = coords
                  .map(
                    (p) => LatLng(
                      (p[1] as num).toDouble(),
                      (p[0] as num).toDouble(),
                    ),
                  )
                  .toList();
            }
          }

          // Extract turn-by-turn steps
          List<Map<String, dynamic>> steps = [];
          if (route['legs'] != null && (route['legs'] as List).isNotEmpty) {
            final legs = route['legs'] as List;
            for (var leg in legs) {
              if (leg['steps'] != null) {
                final legSteps = leg['steps'] as List;
                for (var step in legSteps) {
                  steps.add({
                    'distance': step['distance'],
                    'duration': step['duration'],
                    'instruction': step['name'] ?? 'Continue',
                    'maneuver': {
                      'type': step['maneuver']?['type'] ?? 'straight',
                      'instruction':
                          step['maneuver']?['instruction'] ??
                          'Continue on current road',
                    },
                  });
                }
              }
            }
          }

          // Extract waypoint locations from stops
          List<LatLng> waypoints = stops.map((stop) {
            final lat = stop['latitude'] is String
                ? double.parse(stop['latitude'])
                : (stop['latitude'] as num).toDouble();
            final lon = stop['longitude'] is String
                ? double.parse(stop['longitude'])
                : (stop['longitude'] as num).toDouble();
            return LatLng(lat, lon);
          }).toList();

          return {
            'type': data['type'],
            'coordinates': coordinates,
            'steps': steps,
            'waypoints': waypoints,
            'stops': stops, // Full stop data with station info
          };
        }
      }
    } catch (e) {
      print('Error planning navigation route: $e');
    }
    return null;
  }

  // --- Geocoding (Nominatim) ---
  Future<List<dynamic>> searchLocation(
    String query, {
    double? lat,
    double? lon,
  }) async {
    try {
      final uri = Uri.https('nominatim.openstreetmap.org', '/search', {
        'q': query,
        'format': 'json',
        'limit': '10',
        'addressdetails': '1',
      });

      final response = await http.get(
        uri,
        headers: {'User-Agent': 'com.hacksmart.app'},
      );
      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
    } catch (e) {
      print('Error searching location: $e');
    }
    return [];
  }

  // --- OSRM / Navigation ---
  Future<List<LatLng>> getRoute(LatLng start, LatLng end) async {
    try {
      final uri = Uri.parse('$baseUrl/osrm/route').replace(
        queryParameters: {
          'startLat': start.latitude.toString(),
          'startLon': start.longitude.toString(),
          'endLat': end.latitude.toString(),
          'endLon': end.longitude.toString(),
        },
      );

      final response = await http.get(uri);

      if (response.statusCode == 200) {
        final jsonResponse = json.decode(response.body);
        final data = jsonResponse['data'];

        if (data != null &&
            data['routes'] != null &&
            (data['routes'] as List).isNotEmpty) {
          final firstRoute = data['routes'][0];
          if (firstRoute['geometry'] != null) {
            final geometry = firstRoute['geometry'];
            if (geometry is Map && geometry['coordinates'] != null) {
              final coords = geometry['coordinates'] as List;
              return coords
                  .map(
                    (p) => LatLng(
                      (p[1] as num).toDouble(), // Lat
                      (p[0] as num).toDouble(), // Lon
                    ),
                  )
                  .toList();
            }
          }
        }
      }
    } catch (e) {
      print('Error getting route: $e');
    }
    return [];
  }

  Future<Map<String, dynamic>> getRouteWithSteps(
    LatLng start,
    LatLng end,
  ) async {
    try {
      final uri = Uri.parse('$baseUrl/osrm/route').replace(
        queryParameters: {
          'startLat': start.latitude.toString(),
          'startLon': start.longitude.toString(),
          'endLat': end.latitude.toString(),
          'endLon': end.longitude.toString(),
        },
      );

      final response = await http.get(uri);

      if (response.statusCode == 200) {
        final jsonResponse = json.decode(response.body);
        final data = jsonResponse['data'];

        if (data != null &&
            data['routes'] != null &&
            (data['routes'] as List).isNotEmpty) {
          final firstRoute = data['routes'][0];

          // Extract coordinates
          List<LatLng> coordinates = [];
          if (firstRoute['geometry'] != null) {
            final geometry = firstRoute['geometry'];
            if (geometry is Map && geometry['coordinates'] != null) {
              final coords = geometry['coordinates'] as List;
              coordinates = coords
                  .map(
                    (p) => LatLng(
                      (p[1] as num).toDouble(), // Lat
                      (p[0] as num).toDouble(), // Lon
                    ),
                  )
                  .toList();
            }
          }

          // Extract turn-by-turn steps
          List<Map<String, dynamic>> steps = [];
          if (firstRoute['legs'] != null &&
              (firstRoute['legs'] as List).isNotEmpty) {
            final legs = firstRoute['legs'] as List;
            for (var leg in legs) {
              if (leg['steps'] != null) {
                final legSteps = leg['steps'] as List;
                for (var step in legSteps) {
                  steps.add({
                    'distance': step['distance'],
                    'duration': step['duration'],
                    'instruction': step['name'] ?? 'Continue',
                    'maneuver': {
                      'type': step['maneuver']?['type'] ?? 'straight',
                      'instruction':
                          step['maneuver']?['instruction'] ??
                          'Continue on current road',
                    },
                  });
                }
              }
            }
          }

          return {'coordinates': coordinates, 'steps': steps};
        }
      }
    } catch (e) {
      print('Error getting route with steps: $e');
    }
    return {'coordinates': [], 'steps': []};
  }

  Future<Map<String, dynamic>> getMultiPointRouteWithSteps(
    List<LatLng> waypoints,
  ) async {
    try {
      final waypointData = waypoints
          .map((wp) => {'lat': wp.latitude, 'lon': wp.longitude})
          .toList();

      final response = await http.post(
        Uri.parse('$baseUrl/osrm/route/multi'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'waypoints': waypointData}),
      );

      if (response.statusCode == 200) {
        final jsonResponse = json.decode(response.body);
        final data = jsonResponse['data'];

        if (data != null &&
            data['routes'] != null &&
            (data['routes'] as List).isNotEmpty) {
          final firstRoute = data['routes'][0];

          // Extract coordinates
          List<LatLng> coordinates = [];
          if (firstRoute['geometry'] != null) {
            final geometry = firstRoute['geometry'];
            if (geometry is Map && geometry['coordinates'] != null) {
              final coords = geometry['coordinates'] as List;
              coordinates = coords
                  .map(
                    (p) => LatLng(
                      (p[1] as num).toDouble(),
                      (p[0] as num).toDouble(),
                    ),
                  )
                  .toList();
            }
          }

          // Extract turn-by-turn steps
          List<Map<String, dynamic>> steps = [];
          if (firstRoute['legs'] != null &&
              (firstRoute['legs'] as List).isNotEmpty) {
            final legs = firstRoute['legs'] as List;
            for (var leg in legs) {
              if (leg['steps'] != null) {
                final legSteps = leg['steps'] as List;
                for (var step in legSteps) {
                  steps.add({
                    'distance': step['distance'],
                    'duration': step['duration'],
                    'instruction': step['name'] ?? 'Continue',
                    'maneuver': {
                      'type': step['maneuver']?['type'] ?? 'straight',
                      'instruction':
                          step['maneuver']?['instruction'] ??
                          'Continue on current road',
                    },
                  });
                }
              }
            }
          }

          return {'coordinates': coordinates, 'steps': steps};
        }
      }
    } catch (e) {
      print('Error getting multi-point route: $e');
    }
    return {'coordinates': [], 'steps': []};
  }

  // --- Notifications ---

  /// Get notifications for a recipient
  Future<Map<String, dynamic>> getNotifications({
    required String recipientType,
    required String recipientId,
    int limit = 50,
    bool unreadOnly = false,
  }) async {
    try {
      final uri = Uri.parse('$baseUrl/notifications').replace(
        queryParameters: {
          'recipientType': recipientType,
          'recipientId': recipientId,
          'limit': limit.toString(),
          'unreadOnly': unreadOnly.toString(),
        },
      );
      final response = await http.get(uri);
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return {
          'notifications': data['data'] ?? [],
          'unreadCount': data['unreadCount'] ?? 0,
        };
      }
    } catch (e) {
      print('Error fetching notifications: $e');
    }
    return {'notifications': [], 'unreadCount': 0};
  }

  /// Get unread notification count
  Future<int> getUnreadNotificationCount({
    required String recipientType,
    required String recipientId,
  }) async {
    try {
      final uri = Uri.parse('$baseUrl/notifications/unread-count').replace(
        queryParameters: {
          'recipientType': recipientType,
          'recipientId': recipientId,
        },
      );
      final response = await http.get(uri);
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['count'] ?? 0;
      }
    } catch (e) {
      print('Error fetching unread count: $e');
    }
    return 0;
  }

  /// Mark a notification as read
  Future<bool> markNotificationAsRead(String notificationId) async {
    try {
      final response = await http.put(
        Uri.parse('$baseUrl/notifications/$notificationId/read'),
      );
      if (response.statusCode == 200) {
        return true;
      }
    } catch (e) {
      print('Error marking notification as read: $e');
    }
    return false;
  }

  /// Mark all notifications as read
  Future<bool> markAllNotificationsAsRead({
    required String recipientType,
    required String recipientId,
  }) async {
    try {
      final response = await http.put(
        Uri.parse('$baseUrl/notifications/mark-all-read'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'recipientType': recipientType,
          'recipientId': recipientId,
        }),
      );
      if (response.statusCode == 200) {
        return true;
      }
    } catch (e) {
      print('Error marking all notifications as read: $e');
    }
    return false;
  }

  // --- Inventory Rebalancing ---

  /// Check if a station needs rebalancing based on predicted demand vs charging capacity
  Future<Map<String, dynamic>> checkRebalancing(String stationId) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/logistics/rebalance/check'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'stationId': stationId}),
      );
      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
    } catch (e) {
      print('Error checking rebalancing: $e');
    }
    return {'success': false, 'error': 'Failed to check rebalancing'};
  }

  /// Approve a transfer task
  Future<Map<String, dynamic>> approveTransfer(
    String taskId,
    String approverId,
    String? notes,
  ) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/logistics/tasks/$taskId/approve'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'approverId': approverId,
          'notes': notes ?? 'Approved via mobile app',
        }),
      );
      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
    } catch (e) {
      print('Error approving transfer: $e');
    }
    return {'success': false, 'error': 'Failed to approve transfer'};
  }

  /// Reject a transfer task
  Future<Map<String, dynamic>> rejectTransfer(
    String taskId,
    String approverId,
    String? reason,
  ) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/logistics/tasks/$taskId/reject'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'rejectedBy': approverId,
          'reason': reason ?? 'Rejected via mobile app',
        }),
      );
      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
    } catch (e) {
      print('Error rejecting transfer: $e');
    }
    return {'success': false, 'error': 'Failed to reject transfer'};
  }

  /// Complete a transfer task (mark as delivered)
  Future<Map<String, dynamic>> completeTransfer(String taskId) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/logistics/tasks/$taskId/complete'),
        headers: {'Content-Type': 'application/json'},
      );
      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
    } catch (e) {
      print('Error completing transfer: $e');
    }
    return {'success': false, 'error': 'Failed to complete transfer'};
  }

  // --- Driver Pricing & Payments ---

  /// Get pricing constants
  Future<Map<String, dynamic>> getPricing() async {
    try {
      final response = await http.get(Uri.parse('$baseUrl/driver/pricing'));
      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
    } catch (e) {
      print('Error fetching pricing: $e');
    }
    return {'success': false};
  }

  /// Get driver balance and pending charges
  Future<Map<String, dynamic>> getDriverBalance(String driverId) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/driver/balance/$driverId'),
      );
      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
    } catch (e) {
      print('Error fetching driver balance: $e');
    }
    return {'success': false};
  }

  /// Get driver transaction history
  Future<List<dynamic>> getDriverTransactions(
    String driverId, {
    int limit = 20,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/driver/transactions/$driverId?limit=$limit'),
      );
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['transactions'] ?? [];
      }
    } catch (e) {
      print('Error fetching driver transactions: $e');
    }
    return [];
  }

  /// Record driver leave
  Future<Map<String, dynamic>> recordDriverLeave(String driverId) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/driver/leave'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'driverId': driverId}),
      );
      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
    } catch (e) {
      print('Error recording leave: $e');
    }
    return {'success': false};
  }

  // --- Partner Inventory ---

  /// Get detailed inventory status for a partner
  Future<Map<String, dynamic>> getPartnerInventory(String partnerId) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/partners/$partnerId/inventory'),
      );
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['data'] ?? {};
      }
    } catch (e) {
      print('Error fetching partner inventory: $e');
    }
    return {};
  }

  /// Get only active partners
  Future<List<dynamic>> getActivePartners() async {
    try {
      final response = await http.get(Uri.parse('$baseUrl/partners/active'));
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['data'] ?? [];
      }
    } catch (e) {
      print('Error fetching active partners: $e');
    }
    return [];
  }

  /// Get only inactive partners
  Future<List<dynamic>> getInactivePartners() async {
    try {
      final response = await http.get(Uri.parse('$baseUrl/partners/inactive'));
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['data'] ?? [];
      }
    } catch (e) {
      print('Error fetching inactive partners: $e');
    }
    return [];
  }

  // --- Forecasting & Analytics ---

  /// Get demand forecast for a station
  Future<Map<String, dynamic>> getForecast(String stationId) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/logistics/forecast/$stationId'),
      );
      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
    } catch (e) {
      print('Error fetching forecast: $e');
    }
    return {'success': false};
  }

  /// Get swap history for a station
  Future<Map<String, dynamic>> getSwapHistory(
    String stationId, {
    int days = 7,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/logistics/swap-history/$stationId?days=$days'),
      );
      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
    } catch (e) {
      print('Error fetching swap history: $e');
    }
    return {'success': false};
  }

  /// Get congestion data for all stations
  Future<List<dynamic>> getCongestionData() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/logistics/congestion'),
      );
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['congestionData'] ?? [];
      }
    } catch (e) {
      print('Error fetching congestion data: $e');
    }
    return [];
  }

  /// Get congestion data for specific station
  Future<Map<String, dynamic>> getStationCongestion(String stationId) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/logistics/congestion/$stationId'),
      );
      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
    } catch (e) {
      print('Error fetching station congestion: $e');
    }
    return {'success': false};
  }

  /// Record a swap event (alternative to driver/swap endpoint)
  Future<Map<String, dynamic>> recordSwapEvent({
    required String stationId,
    required String driverId,
    required String batteryOut,
    required String batteryIn,
    int? socOut,
    int? socIn,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/logistics/swap-event'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'stationId': stationId,
          'driverId': driverId,
          'batteryOut': batteryOut,
          'batteryIn': batteryIn,
          if (socOut != null) 'socOut': socOut,
          if (socIn != null) 'socIn': socIn,
        }),
      );
      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
    } catch (e) {
      print('Error recording swap event: $e');
    }
    return {'success': false};
  }

  /// Get AI rebalancing plan
  Future<Map<String, dynamic>> getRebalancingPlan() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/logistics/agent/rebalance-plan'),
      );
      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
    } catch (e) {
      print('Error fetching rebalancing plan: $e');
    }
    return {'success': false};
  }

  /// Get rebalancing status
  Future<Map<String, dynamic>> getRebalancingStatus() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/logistics/rebalance/status'),
      );
      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
    } catch (e) {
      print('Error fetching rebalancing status: $e');
    }
    return {'success': false};
  }

  // --- AI Agent ---

  /// Chat with AI agent
  Future<Map<String, dynamic>> chatWithAgent({
    required String message,
    String? sessionId,
    Map<String, dynamic>? context,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/agent/chat'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'message': message,
          if (sessionId != null) 'sessionId': sessionId,
          if (context != null) 'context': context,
        }),
      );
      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
    } catch (e) {
      print('Error chatting with agent: $e');
    }
    return {'success': false};
  }

  /// Request analysis from AI agent
  Future<Map<String, dynamic>> requestAnalysis({
    required String type,
    Map<String, dynamic>? data,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/agent/analyze'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'type': type, if (data != null) 'data': data}),
      );
      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
    } catch (e) {
      print('Error requesting analysis: $e');
    }
    return {'success': false};
  }

  /// Request AI to perform rebalancing
  Future<Map<String, dynamic>> requestAIRebalancing({
    required String stationId,
    String? reason,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/agent/request-rebalancing'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'stationId': stationId,
          if (reason != null) 'reason': reason,
        }),
      );
      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
    } catch (e) {
      print('Error requesting AI rebalancing: $e');
    }
    return {'success': false};
  }

  /// Get station status from AI agent
  Future<Map<String, dynamic>> getStationStatusFromAgent(
    String stationId,
  ) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/agent/station-status/$stationId'),
      );
      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
    } catch (e) {
      print('Error getting station status from agent: $e');
    }
    return {'success': false};
  }

  /// Configure AI auto-approval settings
  Future<Map<String, dynamic>> configureAutoApproval({
    required bool enabled,
    double? threshold,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/agent/auto-approve'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'enabled': enabled,
          if (threshold != null) 'threshold': threshold,
        }),
      );
      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
    } catch (e) {
      print('Error configuring auto-approval: $e');
    }
    return {'success': false};
  }

  // --- Charging Events ---

  /// Get all charging events with optional filters
  Future<List<dynamic>> getChargingEvents({
    String? deviceId,
    String? startDate,
    String? endDate,
    int? minSoc,
    int limit = 50,
    int offset = 0,
  }) async {
    try {
      final params = <String, String>{
        'limit': limit.toString(),
        'offset': offset.toString(),
      };
      if (deviceId != null) params['deviceId'] = deviceId;
      if (startDate != null) params['startDate'] = startDate;
      if (endDate != null) params['endDate'] = endDate;
      if (minSoc != null) params['minSoc'] = minSoc.toString();

      final uri = Uri.parse(
        '$baseUrl/charging-events',
      ).replace(queryParameters: params);
      final response = await http.get(uri);
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['data'] ?? [];
      }
    } catch (e) {
      print('Error fetching charging events: $e');
    }
    return [];
  }

  /// Get charging events statistics
  Future<Map<String, dynamic>> getChargingStats() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/charging-events/stats'),
      );
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['data'] ?? {};
      }
    } catch (e) {
      print('Error fetching charging stats: $e');
    }
    return {};
  }

  /// Get daily charging summary
  Future<List<dynamic>> getDailyChargingSummary({int days = 7}) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/charging-events/daily?days=$days'),
      );
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['data'] ?? [];
      }
    } catch (e) {
      print('Error fetching daily charging summary: $e');
    }
    return [];
  }

  /// Record driver route start
  Future<Map<String, dynamic>> startRoute({
    required String driverId,
    required String stationId,
    required double destinationLat,
    required double destinationLon,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/driver/start-route'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'driverId': driverId,
          'stationId': stationId,
          'destinationLat': destinationLat,
          'destinationLon': destinationLon,
        }),
      );
      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
    } catch (e) {
      print('Error starting route: $e');
    }
    return {'success': false};
  }

  /// Record service charge
  Future<Map<String, dynamic>> recordServiceCharge({
    required String driverId,
    required double amount,
    String? description,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/driver/service-charge'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'driverId': driverId,
          'amount': amount,
          if (description != null) 'description': description,
        }),
      );
      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
    } catch (e) {
      print('Error recording service charge: $e');
    }
    return {'success': false};
  }
}
