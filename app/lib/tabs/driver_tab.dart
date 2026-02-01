import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:async'; // Added for Timer
import 'dart:math'; // Added for Random
import '../services/api_service.dart';
import '../utils/app_colors.dart';
import '../widgets/notifications_widget.dart';
import '../widgets/driver_wallet_widget.dart';

class DriverTab extends StatefulWidget {
  const DriverTab({super.key});

  @override
  State<DriverTab> createState() => _DriverTabState();
}

class _DriverTabState extends State<DriverTab> {
  final ApiService _apiService = ApiService();
  final MapController _mapController = MapController();

  // Default location (e.g., Delhi)
  LatLng _currentLocation = LatLng(26.8467, 80.9462);
  List<Map<String, dynamic>> _nearbyPartners = [];
  LatLng? _destinationLocation;
  List<LatLng> _routePoints = [];

  bool _isLoading = false;

  // Search handling
  Timer? _debounce;
  List<dynamic> _suggestions = [];
  bool _showSuggestions = false;
  final TextEditingController _searchController = TextEditingController();

  // Navigation state
  bool _isNavigating = false;
  Map<String, dynamic>? _selectedStation;
  List<Map<String, dynamic>> _navigationSteps = [];
  int _currentStepIndex = 0;
  bool _hasArrivedAtStation = false;
  bool _isSwapping = false;
  bool _isAtSwapStation = false; // True only if destination is a swap station
  String _paymentMode = 'FIXED'; // 'FIXED' or 'DYNAMIC'

  // Driver ID
  String _driverId = 'DRIVER_001';

  // Driver's current batteries
  List<Map<String, dynamic>> _driverBatteries = [];

  // Arrival threshold in meters
  final double _arrivalThreshold = 50.0;

  // Battery range (in meters) - assuming 80km range
  final double _batteryRange = 80000.0;
  List<LatLng> _waypointStations = [];

  @override
  void initState() {
    super.initState();
    _pickRandomDriver();
    _loadNearbyStations();
    // _loadDriverInfo called in _pickRandomDriver or after
  }

  void _pickRandomDriver() {
    final random = Random();
    // Pick between DRIVER_001 and DRIVER_010
    final index = random.nextInt(10) + 1;
    setState(() {
      _driverId = 'DRIVER_${index.toString().padLeft(3, '0')}';
    });
    _loadDriverInfo();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  Future<void> _loadDriverInfo() async {
    try {
      // First try to load from SharedPreferences (cached)
      final prefs = await SharedPreferences.getInstance();
      final cachedBatteries = prefs.getStringList(
        'driver_batteries_$_driverId',
      );
      if (cachedBatteries != null && cachedBatteries.isNotEmpty) {
        setState(() {
          _driverBatteries = cachedBatteries.map((b) {
            final parts = b.split('|');
            return {
              'id': parts[0],
              'soc': int.tryParse(parts.length > 1 ? parts[1] : '0') ?? 0,
            };
          }).toList();
        });
      }

      // Fetch fresh data from server
      final response = await _apiService.getDriverInfo(_driverId);
      if (response != null && response['success'] == true) {
        final batteries = (response['batteries'] as List?) ?? [];
        setState(() {
          _driverBatteries = batteries
              .map((b) => Map<String, dynamic>.from(b))
              .toList();
        });

        // Cache battery info
        final batteryStrings = _driverBatteries
            .map((b) => '${b['id']}|${b['soc']}')
            .toList();
        await prefs.setStringList(
          'driver_batteries_$_driverId',
          batteryStrings,
        );
      }
    } catch (e) {
      print('Error loading driver info: $e');
    }
  }

  Future<void> _loadNearbyStations() async {
    // In a real app, get actual user location here
    try {
      final partners = await _apiService.getNearbyPartners(
        _currentLocation.latitude,
        _currentLocation.longitude,
      );

      // Store all nearby stations for dynamic marker building
      setState(() {
        _nearbyPartners = partners
            .map((p) => Map<String, dynamic>.from(p))
            .toList();
      });

      // Show feedback if no partners found
      if (_nearbyPartners.isEmpty && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('No nearby stations found - check server connection'),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error loading stations: $e')));
      }
    }
  }

  // Helper to parse coordinates from partner data
  LatLng _getPartnerLocation(Map<String, dynamic> p) {
    double lat = 0;
    double lon = 0;

    if (p['latitude'] != null) {
      lat = p['latitude'] is String
          ? double.parse(p['latitude'])
          : (p['latitude'] as num).toDouble();
    }
    if (p['longitude'] != null) {
      lon = p['longitude'] is String
          ? double.parse(p['longitude'])
          : (p['longitude'] as num).toDouble();
    }

    if (lat == 0 && lon == 0) {
      if (p['location'] != null && p['location']['coordinates'] != null) {
        final coords = p['location']['coordinates'];
        lon = coords[0] is String
            ? double.parse(coords[0])
            : (coords[0] as num).toDouble();
        lat = coords[1] is String
            ? double.parse(coords[1])
            : (coords[1] as num).toDouble();
      } else if (p['lat'] != null) {
        lat = p['lat'] is String
            ? double.parse(p['lat'])
            : (p['lat'] as num).toDouble();
        lon = p['lon'] is String
            ? double.parse(p['lon'])
            : (p['lon'] as num).toDouble();
      }
    }
    return LatLng(lat, lon);
  }

  // Build markers dynamically so they update with heading changes
  List<Marker> _buildMarkers() {
    final List<Marker> markers = [];

    // Partner station markers (circular)
    for (var p in _nearbyPartners) {
      final loc = _getPartnerLocation(p);
      // Skip invalid coordinates
      if (loc.latitude == 0 && loc.longitude == 0) continue;

      markers.add(
        Marker(
          point: loc,
          width: 32,
          height: 32,
          child: GestureDetector(
            onTap: () => _onStationTap(loc.latitude, loc.longitude, p),
            child: Container(
              decoration: BoxDecoration(
                color: Colors.red,
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 3),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.3),
                    blurRadius: 4,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: const Center(
                child: Icon(Icons.ev_station, color: Colors.white, size: 16),
              ),
            ),
          ),
        ),
      );
    }

    // Waypoint station markers (circular)
    for (var waypoint in _waypointStations) {
      markers.add(
        Marker(
          point: waypoint,
          width: 28,
          height: 28,
          child: Container(
            decoration: BoxDecoration(
              color: Colors.orange,
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white, width: 2),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.3),
                  blurRadius: 4,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: const Center(
              child: Icon(Icons.flash_on, color: Colors.white, size: 14),
            ),
          ),
        ),
      );
    }

