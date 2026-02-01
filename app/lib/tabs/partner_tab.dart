import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_service.dart';
import '../utils/app_colors.dart';
import '../widgets/notifications_widget.dart';
import '../widgets/inventory_status_widget.dart';


class PartnerTab extends StatefulWidget {
  const PartnerTab({super.key});

  @override
  State<PartnerTab> createState() => _PartnerTabState();
}

class _PartnerTabState extends State<PartnerTab> {
  final ApiService _apiService = ApiService();

  // Auth state
  bool _isLoggedIn = false;
  String? _partnerId;
  String? _partnerName;

  // Loading states
  bool _isLoading = false;
  bool _isLoggingIn = false;

  // Dashboard data
  Map<String, dynamic>? _partnerData;
  List<dynamic> _batteries = [];
  Map<String, dynamic>? _batteryStats;
  List<dynamic> _pendingTasks = [];

  // View state
  int _currentView = 0; // 0 = Dashboard, 1 = Batteries, 2 = Tasks

  // Controllers
  final TextEditingController _usernameController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _checkSavedSession();
  }

  Future<void> _checkSavedSession() async {
    final prefs = await SharedPreferences.getInstance();
    final savedPartnerId = prefs.getString('partner_id');
    final savedPartnerName = prefs.getString('partner_name');

    if (savedPartnerId != null) {
      setState(() {
        _isLoggedIn = true;
        _partnerId = savedPartnerId;
        _partnerName = savedPartnerName ?? savedPartnerId;
      });

      // Fetch fresh partner data
      final partnerData = await _apiService.getPartnerById(savedPartnerId);
      if (partnerData != null) {
        setState(() {
          _partnerData = partnerData;
          _partnerName = partnerData['name'] ?? savedPartnerId;
        });
        _loadDashboardData();
      } else {
        // Partner no longer valid, clear session
        _clearSession();
      }
    }
  }

  Future<void> _saveSession(String partnerId, String partnerName) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('partner_id', partnerId);
    await prefs.setString('partner_name', partnerName);
  }

  Future<void> _clearSession() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('partner_id');
    await prefs.remove('partner_name');
    setState(() {
      _isLoggedIn = false;
      _partnerId = null;
      _partnerName = null;
      _partnerData = null;
      _batteries = [];
      _batteryStats = null;
    });
  }

  @override
  void dispose() {
    _usernameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (_usernameController.text.isEmpty) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Please enter Partner ID')));
      return;
    }

    setState(() => _isLoggingIn = true);

    // For demo purposes, we'll use the partner ID directly
    // In production, this would use actual JWT auth
    final partnerId = _usernameController.text.trim();

    // Fetch partner data to validate
    final partnerData = await _apiService.getPartnerById(partnerId);

    setState(() => _isLoggingIn = false);

    if (partnerData != null) {
      final name = partnerData['name'] ?? partnerId;
      await _saveSession(partnerId, name);
      setState(() {
        _isLoggedIn = true;
        _partnerId = partnerId;
        _partnerName = name;
        _partnerData = partnerData;
      });
      _loadDashboardData();
    } else {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Invalid Partner ID')));
    }
  }

  void _logout() {
    _clearSession();
    _usernameController.clear();
    _passwordController.clear();
    _apiService.logout();
  }

  Future<void> _loadDashboardData() async {
    setState(() => _isLoading = true);

    // Load batteries at this partner station using the new endpoint
    final batteryData = await _apiService.getPartnerBatteries(_partnerId!);

    // Load pending tasks (incoming transfers to this partner)
    await _loadPendingTasks();

    setState(() {
      _batteries = batteryData['batteries'] ?? [];
      _batteryStats = batteryData['summary'];
      _isLoading = false;
    });
  }

  Future<void> _loadPendingTasks() async {
    try {
      final tasks = await _apiService.getTransferTasks();

      print('Loaded ${tasks.length} tasks from API');
      print('Current partner ID: $_partnerId');

      // Filter for tasks where THIS partner is either TARGET or SOURCE
      final relevantTasks = tasks.where((task) {
        // Convert both to string for comparison to avoid type issues
        final taskTargetId = task['target_id']?.toString();
        final taskSourceId = task['source_id']?.toString();
        final currentPartnerId = _partnerId?.toString();
        
        final isTarget = taskTargetId == currentPartnerId;
        final isSource = taskSourceId == currentPartnerId;
        final isActive =
            task['status'] != 'COMPLETED' && task['status'] != 'CANCELLED';

        if (isTarget || isSource) {
          print(
            'MATCH - Task ${task['id']}: source=$taskSourceId, target=$taskTargetId, status=${task['status']}',
          );
        }

        return (isTarget || isSource) && isActive;
      }).toList();

      print(
        'Filtered to ${relevantTasks.length} relevant tasks for partner $_partnerId',
      );

      setState(() {
        _pendingTasks = relevantTasks;
      });
    } catch (e) {
      print('Error loading pending tasks: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_isLoggedIn) {
      return _buildLoginScreen();
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text(_partnerName ?? 'Partner Dashboard'),
        backgroundColor: AppColors.primaryBlue,
        foregroundColor: Colors.white,
        actions: [
          NotificationBellIcon(
            recipientType: 'PARTNER',
            recipientId: _partnerId ?? '',
            iconColor: Colors.white,
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadDashboardData,
          ),
          IconButton(icon: const Icon(Icons.logout), onPressed: _logout),
        ],
      ),
      body: Column(
        children: [
          // Tab selector
          Container(
            color: Colors.white,
            child: Row(
              children: [
                Expanded(
                  child: _buildTabButton('Dashboard', Icons.dashboard, 0),
                ),
                Expanded(
                  child: _buildTabButton(
                    'Batteries',
                    Icons.battery_charging_full,
                    1,
                  ),
                ),
                Expanded(
                  child: Stack(
                    children: [
                      _buildTabButton('Tasks', Icons.assignment, 2),
                      if (_pendingTasks.isNotEmpty)
                        Positioned(
                          right: 8,
                          top: 8,
                          child: Container(
                            padding: const EdgeInsets.all(6),
                            decoration: const BoxDecoration(
                              color: Colors.red,
                              shape: BoxShape.circle,
                            ),
                            child: Text(
                              '${_pendingTasks.length}',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // Content
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _currentView == 0
                ? _buildDashboardView()
                : _currentView == 1
                ? _buildBatteriesView()
                : _buildTasksView(),
          ),
        ],
      ),
    );
  }

  Widget _buildTabButton(String label, IconData icon, int index) {
    final isSelected = _currentView == index;
    return InkWell(
      onTap: () => setState(() => _currentView = index),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(
              color: isSelected ? AppColors.primaryBlue : Colors.transparent,
              width: 3,
            ),
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              color: isSelected ? AppColors.primaryBlue : Colors.grey,
              size: 20,
            ),
            const SizedBox(width: 8),
            Text(
              label,
              style: TextStyle(
                color: isSelected ? AppColors.primaryBlue : Colors.grey,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLoginScreen() {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Logo
                Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: AppColors.primaryBlue.withOpacity(0.1),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    Icons.ev_station,
                    size: 64,
                    color: AppColors.primaryBlue,
                  ),
                ),
                const SizedBox(height: 32),

                // Title
                const Text(
                  'Partner Login',
                  style: TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                    color: AppColors.textDark,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Sign in to manage your station',
                  style: TextStyle(fontSize: 16, color: Colors.grey[600]),
                ),
                const SizedBox(height: 48),

                // Partner ID field
                TextField(
                  controller: _usernameController,
                  decoration: InputDecoration(
                    labelText: 'Partner ID',
                    hintText: 'Enter your station ID',
                    prefixIcon: const Icon(Icons.store),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    filled: true,
                    fillColor: Colors.white,
                  ),
                ),
                const SizedBox(height: 16),

                // Password field (optional for demo)
                TextField(
                  controller: _passwordController,
                  obscureText: true,
                  decoration: InputDecoration(
                    labelText: 'Password',
                    hintText: 'Enter password (optional)',
                    prefixIcon: const Icon(Icons.lock),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    filled: true,
                    fillColor: Colors.white,
                  ),
                ),
                const SizedBox(height: 32),

                // Login button
                SizedBox(
                  width: double.infinity,
                  height: 56,
                  child: ElevatedButton(
                    onPressed: _isLoggingIn ? null : _login,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primaryBlue,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: _isLoggingIn
                        ? const SizedBox(
                            width: 24,
                            height: 24,
                            child: CircularProgressIndicator(
                              color: Colors.white,
                              strokeWidth: 2,
                            ),
                          )
                        : const Text(
                            'Sign In',
                            style: TextStyle(fontSize: 18, color: Colors.white),
                          ),
                  ),
                ),
                const SizedBox(height: 24),

                // Demo hint
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.amber.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.amber.withOpacity(0.3)),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.info_outline, color: Colors.amber[700]),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          'Demo: Enter any valid Partner ID from the system',
                          style: TextStyle(
                            color: Colors.amber[800],
                            fontSize: 13,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildDashboardView() {
    final isActive =
        _partnerData?['is_active_dsk'] ?? _partnerData?['isActive'] ?? false;

    return RefreshIndicator(
      onRefresh: _loadDashboardData,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Station Status Card
          Card(
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: isActive
                              ? Colors.green.withOpacity(0.1)
                              : Colors.red.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Icon(
                          Icons.ev_station,
                          color: isActive ? Colors.green : Colors.red,
                          size: 32,
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _partnerName ?? 'Station',
                              style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Row(
                              children: [
                                Container(
                                  width: 8,
                                  height: 8,
                                  decoration: BoxDecoration(
                                    color: isActive ? Colors.green : Colors.red,
                                    shape: BoxShape.circle,
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Text(
                                  isActive ? 'Online' : 'Offline',
                                  style: TextStyle(
                                    color: isActive ? Colors.green : Colors.red,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),



          // Stats Cards
          Row(
            children: [
              Expanded(
                child: _buildStatCard(
                  'Total Batteries',
                  '${_batteries.length}',
                  Icons.battery_full,
                  Colors.blue,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _buildStatCard(
                  'Available',
                  '${_batteries.where((b) => b['soc'] != null && (b['soc'] as num) > 80).length}',
                  Icons.battery_charging_full,
                  Colors.green,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _buildStatCard(
                  'Charging',
                  '${_batteries.where((b) => b['soc'] != null && (b['soc'] as num) <= 80 && (b['soc'] as num) > 20).length}',
                  Icons.battery_4_bar,
                  Colors.orange,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _buildStatCard(
                  'Low Battery',
                  '${_batteries.where((b) => b['soc'] != null && (b['soc'] as num) <= 20).length}',
                  Icons.battery_alert,
                  Colors.red,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Auto Inventory Status Widget (uses same battery data as dashboard)
          InventoryStatusWidget(
            batteries: _batteries,
            avgDailySwaps: _partnerData?['avg_daily_swaps'] ?? 0,
          ),
          const SizedBox(height: 24),

          // Recent Activity
          const Text(
            'Recent Batteries',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 12),

          if (_batteries.isEmpty)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  children: [
                    Icon(
                      Icons.battery_unknown,
                      size: 48,
                      color: Colors.grey[400],
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'No batteries at this station',
                      style: TextStyle(color: Colors.grey[600]),
                    ),
                  ],
                ),
              ),
            )
          else
            ...(_batteries
                .take(5)
                .map((battery) => _buildBatteryListItem(battery))),

          if (_batteries.length > 5)
            TextButton(
              onPressed: () => setState(() => _currentView = 1),
              child: Text('View all ${_batteries.length} batteries →'),
            ),
        ],
      ),
    );
  }

  Widget _buildStatCard(
    String label,
    String value,
    IconData icon,
    Color color,
  ) {
    return Card(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color, size: 28),
            const SizedBox(height: 12),
            Text(
              value,
              style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: TextStyle(color: Colors.grey[600], fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSwapStatItem(
    String label,
    String value,
    IconData icon,
    Color color,
  ) {
    return Column(
      children: [
        Icon(icon, color: color, size: 24),
        const SizedBox(height: 4),
        Text(
          value,
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
        ),
        Text(
          label,
          style: TextStyle(color: Colors.grey.shade600, fontSize: 11),
        ),
      ],
    );
  }

  Color _getBusyScoreColor(double score) {
    if (score >= 70) return Colors.red;
    if (score >= 40) return Colors.orange;
    return Colors.green;
  }

  String _formatLastSwap(String dateStr) {
    try {
      final date = DateTime.parse(dateStr);
      final now = DateTime.now();
      final diff = now.difference(date);

      if (diff.inMinutes < 60) {
        return '${diff.inMinutes}m ago';
      } else if (diff.inHours < 24) {
        return '${diff.inHours}h ago';
      } else {
        return '${diff.inDays}d ago';
      }
    } catch (e) {
      return dateStr;
    }
  }

  Widget _buildBatteriesView() {
    if (_batteries.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.battery_unknown, size: 64, color: Colors.grey[400]),
            const SizedBox(height: 16),
            Text(
              'No batteries found',
              style: TextStyle(fontSize: 18, color: Colors.grey[600]),
            ),
            const SizedBox(height: 8),
            Text(
              'Batteries assigned to this station will appear here',
              style: TextStyle(color: Colors.grey[500]),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadDashboardData,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _batteries.length,
        itemBuilder: (context, index) {
          final battery = _batteries[index];
          return _buildBatteryListItem(battery, showDetails: true);
        },
      ),
    );
  }

  Widget _buildBatteryListItem(dynamic battery, {bool showDetails = false}) {
    final batteryId =
        battery['id'] ??
        battery['battery_id'] ??
        battery['batteryId'] ??
        'Unknown';
    final soc = battery['soc'] as num? ?? 0;
    final isMisplaced =
        battery['is_misplaced'] ?? battery['isMisplaced'] ?? false;

    Color statusColor;
    IconData statusIcon;
    String statusText;

    if (soc > 80) {
      statusColor = Colors.green;
      statusIcon = Icons.battery_full;
      statusText = 'Ready';
    } else if (soc > 20) {
      statusColor = Colors.orange;
      statusIcon = Icons.battery_4_bar;
      statusText = 'Charging';
    } else {
      statusColor = Colors.red;
      statusIcon = Icons.battery_alert;
      statusText = 'Low';
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: InkWell(
        onTap: () => _showBatteryDetails(battery),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: statusColor.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(statusIcon, color: statusColor, size: 24),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text(
                              batteryId.toString(),
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 16,
                              ),
                            ),
                            if (isMisplaced) ...[
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 6,
                                  vertical: 2,
                                ),
                                decoration: BoxDecoration(
                                  color: Colors.red.withOpacity(0.1),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: const Text(
                                  'Misplaced',
                                  style: TextStyle(
                                    color: Colors.red,
                                    fontSize: 10,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                            ],
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          statusText,
                          style: TextStyle(color: statusColor, fontSize: 13),
                        ),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        '${soc.toInt()}%',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: statusColor,
                        ),
                      ),
                      Text(
                        'SOC',
                        style: TextStyle(color: Colors.grey[500], fontSize: 12),
                      ),
                    ],
                  ),
                ],
              ),
              if (showDetails) ...[
                const SizedBox(height: 12),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: soc / 100,
                    backgroundColor: Colors.grey[200],
                    color: statusColor,
                    minHeight: 6,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  void _showBatteryDetails(dynamic battery) {
    final batteryId =
        battery['id'] ??
        battery['battery_id'] ??
        battery['batteryId'] ??
        'Unknown';
    final soc = battery['soc'] as num? ?? 0;
    final voltage = battery['voltage'] as num? ?? 0;
    final temperature = battery['temperature'] as num? ?? 0;
    final cycles = battery['cycles'] as num? ?? 0;
    final lastUpdated = battery['updated_at'] ?? battery['createdAt'] ?? '';

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => Container(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  Icons.battery_charging_full,
                  color: AppColors.primaryBlue,
                  size: 32,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Battery $batteryId',
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text(
                        'Last updated: $lastUpdated',
                        style: TextStyle(color: Colors.grey[600], fontSize: 12),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),

            // Battery stats grid
            Center(
              child: SizedBox(
                width: 200,
                child: _buildDetailItem(
                  'SOC',
                  '${soc.toInt()}%',
                  Icons.battery_full,
                ),
              ),
            ),
            const SizedBox(height: 24),

            // View History button
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () {
                  Navigator.pop(context);
                  _showBatteryHistory(batteryId.toString());
                },
                icon: const Icon(Icons.history),
                label: const Text('View History'),
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  side: const BorderSide(color: AppColors.primaryBlue),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () => _triggerFault(batteryId.toString()),
                icon: const Icon(
                  Icons.warning_amber_rounded,
                  color: Colors.white,
                ),
                label: const Text('Trigger Fault'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDetailItem(String label, String value, IconData icon) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.grey[100],
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(icon, color: Colors.grey[600], size: 20),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: TextStyle(color: Colors.grey[600], fontSize: 12),
              ),
              Text(
                value,
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _triggerFault(String batteryId) async {
    // Confirm dialog
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Trigger Battery Fault?'),
        content: Text(
          'This will mark battery $batteryId as faulty and request immediate replacement from the nearest warehouse.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text(
              'Trigger Fault',
              style: TextStyle(color: Colors.white),
            ),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    if (!mounted) return;
    Navigator.pop(context); // Close details modal

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => const Center(child: CircularProgressIndicator()),
    );

    final result = await _apiService.triggerBatteryFault(batteryId);

    if (!mounted) return;
    Navigator.pop(context); // Close loading

    if (result['success'] == true) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Fault triggered! Replacement requested from ${result['source'] ?? 'Warehouse'}.',
          ),
          backgroundColor: Colors.green,
        ),
      );
      _loadDashboardData(); // Reload to show new tasks
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed: ${result['error']}'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  void _showBatteryHistory(String batteryId) async {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => const Center(child: CircularProgressIndicator()),
    );

    final history = await _apiService.getBatteryHistory(batteryId);

    Navigator.pop(context); // Close loading dialog

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.7,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        expand: false,
        builder: (context, scrollController) => Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  const Icon(Icons.history, color: AppColors.primaryBlue),
                  const SizedBox(width: 12),
                  Text(
                    'Battery $batteryId History',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const Spacer(),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            Expanded(
              child: history.isEmpty
                  ? Center(
                      child: Text(
                        'No history found',
                        style: TextStyle(color: Colors.grey[600]),
                      ),
                    )
                  : ListView.builder(
                      controller: scrollController,
                      padding: const EdgeInsets.all(16),
                      itemCount: history.length,
                      itemBuilder: (context, index) {
                        final item = history[index];
                        return _buildHistoryItem(item);
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHistoryItem(Map<String, dynamic> item) {
    final occupant = item['occupant'] ?? 'Unknown';
    final soc = item['soc'] as num? ?? 0;
    final timestamp = item['created_at'] ?? item['createdAt'] ?? '';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.grey[50],
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey[200]!),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppColors.primaryBlue.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(
              Icons.swap_horiz,
              color: AppColors.primaryBlue,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  occupant.toString(),
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                Text(
                  timestamp.toString(),
                  style: TextStyle(color: Colors.grey[600], fontSize: 12),
                ),
              ],
            ),
          ),
          Text(
            '${soc.toInt()}%',
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
          ),
        ],
      ),
    );
  }

  Widget _buildTasksView() {
    if (_pendingTasks.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.check_circle_outline, size: 80, color: Colors.grey[300]),
            const SizedBox(height: 16),
            const Text(
              'No Pending Tasks',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              'All transfers are complete',
              style: TextStyle(color: Colors.grey[600]),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadPendingTasks,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _pendingTasks.length,
        itemBuilder: (context, index) => _buildTaskCard(_pendingTasks[index]),
      ),
    );
  }

  Widget _buildTaskCard(Map<String, dynamic> task) {
    final taskId = task['id']?.toString() ?? '';
    
    // Skip rendering if taskId is empty
    if (taskId.isEmpty) {
      print('Warning: Invalid taskId in task: $task');
      return const SizedBox.shrink();
    }
    
    // Get a short display version of the ID (first 8 chars for UUID)
    final shortId = taskId.length > 8 ? taskId.substring(0, 8) : taskId;
    
    final sourceType = task['source_type'] ?? '';
    final sourceId = task['source_id'] ?? '';
    final targetType = task['target_type'] ?? '';
    final targetId = task['target_id'] ?? '';
    final amount = task['amount'] ?? 0;
    final status = task['status'] ?? 'PENDING';
    final distanceValue = task['distance_km'];
    final distance = distanceValue is num
        ? distanceValue.toStringAsFixed(1)
        : (distanceValue?.toString() ?? '0.0');

    // Determine if this is incoming or outgoing
    final isIncoming = targetId.toString() == _partnerId;
    final isOutgoing = sourceId.toString() == _partnerId;

    Color statusColor;
    IconData statusIcon;
    String statusText;

    switch (status) {
      case 'ASSIGNED':
      case 'PENDING':
        statusColor = Colors.orange;
        statusIcon = Icons.pending;
        statusText = isOutgoing ? 'Approval Needed' : 'Waiting Approval';
        break;
      case 'IN_PROGRESS':
        statusColor = Colors.blue;
        statusIcon = Icons.local_shipping;
        statusText = isIncoming ? 'Incoming' : 'In Transit';
        break;
      default:
        statusColor = Colors.grey;
        statusIcon = Icons.info;
        statusText = status;
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 2,
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
                    color: statusColor.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(statusIcon, color: statusColor, size: 24),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Tooltip(
                            message: taskId,
                            child: Text(
                              'Transfer #$shortId...',
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 16,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 6,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: isIncoming ? Colors.green : Colors.purple,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              isIncoming ? '📥 IN' : '📤 OUT',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        statusText,
                        style: TextStyle(
                          color: statusColor,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.grey[50],
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                children: [
                  _buildInfoRow(
                    Icons.battery_charging_full,
                    'Quantity',
                    '$amount batteries',
                  ),
                  const SizedBox(height: 8),
                  _buildInfoRow(
                    sourceType == 'WAREHOUSE' ? Icons.warehouse : Icons.store,
                    'From',
                    "${sourceType == 'WAREHOUSE' ? 'Warehouse' : 'Partner'} $sourceId",
                  ),
                  const SizedBox(height: 8),
                  _buildInfoRow(
                    targetType == 'WAREHOUSE' ? Icons.warehouse : Icons.store,
                    'To',
                    "${targetType == 'WAREHOUSE' ? 'Warehouse' : 'Partner'} $targetId",
                  ),
                  const SizedBox(height: 8),
                  _buildInfoRow(Icons.route, 'Distance', '$distance km'),
                ],
              ),
            ),
            if (status == 'IN_PROGRESS' && isIncoming) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.blue.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.blue.withOpacity(0.3)),
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
                        'Batteries are on the way! Estimated arrival: 30-60 mins',
                        style: TextStyle(color: Colors.blue[700], fontSize: 13),
                      ),
                    ),
                  ],
                ),
              ),
            ],

            // Simplified Action buttons - Only Done or Cancel
            if (status != 'COMPLETED' && status != 'CANCELLED') ...[
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _cancelTask(taskId, task),
                      icon: const Icon(Icons.cancel, size: 18),
                      label: const Text('Cancel'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.red,
                        side: const BorderSide(color: Colors.red),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton.icon(
                      onPressed: () => _markAsDone(taskId, task),
                      icon: const Icon(Icons.check_circle, size: 18),
                      label: const Text('Mark as Done'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.green,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                ],
              ),
            ] else if (status == 'COMPLETED') ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.green.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.green.withOpacity(0.3)),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.check_circle,
                      color: Colors.green,
                      size: 20,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        '✅ Task completed successfully',
                        style: TextStyle(
                          color: Colors.green[700],
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _markAsDone(String taskId, Map<String, dynamic> task) async {
    final isOutgoing = task['source_id']?.toString() == _partnerId;
    final otherParty = isOutgoing ? task['target_id'] : task['source_id'];

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Mark Task as Done?'),
        content: Text(
          'Confirm that the battery transfer of ${task['amount']} batteries ${isOutgoing ? 'to' : 'from'} $otherParty is complete?\\n\\nThis will notify the other party.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Not Yet'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.green),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Mark as Done'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    final result = await _apiService.completeTransfer(taskId);

    if (result['success'] == true) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              '✅ Task marked as done! Notification sent to the other party.',
            ),
            backgroundColor: Colors.green,
          ),
        );
        await _loadPendingTasks();
      }
    } else {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(result['error'] ?? 'Failed to complete task'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _cancelTask(String taskId, Map<String, dynamic> task) async {
    final reasonController = TextEditingController();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel Task?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Cancel the battery transfer of ${task['amount']} batteries?'),
            const SizedBox(height: 16),
            TextField(
              controller: reasonController,
              decoration: const InputDecoration(
                labelText: 'Reason (optional)',
                border: OutlineInputBorder(),
              ),
              maxLines: 2,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Back'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Cancel Task'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    final result = await _apiService.rejectTransfer(
      taskId,
      _partnerId!,
      reasonController.text.isEmpty
          ? 'Task cancelled by user'
          : reasonController.text,
    );

    if (result['success'] == true) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Task cancelled. Notification sent to the other party.',
            ),
            backgroundColor: Colors.orange,
          ),
        );
        await _loadPendingTasks();
      }
    } else {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(result['error'] ?? 'Failed to cancel task'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Widget _buildInfoRow(IconData icon, String label, String value) {
    return Row(
      children: [
        Icon(icon, size: 16, color: Colors.grey[600]),
        const SizedBox(width: 8),
        Text(
          '$label:',
          style: TextStyle(color: Colors.grey[600], fontSize: 13),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            value,
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
          ),
        ),
      ],
    );
  }
}