    // Destination marker (circular)
    if (_destinationLocation != null) {
      markers.add(
        Marker(
          point: _destinationLocation!,
          width: 36,
          height: 36,
          child: Container(
            decoration: BoxDecoration(
              color: Colors.blue,
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white, width: 3),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.3),
                  blurRadius: 4,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: const Center(
              child: Icon(Icons.flag, color: Colors.white, size: 18),
            ),
          ),
        ),
      );
    }

    // Current user marker (Blue Dot with Shadow) - add last so it's on top
    markers.add(
      Marker(
        point: _currentLocation,
        width: 24,
        height: 24,
        child: Container(
          decoration: BoxDecoration(
            color: Colors.blue,
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 3),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.3),
                blurRadius: 6,
                offset: const Offset(0, 3),
              ),
            ],
          ),
        ),
      ),
    );

    return markers;
  }

  // Handle tap on map (not on a marker)
  void _onMapTap(LatLng point) {
    // Set destination and show bottom sheet for navigation
    // This is NOT a swap station - just a regular destination
    setState(() {
      _destinationLocation = point;
      _isAtSwapStation = false; // Map tap is not a swap station
      _selectedStation = {
        'name': 'Selected Location',
        'id': 'map_tap',
        'isSwapStation': false,
        'latitude': point.latitude,
        'longitude': point.longitude,
        'address':
            'Lat: ${point.latitude.toStringAsFixed(4)}, Lon: ${point.longitude.toStringAsFixed(4)}',
      };
    });

    _showStationBottomSheet(point.latitude, point.longitude);
  }

  Future<void> _onStationTap(
    double endLat,
    double endLon,
    Map<String, dynamic> stationData,
  ) async {
    // Mark this as a swap station
    stationData['isSwapStation'] = true;
    setState(() {
      _selectedStation = stationData;
      _isAtSwapStation = true;
    });

    // Show bottom sheet with station info
    _showStationBottomSheet(endLat, endLon);
  }

  void _showStationBottomSheet(double lat, double lon) {
    final isStation = _selectedStation?['isSwapStation'] == true;

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: isStation ? 0.5 : 0.35,
        minChildSize: 0.3,
        maxChildSize: isStation ? 0.85 : 0.5,
        expand: false,
        builder: (context, scrollController) => SingleChildScrollView(
          controller: scrollController,
          child: Container(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Drag handle
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    margin: const EdgeInsets.only(bottom: 16),
                    decoration: BoxDecoration(
                      color: Colors.grey[300],
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),

                if (isStation) ...[
                  // Station content
                  // Header with station info
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.blue.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(
                          Icons.ev_station,
                          color: Colors.blue,
                          size: 32,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _selectedStation?['name'] ??
                                  _selectedStation?['id'] ??
                                  'Charging Station',
                              style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              _selectedStation?['address'] ??
                                  _selectedStation?['zone'] ??
                                  'Battery Swapping Station',
                              style: TextStyle(
                                color: Colors.grey[600],
                                fontSize: 14,
                              ),
                            ),
                          ],
                        ),
                      ),
                      // Active status badge
                      if (_selectedStation?['is_active_dsk'] == true)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.green,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Text(
                            'ACTIVE',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                    ],
                  ),

                  const SizedBox(height: 16),

                  // Battery Inventory Section - Compact
                  Row(
                    children: [
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.green.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: Colors.green.withValues(alpha: 0.3),
                            ),
                          ),
                          child: Row(
                            children: [
                              const Icon(
                                Icons.battery_charging_full,
                                color: Colors.green,
                                size: 28,
                              ),
                              const SizedBox(width: 12),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    '${_selectedStation?['fully_charged_batteries'] ?? _selectedStation?['available_batteries'] ?? 'N/A'}',
                                    style: const TextStyle(
                                      fontSize: 24,
                                      fontWeight: FontWeight.bold,
                                      color: Colors.green,
                                    ),
                                  ),
                                  Text(
                                    'Charged',
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: Colors.grey[700],
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.blue.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: Colors.blue.withValues(alpha: 0.3),
                            ),
                          ),
                          child: Row(
                            children: [
                              const Icon(
                                Icons.battery_std,
                                color: Colors.blue,
                                size: 28,
                              ),
                              const SizedBox(width: 12),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    '${_selectedStation?['total_batteries'] ?? 'N/A'}',
                                    style: const TextStyle(
                                      fontSize: 24,
                                      fontWeight: FontWeight.bold,
                                      color: Colors.blue,
                                    ),
                                  ),
                                  Text(
                                    'Total',
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: Colors.grey[700],
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 16),

                  // Quick Info Chips
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _buildInfoChip(Icons.access_time, 'Open 24/7'),
                      if (_selectedStation?['zone'] != null)
                        _buildInfoChip(
                          Icons.location_on,
                          _selectedStation!['zone'],
                        ),
                      if (_selectedStation?['distance_km'] != null)
                        _buildInfoChip(
                          Icons.directions,
                          '${(_selectedStation!['distance_km'] as num).toStringAsFixed(1)} km away',
                        ),
                    ],
                  ),
                ] else ...[
                  // Regular map location content
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.grey.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(
                          Icons.location_on,
                          color: Colors.grey,
                          size: 32,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _selectedStation?['name'] ?? 'Selected Location',
                              style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              _selectedStation?['address'] ??
                                  'Custom Destination',
                              style: TextStyle(
                                color: Colors.grey[600],
                                fontSize: 14,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 16),

                  // Location info
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.grey[50],
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.grey[200]!),
                    ),
                    child: Column(
                      children: [
                        Row(
                          children: [
                            const Icon(
                              Icons.gps_fixed,
                              size: 16,
                              color: Colors.grey,
                            ),
                            const SizedBox(width: 8),
                            const Text(
                              'Coordinates:',
                              style: TextStyle(
                                color: Colors.grey,
                                fontSize: 13,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                'Lat: ${lat.toStringAsFixed(5)}, Lon: ${lon.toStringAsFixed(5)}',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 13,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 16),

                  // Info message
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.blue.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: Colors.blue.withValues(alpha: 0.3),
                      ),
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.info_outline,
                          color: Colors.blue,
                          size: 20,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'This is not a charging station. Navigation will guide you to this location.',
                            style: TextStyle(
                              color: Colors.blue[700],
                              fontSize: 13,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],

                const SizedBox(height: 20),

                // Navigation Button
                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.blue,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    onPressed: () {
                      Navigator.pop(context);
                      _startNavigation(lat, lon);
                    },
                    child: const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.navigation, color: Colors.white),
                        SizedBox(width: 8),
                        Text(
                          'Start Navigation',
                          style: TextStyle(fontSize: 16, color: Colors.white),
                        ),
                      ],
                    ),
                  ),
                ),

                const SizedBox(height: 12),

                // Trigger Low Inventory Button (Testing) - only for stations
                if (isStation && _selectedStation?['id'] != null)
                  SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.orange,
                        side: const BorderSide(color: Colors.orange, width: 2),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      onPressed: () => _triggerLowInventory(),
                      child: const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.battery_alert, color: Colors.orange),
                          SizedBox(width: 8),
                          Text(
                            'Trigger Low Inventory',
                            style: TextStyle(
                              fontSize: 16,
                              color: Colors.orange,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _triggerLowInventory() async {
    final stationId = _selectedStation?['id']?.toString();
    if (stationId == null) return;

    // Show confirmation dialog
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Trigger Low Inventory?'),
        content: Text(
          'This will set all batteries at ${_selectedStation?['name'] ?? stationId} to 10% SOC.\n\nThis is for testing purposes only.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.orange),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Confirm'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    // Show loading
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Setting batteries to low inventory...')),
      );
    }

    // Call API
    final result = await _apiService.triggerLowInventory(stationId);

    if (result != null && result['success'] == true) {
      // Refresh nearby stations to show updated data
      await _loadNearbyStations();

      if (mounted) {
        Navigator.pop(context); // Close bottom sheet
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(result['message'] ?? 'Batteries updated to 10% SOC'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } else {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Failed to trigger low inventory'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Widget _buildInfoChip(IconData icon, String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.grey[200],
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: Colors.grey[700]),
          const SizedBox(width: 4),
          Text(text, style: TextStyle(color: Colors.grey[700], fontSize: 12)),
        ],
      ),
    );
  }

  Widget _buildStationStatCard(
    String label,
    String value,
    IconData icon,
    Color color,
  ) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(height: 8),
          Text(
            value,
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
          const SizedBox(height: 4),
          Text(label, style: TextStyle(fontSize: 11, color: Colors.grey[600])),
        ],
      ),
    );
  }

  Widget _buildActivityStat(String label, String value, IconData icon) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(icon, size: 16, color: Colors.grey[600]),
            const SizedBox(width: 4),
            Text(
              label,
              style: TextStyle(fontSize: 12, color: Colors.grey[600]),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
        ),
      ],
    );
  }

  String _formatRelativeTime(dynamic timestamp) {
    try {
      DateTime dateTime;
      if (timestamp is String) {
        dateTime = DateTime.parse(timestamp);
      } else if (timestamp is DateTime) {
        dateTime = timestamp;
      } else {
        return 'Unknown';
      }

      final now = DateTime.now();
      final difference = now.difference(dateTime);

      if (difference.inMinutes < 1) {
        return 'Just now';
      } else if (difference.inMinutes < 60) {
        return '${difference.inMinutes} min ago';
      } else if (difference.inHours < 24) {
        return '${difference.inHours} hours ago';
      } else if (difference.inDays < 7) {
        return '${difference.inDays} days ago';
      } else {
        return '${(difference.inDays / 7).floor()} weeks ago';
      }
    } catch (e) {
      return 'Unknown';
    }
  }

  Future<void> _startNavigation(double endLat, double endLon) async {
    setState(() => _isLoading = true);

    // Use the navigation/plan API which automatically adds swap stops if needed
    final planData = await _apiService.planNavigationRoute(
      _currentLocation.latitude,
      _currentLocation.longitude,
      endLat,
      endLon,
    );

    if (planData != null) {
      setState(() {
        _routePoints = planData['coordinates'] ?? [];
        _navigationSteps = planData['steps'] ?? [];
        _waypointStations = planData['waypoints'] ?? [];
        _currentStepIndex = 0;
        _isNavigating = true;
        _hasArrivedAtStation = false;
        _destinationLocation = LatLng(endLat, endLon);
        _isLoading = false;
      });

      // Show message about route type
      final routeType = planData['type'] ?? 'direct';
      if (routeType == 'multi_stop' && _waypointStations.isNotEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Route includes ${_waypointStations.length} battery swap stop(s)',
            ),
          ),
        );
      }
    } else {
      setState(() => _isLoading = false);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Failed to plan route')));
    }
  }

  // Check if driver has arrived at destination
  void _checkArrival() {
    if (_destinationLocation == null || !_isNavigating) return;

    final distance = const Distance().as(
      LengthUnit.Meter,
      _currentLocation,
      _destinationLocation!,
    );

    if (distance <= _arrivalThreshold && !_hasArrivedAtStation) {
      setState(() {
        _hasArrivedAtStation = true;
      });
    }
  }

  // Simulate arriving at destination (for demo purposes)
  void _simulateArrival() {
    if (_destinationLocation != null) {
      setState(() {
        _currentLocation = _destinationLocation!;
        _hasArrivedAtStation = true;
      });
      _mapController.move(_currentLocation, 17);
    }
  }

  // Swap battery at current station
  Future<void> _swapBattery() async {
    if (_selectedStation == null) return;

    final stationId = _selectedStation!['id']?.toString() ?? '';
    if (stationId.isEmpty) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Station ID not found')));
      return;
    }

    setState(() => _isSwapping = true);

    // Get current battery info to send to server
    int? currentSoc;
    String? currentBatteryId;
    if (_driverBatteries.isNotEmpty) {
      final currentBattery = _driverBatteries.first;
      currentSoc = currentBattery['soc'] as int?;
      currentBatteryId = currentBattery['id'] as String?;
    }

    final result = await _apiService.swapBattery(
      _driverId,
      stationId,
      currentBatterySoc: currentSoc,
      currentBatteryId: currentBatteryId,
      paymentMode: _paymentMode,
    );

    setState(() => _isSwapping = false);

    if (result != null && result['success'] == true) {
      // Update driver's battery from swap result
      final batteryReceived = result['batteryReceived'];
      if (batteryReceived != null) {
        setState(() {
          _driverBatteries = [
            {'id': batteryReceived['id'], 'soc': batteryReceived['soc']},
          ];
        });

        // Cache the new battery info
        final prefs = await SharedPreferences.getInstance();
        await prefs.setStringList('driver_batteries_$_driverId', [
          '${batteryReceived['id']}|${batteryReceived['soc']}',
        ]);
      }

      // Show Payment Receipt
      if (result['paymentDetails'] != null) {
        final details = result['paymentDetails'];
        // breakdown might be nested
        final breakdown = details['breakdown'] ?? {};

        await showDialog(
          context: context,
          builder: (context) => AlertDialog(
            title: const Row(
              children: [
                Icon(Icons.receipt_long, color: Colors.green),
                SizedBox(width: 8),
                Text('Swap Complete'),
              ],
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Payment Mode: ${details['paymentMode'] ?? 'FIXED'}',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                const Divider(),
                if (details['paymentMode'] == 'DYNAMIC') ...[
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Energy Consumed:'),
                      Text(
                        '${(details['energyConsumedKwh'] ?? 0).toStringAsFixed(2)} kWh',
                      ),
                    ],
                  ),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Energy Cost:'),
                      Text('₹${breakdown['energyCost'] ?? 0}'),
                    ],
                  ),
                ] else ...[
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Base Swap Price:'),
                      Text('₹${breakdown['base'] ?? 0}'),
                    ],
                  ),
                ],
                if ((breakdown['extraCharge'] ?? 0) > 0)
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Extra Charge:'),
                      Text('₹${breakdown['extraCharge']}'),
                    ],
                  ),
                if ((details['penaltyDeduction'] ?? 0) > 0)
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Leave Penalty Recovery:',
                        style: TextStyle(color: Colors.red),
                      ),
                      Text(
                        '₹${details['penaltyDeduction']}',
                        style: const TextStyle(color: Colors.red),
                      ),
                    ],
                  ),
                if ((details['serviceDeduction'] ?? 0) > 0)
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Service Charge Recovery:',
                        style: TextStyle(color: Colors.orange),
                      ),
                      Text(
                        '₹${details['serviceDeduction']}',
                        style: const TextStyle(color: Colors.orange),
                      ),
                    ],
                  ),
                const Divider(),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Total Paid:',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                    Text(
                      '₹${details['totalPayment'] ?? 0}',
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 18,
                        color: Colors.green,
                      ),
                    ),
                  ],
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Close'),
              ),
            ],
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              '✓ Battery swapped! New: ${batteryReceived?['id']} (${batteryReceived?['soc']}%)',
            ),
            backgroundColor: Colors.green,
          ),
        );
      }

      // End navigation after successful swap
      setState(() {
        _isNavigating = false;
        _hasArrivedAtStation = false;
        _routePoints = [];
        _navigationSteps = [];
        _destinationLocation = null;
        _selectedStation = null;
      });

      // Reload nearby stations
      _loadNearbyStations();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(result?['message'] ?? 'Failed to swap battery'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Future<void> _returnBattery() async {
    if (_selectedStation == null) return;
    if (_driverBatteries.isEmpty) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('No battery to return')));
      return;
    }

    final stationId = _selectedStation!['id']?.toString() ?? '';
    if (stationId.isEmpty) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Station ID not found')));
      return;
    }

    final currentBattery = _driverBatteries.first;
    final batteryId = currentBattery['id'] as String?;
    final currentSoc = currentBattery['soc'] as int? ?? 0;

    // Calculate estimated refund
    const batteryCapacity = 2.0; // kWh
    const kwhRate = 85; // ₹ per kWh
    final kwhRemaining = (currentSoc / 100) * batteryCapacity;
    final estimatedRefund = (kwhRemaining * kwhRate).round();

    // Show confirmation dialog with refund estimate
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.assignment_return, color: Colors.orange),
            SizedBox(width: 8),
            Text('Return Battery?'),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Return battery $batteryId with $currentSoc% charge?'),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.orange.withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.orange.withOpacity(0.3)),
              ),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Current Charge:'),
                      Text(
                        '$currentSoc%',
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Energy Remaining:'),
                      Text(
                        '${kwhRemaining.toStringAsFixed(2)} kWh',
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                  const Divider(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Estimated Refund:',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                      Text(
                        currentSoc >= 20 ? '₹$estimatedRefund' : '₹0',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                          color: currentSoc >= 20 ? Colors.green : Colors.red,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            if (currentSoc < 20)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(
                  'Note: Minimum 20% charge required for refund',
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.red[700],
                    fontStyle: FontStyle.italic,
                  ),
                ),
              ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.orange),
            child: const Text('Return Battery'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    setState(() => _isSwapping = true);

    final result = await _apiService.returnBattery(
      _driverId,
      stationId,
      batteryId: batteryId,
    );

    setState(() => _isSwapping = false);

    if (result['success'] == true) {
      final actualRefund = result['refund'] ?? 0;

      // Clear driver's battery
      setState(() {
        _driverBatteries = [];
      });

      // Clear cached battery info
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('driver_batteries_$_driverId');

      // Show success dialog with refund details
      await showDialog(
        context: context,
        builder: (context) => AlertDialog(
          title: const Row(
            children: [
              Icon(Icons.check_circle, color: Colors.green),
              SizedBox(width: 8),
              Text('Battery Returned'),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.assignment_turned_in,
                size: 64,
                color: Colors.green,
              ),
              const SizedBox(height: 16),
              Text(
                'Battery returned successfully!',
                style: const TextStyle(fontSize: 16),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              if (actualRefund > 0)
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.green.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.green),
                  ),
                  child: Column(
                    children: [
                      const Text(
                        'Refund Credited',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        '₹$actualRefund',
                        style: const TextStyle(
                          fontSize: 32,
                          fontWeight: FontWeight.bold,
                          color: Colors.green,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Based on $currentSoc% charge remaining',
                        style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                      ),
                    ],
                  ),
                )
              else
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.orange.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    'No refund (battery charge below 20%)',
                    style: TextStyle(fontSize: 12, color: Colors.orange[700]),
                  ),
                ),
            ],
          ),
          actions: [
            ElevatedButton(
              onPressed: () => Navigator.pop(context),
              style: ElevatedButton.styleFrom(backgroundColor: Colors.green),
              child: const Text('OK'),
            ),
          ],
        ),
      );

      // End navigation after successful return
      setState(() {
        _isNavigating = false;
        _hasArrivedAtStation = false;
        _routePoints = [];
        _navigationSteps = [];
        _destinationLocation = null;
        _selectedStation = null;
      });

      // Reload nearby stations
      _loadNearbyStations();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(result['error'] ?? 'Failed to return battery'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Future<void> _findBestStation() async {
    setState(() => _isLoading = true);
    final station = await _apiService.findBestStation(
      _currentLocation.latitude,
      _currentLocation.longitude,
      5000,
    ); // 5km radius
    setState(() => _isLoading = false);

    if (station != null) {
      // Use ID as name if name is missing
      final name = station['name'] ?? station['id'] ?? 'Unknown Station';
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Best Station found: $name')));

      // Handle station coordinates - Check DB keys or API response structure
      double lat = 0;
      double lon = 0;

      // Safe parsing that handles both String and num types
      if (station['latitude'] != null) {
        lat = station['latitude'] is String
            ? double.parse(station['latitude'])
            : (station['latitude'] as num).toDouble();
      }
      if (station['longitude'] != null) {
        lon = station['longitude'] is String
            ? double.parse(station['longitude'])
            : (station['longitude'] as num).toDouble();
      }

      if (lat == 0 && lon == 0) {
        if (station['location'] != null &&
            station['location']['coordinates'] != null) {
          final coords = station['location']['coordinates'];
          lon = coords[0] is String
              ? double.parse(coords[0])
              : (coords[0] as num).toDouble();
          lat = coords[1] is String
              ? double.parse(coords[1])
              : (coords[1] as num).toDouble();
        } else if (station['lat'] != null) {
          lat = station['lat'] is String
              ? double.parse(station['lat'])
              : (station['lat'] as num).toDouble();
          lon = station['lon'] is String
              ? double.parse(station['lon'])
              : (station['lon'] as num).toDouble();
        }
      }

      if (lat != 0 && lon != 0) {
        _onStationTap(lat, lon, station);
      }
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No suitable station found nearby')),
      );
    }
  }

  void _onSearchChanged(String query) {
    print('Search query: $query'); // Debug
    if (_debounce?.isActive ?? false) _debounce!.cancel();

    if (query.isEmpty) {
      setState(() {
        _suggestions = [];
        _showSuggestions = false;
      });
      return;
    }

    _debounce = Timer(const Duration(milliseconds: 500), () async {
      print('Calling searchLocation API...'); // Debug
      final results = await _apiService.searchLocation(query);
      print('Got ${results.length} results'); // Debug

      // Sort by distance to current location
      results.sort((a, b) {
        final double latA = double.parse(a['lat']);
        final double lonA = double.parse(a['lon']);
        final double latB = double.parse(b['lat']);
        final double lonB = double.parse(b['lon']);

        final distA = const Distance().as(
          LengthUnit.Meter,
          _currentLocation,
          LatLng(latA, lonA),
        );
        final distB = const Distance().as(
          LengthUnit.Meter,
          _currentLocation,
          LatLng(latB, lonB),
        );

        return distA.compareTo(distB);
      });

      setState(() {
        _suggestions = results;
        _showSuggestions = true;
      });
    });
  }

  void _selectSuggestion(dynamic location) {
    // Hide suggestions
    setState(() {
      _showSuggestions = false;
      _searchController.text = location['display_name'] ?? '';
    });
    FocusScope.of(context).unfocus();

    final lat = double.parse(location['lat']);
    final lon = double.parse(location['lon']);

    _handleLocationSelected(lat, lon);
  }

  Future<void> _handleLocationSelected(double lat, double lon) async {
    _mapController.move(LatLng(lat, lon), 15);

    // Set destination location for marker
    setState(() {
      _destinationLocation = LatLng(lat, lon);
    });

    // Create a minimal location object for the searched location
    final locationStation = {
      'name': 'Destination',
      'id': 'search_result',
      'latitude': lat,
      'longitude': lon,
      'isSwapStation': false,
      'address': _searchController.text,
    };
    // Use _onMapTap instead to avoid setting isSwapStation to true
    setState(() {
      _selectedStation = locationStation;
      _isAtSwapStation = false;
    });
    _showStationBottomSheet(lat, lon);
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        FlutterMap(
          mapController: _mapController,
          options: MapOptions(
            initialCenter: _currentLocation,
            initialZoom: 13.0,
            interactionOptions: InteractionOptions(flags: InteractiveFlag.all),
            onTap: (tapPosition, point) {
              _onMapTap(point);
            },
          ),
          children: [
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'com.hacksmart.app',
            ),
            if (_routePoints.isNotEmpty)
              PolylineLayer(
                polylines: [
                  Polyline(
                    points: _routePoints,
                    color: Colors.blue,
                    strokeWidth: 4.0,
                  ),
                ],
              ),
            MarkerLayer(markers: _buildMarkers()),
          ],
        ),
        if (_isLoading) const Center(child: CircularProgressIndicator()),

        // Turn-by-turn directions at top (when navigating)
        if (_isNavigating && _navigationSteps.isNotEmpty)
          Positioned(
            top: 40,
            left: 16,
            right: 16,
            child: Card(
              elevation: 8,
              color: Colors.white,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: Colors.blue,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Icon(
                            _getDirectionIcon(
                              _navigationSteps[_currentStepIndex]['maneuver']?['type'] ??
                                  'straight',
                            ),
                            color: Colors.white,
                            size: 28,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                _navigationSteps[_currentStepIndex]['maneuver']?['instruction'] ??
                                    'Continue on current road',
                                style: const TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'In ${_formatDistance(_navigationSteps[_currentStepIndex]['distance'])}',
                                style: TextStyle(
                                  color: Colors.grey[600],
                                  fontSize: 14,
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close),
                          onPressed: () {
                            setState(() {
                              _isNavigating = false;
                              _routePoints = [];
                              _navigationSteps = [];
                            });
                          },
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    LinearProgressIndicator(
                      value: (_currentStepIndex + 1) / _navigationSteps.length,
                      backgroundColor: Colors.grey[300],
                      color: Colors.blue,
                    ),
                    // Demo button to simulate arrival
                    if (!_hasArrivedAtStation)
                      Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: TextButton.icon(
                          onPressed: _simulateArrival,
                          icon: const Icon(Icons.location_on, size: 16),
                          label: const Text('Simulate Arrival'),
                          style: TextButton.styleFrom(
                            foregroundColor: Colors.grey[600],
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),

        // Arrived at Station - Swap Battery UI (only show at swap stations)
        if (_isNavigating && _hasArrivedAtStation && _isAtSwapStation)
          Positioned(
            bottom: 100,
            left: 16,
            right: 16,
            child: Card(
              elevation: 8,
              color: Colors.green[50],
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.green.withOpacity(0.2),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(
                            Icons.check_circle,
                            color: Colors.green,
                            size: 32,
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'You have arrived!',
                                style: TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                _selectedStation?['name'] ??
                                    _selectedStation?['id'] ??
                                    'Swap Station',
                                style: TextStyle(color: Colors.grey[600]),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    SizedBox(
                      width: double.infinity,
                      height: 56,
                      child: ElevatedButton.icon(
                        onPressed: _isSwapping ? null : _swapBattery,
                        icon: _isSwapping
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                  color: Colors.white,
                                  strokeWidth: 2,
                                ),
                              )
                            : const Icon(Icons.swap_horiz),
                        label: Text(
                          _isSwapping
                              ? 'Swapping...'
                              : 'Swap Battery', // (${_paymentMode == 'DYNAMIC' ? 'Dynamic' : 'Fixed'})
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.green,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    // Return Battery Button (only show if driver has a battery)
                    if (_driverBatteries.isNotEmpty)
                      SizedBox(
                        width: double.infinity,
                        height: 48,
                        child: OutlinedButton.icon(
                          onPressed: _isSwapping ? null : _returnBattery,
                          icon: const Icon(Icons.assignment_return, size: 20),
                          label: const Text('Return Battery & Get Refund'),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: Colors.orange,
                            side: const BorderSide(
                              color: Colors.orange,
                              width: 2,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                        ),
                      ),
                    if (_driverBatteries.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Text(
                          'Refund based on remaining charge (Min 20% for refund)',
                          style: TextStyle(
                            fontSize: 11,
                            color: Colors.orange[700],
                            fontStyle: FontStyle.italic,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),

        // Arrived at regular destination (not a swap station)
        if (_isNavigating && _hasArrivedAtStation && !_isAtSwapStation)
          Positioned(
            bottom: 100,
            left: 16,
            right: 16,
            child: Card(
              elevation: 8,
              color: Colors.blue[50],
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.blue.withOpacity(0.2),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(
                            Icons.location_on,
                            color: Colors.blue,
                            size: 32,
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'You have arrived!',
                                style: TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                _selectedStation?['name'] ?? 'Destination',
                                style: TextStyle(color: Colors.grey[600]),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: ElevatedButton(
                        onPressed: () {
                          setState(() {
                            _isNavigating = false;
                            _hasArrivedAtStation = false;
                            _routePoints = [];
                            _navigationSteps = [];
                            _destinationLocation = null;
                          });
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.blue,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: const Text('End Navigation'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

        // Search Bar at Top (when NOT navigating)
        if (!_isNavigating)
          Positioned(
            top: 40, // Adjust based on SafeArea
            left: 16,
            right: 16,
            child: GestureDetector(
              onTap: () {}, // Absorb taps to prevent map from receiving them
              behavior: HitTestBehavior.opaque,
              child: Column(
                children: [
                  Card(
                    elevation: 4,
                    color: Colors.white,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 4,
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.search, color: Colors.grey),
                          const SizedBox(width: 8),
                          Expanded(
                            child: TextField(
                              controller: _searchController,
                              decoration: const InputDecoration(
                                hintText: 'Where to?',
                                border: InputBorder.none,
                                hintStyle: TextStyle(color: Colors.grey),
                              ),
                              onChanged: _onSearchChanged,
                              onTap: () {
                                print('TextField tapped'); // Debug
                              },
                            ),
                          ),
                          if (_searchController.text.isNotEmpty)
                            IconButton(
                              icon: const Icon(Icons.close, color: Colors.grey),
                              onPressed: () {
                                _searchController.clear();
                                _onSearchChanged('');
                              },
                            ),
                        ],
                      ),
                    ),
                  ),
                  if (_showSuggestions && _suggestions.isNotEmpty)
                    Container(
                      margin: const EdgeInsets.only(top: 4),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(8),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.1),
                            blurRadius: 10,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      // Increase max height and ensure it can take space
                      constraints: const BoxConstraints(maxHeight: 250),
                      child: ListView.separated(
                        shrinkWrap: true,
                        // Add physics to avoid scrolling conflict
                        physics: const ClampingScrollPhysics(),
                        itemCount: _suggestions.length,
                        separatorBuilder: (context, index) =>
                            const Divider(height: 1),
                        itemBuilder: (context, index) {
                          final suggestion = _suggestions[index];
                          // Format address nicely
                          final displayName = suggestion['display_name'] ?? '';
                          final parts = displayName.split(',');
                          final mainText = parts[0];
                          final secondaryText = parts.length > 1
                              ? parts.sublist(1).join(',').trim()
                              : '';

                          return ListTile(
                            leading: const Icon(
                              Icons.location_on_outlined,
                              color: Colors.grey,
                            ),
                            title: Text(
                              mainText,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            subtitle: secondaryText.isNotEmpty
                                ? Text(
                                    secondaryText,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(fontSize: 12),
                                  )
                                : null,
                            onTap: () => _selectSuggestion(suggestion),
                          );
                        },
                      ),
                    ),
                ],
              ),
            ),
          ),

        // Controls at Bottom
        Positioned(
          left: 16,
          right: 16,
          bottom: 16,
          child: Column(
            children: [
              // Action buttons row with battery info
              Row(
                children: [
                  // Battery Status - compact inline
                  _buildCompactBatteryInfo(),
                  const SizedBox(width: 8),

                  // My Location button
                  Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.1),
                          blurRadius: 8,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: IconButton(
                      icon: const Icon(
                        Icons.my_location,
                        color: AppColors.primaryBlue,
                      ),
                      onPressed: () {
                        _mapController.move(_currentLocation, 15);
                      },
                      tooltip: 'My Location',
                    ),
                  ),
                  const SizedBox(width: 8),

                  // Find Swap button - expanded to take remaining space
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: _findBestStation,
                      icon: const Icon(Icons.flash_on, size: 20),
                      label: const Text(
                        'Find Swap Station',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primaryBlue,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 16,
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        elevation: 4,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  IconData _getDirectionIcon(String type) {
    switch (type) {
      case 'turn-left':
      case 'turn-slight-left':
        return Icons.turn_left;
      case 'turn-right':
      case 'turn-slight-right':
        return Icons.turn_right;
      case 'turn-sharp-left':
        return Icons.turn_sharp_left;
      case 'turn-sharp-right':
        return Icons.turn_sharp_right;
      case 'uturn':
        return Icons.u_turn_left;
      case 'arrive':
        return Icons.location_on;
      default:
        return Icons.arrow_upward;
    }
  }

  String _formatDistance(dynamic distance) {
    if (distance == null) return '';
    final double meters = distance is int
        ? distance.toDouble()
        : (distance as double);

    if (meters < 1000) {
      return '${meters.round()} m';
    } else {
      return '${(meters / 1000).toStringAsFixed(1)} km';
    }
  }

  void _showWalletBottomSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.7,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        builder: (context, scrollController) => Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: SingleChildScrollView(
            controller: scrollController,
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Handle bar
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    margin: const EdgeInsets.only(bottom: 16),
                    decoration: BoxDecoration(
                      color: Colors.grey[300],
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),

                // Wallet widget
                DriverWalletWidget(driverId: _driverId),

                const SizedBox(height: 16),

                // Transaction history button
                ElevatedButton.icon(
                  onPressed: () {
                    Navigator.pop(context);
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (context) =>
                            DriverTransactionsScreen(driverId: _driverId),
                      ),
                    );
                  },
                  icon: const Icon(Icons.receipt_long),
                  label: const Text('View Transaction History'),
                  style: ElevatedButton.styleFrom(
                    minimumSize: const Size.fromHeight(48),
                    backgroundColor: AppColors.primaryBlue,
                    foregroundColor: Colors.white,
                  ),
                ),

                const SizedBox(height: 24),

                // Pricing info
                const PricingInfoWidget(),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildCompactBatteryInfo() {
    return GestureDetector(
      onTap: () => _loadDriverInfo(), // Refresh on tap
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.1),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: _driverBatteries.isEmpty
            ? Icon(Icons.battery_unknown, color: Colors.grey, size: 24)
            : Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    _getBatteryIcon(_driverBatteries.first['soc'] ?? 0),
                    color: _getBatteryColor(_driverBatteries.first['soc'] ?? 0),
                    size: 24,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    '${_driverBatteries.first['soc'] ?? 0}%',
                    style: TextStyle(
                      color: _getBatteryColor(
                        _driverBatteries.first['soc'] ?? 0,
                      ),
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                    ),
                  ),
                ],
              ),
      ),
    );
  }

  Widget _buildBatteryStatusBar() {
    return GestureDetector(
      onTap: () => _loadDriverInfo(), // Refresh on tap
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
              color: Colors.black12,
              blurRadius: 4,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: _driverBatteries.isEmpty
            ? Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.battery_unknown, color: Colors.grey, size: 20),
                  const SizedBox(width: 8),
                  Text(
                    'No battery assigned',
                    style: TextStyle(color: Colors.grey[600]),
                  ),
                ],
              )
            : Row(
                mainAxisSize: MainAxisSize.min,
                children: _driverBatteries.map((battery) {
                  final soc = battery['soc'] ?? 0;
                  final id = battery['id'] ?? 'Unknown';
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          _getBatteryIcon(soc),
                          color: _getBatteryColor(soc),
                          size: 22,
                        ),
                        const SizedBox(width: 6),
                        Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              id,
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 12,
                              ),
                            ),
                            Text(
                              '$soc%',
                              style: TextStyle(
                                color: _getBatteryColor(soc),
                                fontWeight: FontWeight.bold,
                                fontSize: 11,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  );
                }).toList(),
              ),
      ),
    );
  }

  Color _getBatteryColor(int soc) {
    if (soc >= 80) return Colors.green;
    if (soc >= 50) return Colors.orange;
    if (soc >= 20) return Colors.deepOrange;
    return Colors.red;
  }

  IconData _getBatteryIcon(int soc) {
    if (soc >= 90) return Icons.battery_full;
    if (soc >= 70) return Icons.battery_5_bar;
    if (soc >= 50) return Icons.battery_4_bar;
    if (soc >= 30) return Icons.battery_3_bar;
    if (soc >= 15) return Icons.battery_2_bar;
    return Icons.battery_1_bar;
  }
}
