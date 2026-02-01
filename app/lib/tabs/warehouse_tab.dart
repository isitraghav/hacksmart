import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_service.dart';
import '../utils/app_colors.dart';
import '../widgets/notifications_widget.dart';

class WarehouseTab extends StatefulWidget {
  const WarehouseTab({super.key});

  @override
  State<WarehouseTab> createState() => _WarehouseTabState();
}

class _WarehouseTabState extends State<WarehouseTab> with SingleTickerProviderStateMixin {
  final ApiService _apiService = ApiService();
  late TabController _tabController;
  
  // Auth state
  bool _isLoggedIn = false;
  String? _warehouseId;
  String? _warehouseName;
  Map<String, dynamic>? _warehouseData;
  
  // Data
  List<dynamic> _pendingTasks = [];
  List<dynamic> _acceptedTasks = [];
  List<dynamic> _allTasks = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _checkSavedSession();
  }

  Future<void> _checkSavedSession() async {
    final prefs = await SharedPreferences.getInstance();
    final savedWarehouseId = prefs.getString('warehouse_id');
    final savedWarehouseName = prefs.getString('warehouse_name');
    
    if (savedWarehouseId != null) {
      setState(() {
        _isLoggedIn = true;
        _warehouseId = savedWarehouseId;
        _warehouseName = savedWarehouseName ?? 'Warehouse';
      });
      _loadData();
    } else {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _saveSession(String warehouseId, String warehouseName) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('warehouse_id', warehouseId);
    await prefs.setString('warehouse_name', warehouseName);
  }

  Future<void> _clearSession() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('warehouse_id');
    await prefs.remove('warehouse_name');
    setState(() {
      _isLoggedIn = false;
      _warehouseId = null;
      _warehouseName = null;
      _warehouseData = null;
      _pendingTasks = [];
      _acceptedTasks = [];
      _allTasks = [];
    });
  }

  Future<void> _loginWithWarehouse(Map<String, dynamic> warehouse) async {
    final warehouseId = warehouse['id']?.toString() ?? '';
    final warehouseName = warehouse['name'] ?? 'Warehouse $warehouseId';
    
    await _saveSession(warehouseId, warehouseName);
    
    setState(() {
      _isLoggedIn = true;
      _warehouseId = warehouseId;
      _warehouseName = warehouseName;
      _warehouseData = warehouse;
    });
    
    _loadData();
  }

  Future<void> _loadData() async {
    if (!_isLoggedIn) return;
    
    setState(() => _isLoading = true);
    
    try {
      // Load warehouse data
      final warehouse = await _apiService.getWarehouseById(_warehouseId!);
      
      final tasks = await _apiService.getTransferTasks();
      
      // Helper to check if an ID matches this warehouse (checking both ID and Name)
      bool isMe(String? id) {
        if (id == null) return false;
        return id == _warehouseId || id == _warehouseName;
      }
      
      // Filter tasks relevant to this warehouse
      final warehouseTasks = tasks.where((t) {
        final sourceId = t['source_id']?.toString() ?? '';
        final targetId = t['target_id']?.toString() ?? '';
        final sourceType = t['source_type']?.toString().toUpperCase() ?? '';
        
        // Include if this warehouse is the source (for WAREHOUSE type)
        if (sourceType == 'WAREHOUSE' && isMe(sourceId)) return true;
        
        // Include if this warehouse is the target
        if (isMe(targetId)) return true;
        
        // Include if source matches (regardless of type)
        if (isMe(sourceId)) return true;
        
        return false;
      }).toList();

      // Pending tasks: Show tasks where we are Source (to approve) OR Target (to receive)
      final pending = warehouseTasks.where((t) {
        final status = t['status']?.toString().toLowerCase() ?? '';
        final sourceId = t['source_id']?.toString() ?? '';
        final targetId = t['target_id']?.toString() ?? '';
        final sourceType = t['source_type']?.toString().toUpperCase() ?? '';
        
        // Exclude completed/cancelled tasks
        if (status == 'completed' || status == 'cancelled') return false;
        
        final isPending = status == 'pending' || status == 'approval_required' || status == 'pending_sender_approval';
        
        // For pending tasks: we are the source (need to approve) OR target (waiting to receive)
        final isSource = (sourceType == 'WAREHOUSE' && isMe(sourceId)) || isMe(sourceId);
        final isTarget = isMe(targetId);
        
        return isPending && (isSource || isTarget);
      }).toList();
      
      // Accepted/Delivery tasks: Show active transfer involving us
      final accepted = warehouseTasks.where((t) {
        final status = t['status']?.toString().toLowerCase() ?? '';
        final sourceId = t['source_id']?.toString() ?? '';
        final targetId = t['target_id']?.toString() ?? '';
        final sourceType = t['source_type']?.toString().toUpperCase() ?? '';
        
        // Exclude completed/cancelled tasks
        if (status == 'completed' || status == 'cancelled') return false;
        
        final isInProgress = status == 'approved' || status == 'assigned' || status == 'in_progress';
        final isSource = (sourceType == 'WAREHOUSE' && isMe(sourceId)) || isMe(sourceId);
        final isTarget = isMe(targetId);
        
        return isInProgress && (isSource || isTarget);
      }).toList();
      
      if (mounted) {
        setState(() {
          if (warehouse != null) {
            _warehouseData = warehouse;
          }
          _allTasks = warehouseTasks;
          _pendingTasks = pending;
          _acceptedTasks = accepted;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error loading data: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  Future<void> _approveTask(String taskId) async {
    try {
      await _apiService.approveTransfer(taskId, _warehouseName ?? 'Warehouse', 'Approved by warehouse');
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Task approved and ready for delivery'), backgroundColor: Colors.green),
      );
      _loadData();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
      );
    }
  }

  Future<void> _rejectTask(String taskId, String reason) async {
    try {
      await _apiService.rejectTransfer(taskId, _warehouseName ?? 'Warehouse', reason);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Task rejected'), backgroundColor: Colors.orange),
      );
      _loadData();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
      );
    }
  }

  Future<void> _markDelivered(String taskId) async {
    try {
      await _apiService.completeTransfer(taskId);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Delivery completed!'), backgroundColor: Colors.green),
      );
      _loadData();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
      );
    }
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_isLoggedIn) {
      return _buildLoginScreen();
    }
    
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text(_warehouseName ?? 'Warehouse Operations'),
        backgroundColor: AppColors.primaryBlue,
        foregroundColor: Colors.white,
        actions: [
          if (_pendingTasks.isNotEmpty)
            Badge(
              label: Text('${_pendingTasks.length}'),
              child: IconButton(
                icon: const Icon(Icons.pending_actions),
                onPressed: () => _tabController.animateTo(0),
                tooltip: 'Pending Tasks',
              ),
            ),
          NotificationBellIcon(
            recipientType: 'WAREHOUSE',
            recipientId: _warehouseId ?? '',
            iconColor: Colors.white,
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadData,
          ),
          PopupMenuButton<String>(
            onSelected: (value) {
              if (value == 'logout') {
                _clearSession();
              }
            },
            itemBuilder: (context) => [
              PopupMenuItem(
                value: 'logout',
                child: Row(
                  children: [
                    Icon(Icons.logout, color: Colors.grey.shade700),
                    const SizedBox(width: 8),
                    const Text('Logout'),
                  ],
                ),
              ),
            ],
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white70,
          indicatorColor: AppColors.accentGreen,
          tabs: [
            Tab(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('Pending'),
                  if (_pendingTasks.isNotEmpty) ...[
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.orange,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        '${_pendingTasks.length}',
                        style: const TextStyle(fontSize: 11, color: Colors.white),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            Tab(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('Deliveries'),
                  if (_acceptedTasks.isNotEmpty) ...[
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.green,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        '${_acceptedTasks.length}',
                        style: const TextStyle(fontSize: 11, color: Colors.white),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const Tab(text: 'Inventory'),
          ],
        ),
      ),
      body: _isLoading
        ? const Center(child: CircularProgressIndicator())
        : TabBarView(
          controller: _tabController,
          children: [
            _buildPendingTasksView(),
            _buildDeliveryTasksView(),
            _buildInventoryView(),
          ],
        ),
    );
  }

  // Search controller
  final TextEditingController _searchController = TextEditingController();
  List<dynamic> _filteredWarehouses = [];
  bool _isInit = true;

  Widget _buildLoginScreen() {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: FutureBuilder<List<dynamic>>(
          future: _apiService.getWarehouses(),
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            
            final warehouses = snapshot.data ?? [];
            
            // Initialize filtered list on first load
            if (_isInit && warehouses.isNotEmpty) {
              _filteredWarehouses = warehouses;
              _isInit = false;
            } else if (_searchController.text.isEmpty) {
              _filteredWarehouses = warehouses;
            }

            return Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                   const Center(
                     child: Text(
                      'Warehouse Operations',
                      style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
                                       ),
                   ),
                  const SizedBox(height: 8),
                  Center(
                    child: Text(
                      'Select your warehouse to continue',
                      style: TextStyle(fontSize: 16, color: Colors.grey.shade600),
                    ),
                  ),
                  const SizedBox(height: 24),

                  // Search Bar
                  TextField(
                    controller: _searchController,
                    decoration: InputDecoration(
                      hintText: 'Search warehouse...',
                      prefixIcon: const Icon(Icons.search),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      filled: true,
                      fillColor: Colors.white,
                      contentPadding: const EdgeInsets.symmetric(vertical: 0, horizontal: 16),
                    ),
                    onChanged: (value) {
                      setState(() {
                         final query = value.toLowerCase();
                         _filteredWarehouses = warehouses.where((w) {
                           final name = w['name']?.toString().toLowerCase() ?? '';
                           final id = w['id']?.toString().toLowerCase() ?? '';
                           return name.contains(query) || id.contains(query);
                         }).toList();
                      });
                    },
                  ),
                  const SizedBox(height: 12),
                  
                  // Count
                  Text(
                    'Showing ${_filteredWarehouses.length} of ${warehouses.length} warehouses',
                   style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
                  ),
                  const SizedBox(height: 12),

                  Expanded(
                    child: _filteredWarehouses.isEmpty
                      ? Center(
                          child: Column(
                             mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.search_off, size: 48, color: Colors.grey.shade400),
                              const SizedBox(height: 16),
                              const Text('No warehouses found'),
                            ],
                          ),
                        )
                      : ListView.builder(
                          itemCount: _filteredWarehouses.length,
                          itemBuilder: (context, index) {
                            final warehouse = _filteredWarehouses[index];
                            final id = warehouse['id']?.toString() ?? '';
                            final name = warehouse['name'] ?? 'Warehouse $id';
                            final charged = warehouse['charged_batteries'] ?? 0;
                            final uncharged = warehouse['uncharged_batteries'] ?? 0;

                            return Card(
                              margin: const EdgeInsets.only(bottom: 12),
                              elevation: 2,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              child: InkWell(
                                onTap: () => _loginWithWarehouse(warehouse),
                                borderRadius: BorderRadius.circular(12),
                                child: Padding(
                                  padding: const EdgeInsets.all(16),
                                  child: Row(
                                    children: [
                                      Container(
                                        padding: const EdgeInsets.all(12),
                                        decoration: BoxDecoration(
                                          color: AppColors.primaryBlue.withOpacity(0.1),
                                          borderRadius: BorderRadius.circular(10),
                                        ),
                                        child: Icon(Icons.warehouse, color: AppColors.primaryBlue, size: 28),
                                      ),
                                      const SizedBox(width: 16),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                                            const SizedBox(height: 4),
                                            Text('🔋 $charged charged • ⚡ $uncharged charging',
                                                style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                                          ],
                                       ),
                                      ),
                                      Icon(Icons.arrow_forward_ios, color: Colors.grey.shade400, size: 18),
                                    ],
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                  ),
                  
                  const SizedBox(height: 16),
                  Center(
                    child: Text('Demo Mode - No password required',
                        style: TextStyle(color: Colors.grey.shade500, fontSize: 12)),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildPendingTasksView() {
    if (_pendingTasks.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.check_circle_outline, size: 64, color: Colors.green.shade300),
            const SizedBox(height: 16),
            const Text('No Pending Tasks', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text('All transfer requests have been processed', style: TextStyle(color: Colors.grey.shade600)),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _pendingTasks.length,
        itemBuilder: (context, index) => _buildPendingTaskCard(_pendingTasks[index]),
      ),
    );
  }

  Widget _buildPendingTaskCard(Map<String, dynamic> task) {
    final taskId = task['id']?.toString() ?? '';
    final targetId = task['target_id'] ?? 'Unknown';
    final amount = task['amount'] ?? 0;
    final financials = task['financials'];
    String? reason;
    String? urgency;
    
    if (financials is Map) {
      reason = financials['reason'];
      urgency = financials['urgency'];
    }
    
    final isUrgent = urgency == 'CRITICAL' || urgency == 'URGENT';
    
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: isUrgent ? BorderSide(color: Colors.red.shade400, width: 2) : BorderSide.none,
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: isUrgent ? Colors.red.shade100 : Colors.orange.shade100,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(
                    isUrgent ? Icons.priority_high : Icons.pending_actions,
                    color: isUrgent ? Colors.red.shade700 : Colors.orange.shade700,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Transfer Request', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold,
                          color: isUrgent ? Colors.red.shade700 : null)),
                      Tooltip(
                        message: taskId.toString(),
                        child: Text('Task #${taskId.toString().length > 8 ? '${taskId.toString().substring(0, 8)}...' : taskId}', 
                          style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ),
                if (isUrgent)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(color: Colors.red, borderRadius: BorderRadius.circular(12)),
                    child: Text(urgency ?? 'URGENT',
                        style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: Colors.grey.shade100, borderRadius: BorderRadius.circular(10)),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      children: [
                        Icon(Icons.location_on, color: Colors.blue.shade700, size: 28),
                        const SizedBox(height: 6),
                        const Text('DELIVER TO', style: TextStyle(fontSize: 10, color: Colors.grey)),
                        const SizedBox(height: 2),
                        Text(targetId.toString(), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                      ],
                    ),
                  ),
                  Container(width: 1, height: 50, color: Colors.grey.shade300),
                  Expanded(
                    child: Column(
                      children: [
                        Icon(Icons.battery_charging_full, color: Colors.green.shade700, size: 28),
                        const SizedBox(height: 6),
                        const Text('QUANTITY', style: TextStyle(fontSize: 10, color: Colors.grey)),
                        const SizedBox(height: 2),
                        Text('$amount batteries', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            if (reason != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: Colors.blue.shade50, borderRadius: BorderRadius.circular(8)),
                child: Row(
                  children: [
                    Icon(Icons.info_outline, size: 18, color: Colors.blue.shade700),
                    const SizedBox(width: 8),
                    Expanded(child: Text(reason, style: TextStyle(fontSize: 12, color: Colors.blue.shade700))),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _showRejectDialog(taskId),
                    icon: const Icon(Icons.close, size: 18),
                    label: const Text('Reject'),
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
                    onPressed: () => _approveTask(taskId),
                    icon: const Icon(Icons.check, size: 18),
                    label: const Text('Accept & Assign'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.green,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDeliveryTasksView() {
    if (_acceptedTasks.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.local_shipping_outlined, size: 64, color: Colors.grey.shade300),
            const SizedBox(height: 16),
            const Text('No Active Deliveries', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text('Approved tasks will appear here', style: TextStyle(color: Colors.grey.shade600)),
            const SizedBox(height: 4),
            Text('Auto-approved tasks are added automatically', style: TextStyle(color: Colors.grey.shade500, fontSize: 12)),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadData,
      child: Column(
        children: [
          // Task list header
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            color: AppColors.primaryBlue.withOpacity(0.1),
            child: Row(
              children: [
                Icon(Icons.checklist, color: AppColors.primaryBlue),
                const SizedBox(width: 8),
                Text(
                  'Delivery Task List (${_acceptedTasks.length})',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: AppColors.primaryBlue,
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _acceptedTasks.length,
              itemBuilder: (context, index) => _buildDeliveryTaskCard(_acceptedTasks[index], index + 1),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDeliveryTaskCard(Map<String, dynamic> task, int taskNumber) {
    final taskId = task['id']?.toString() ?? '';
    final targetId = task['target_id'] ?? 'Unknown';
    final amount = task['amount'] ?? 0;
    final status = task['status']?.toString().toLowerCase() ?? '';
    
    // Parse financials for more details
    Map<String, dynamic> financials = {};
    try {
      if (task['financials'] != null) {
        financials = task['financials'] is String 
            ? Map<String, dynamic>.from(jsonDecode(task['financials']))
            : Map<String, dynamic>.from(task['financials']);
      }
    } catch (e) {
      // Ignore parsing errors
    }
    
    final urgency = financials['urgency'] ?? 'NORMAL';
    final reason = financials['reason'];
    final autoApproved = financials['autoApproved'] == true;
    final isUrgent = urgency == 'CRITICAL' || urgency == 'URGENT';
    
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: isUrgent ? BorderSide(color: Colors.orange.shade400, width: 2) : BorderSide.none,
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                // Task number badge
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: isUrgent ? Colors.orange : AppColors.primaryBlue,
                    shape: BoxShape.circle,
                  ),
                  child: Center(
                    child: Text(
                      '#$taskNumber',
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            'Shift $amount batteries → $targetId',
                            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          if (autoApproved) ...[
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: Colors.green.shade100,
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                'AUTO',
                                style: TextStyle(fontSize: 9, color: Colors.green.shade700, fontWeight: FontWeight.bold),
                              ),
                            ),
                            const SizedBox(width: 6),
                          ],
                          Tooltip(
                            message: taskId.toString(),
                            child: Text('Task #${taskId.toString().length > 8 ? '${taskId.toString().substring(0, 8)}...' : taskId}', 
                              style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: status == 'in_progress' ? Colors.blue : Colors.green.shade100,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    status == 'in_progress' ? 'IN TRANSIT' : 'READY',
                    style: TextStyle(
                      color: status == 'in_progress' ? Colors.white : Colors.green.shade700,
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            
            // Destination and quantity details
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.grey.shade100,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Row(
                      children: [
                        Icon(Icons.location_on, color: Colors.red.shade400, size: 20),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            'Deliver to: $targetId',
                            style: const TextStyle(fontWeight: FontWeight.w500),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Container(width: 1, height: 30, color: Colors.grey.shade300),
                  const SizedBox(width: 12),
                  Row(
                    children: [
                      Icon(Icons.battery_full, color: Colors.green.shade700, size: 20),
                      const SizedBox(width: 4),
                      Text('$amount', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                    ],
                  ),
                ],
              ),
            ),
            
            if (reason != null) ...[
              const SizedBox(height: 8),
              Text('📝 $reason', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
            ],
            
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () => _markDelivered(taskId),
                icon: const Icon(Icons.check_circle),
                label: const Text('Mark as Delivered'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primaryBlue,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInventoryView() {
    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            elevation: 2,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppColors.primaryBlue.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(Icons.warehouse, color: AppColors.primaryBlue, size: 28),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(_warehouseName ?? 'Warehouse',
                                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                            Text('ID: $_warehouseId', style: TextStyle(color: Colors.grey.shade600)),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  Row(
                    children: [
                      Expanded(child: _buildStatBox('Charged', '${_warehouseData?['charged_batteries'] ?? '-'}',
                          Icons.battery_full, Colors.green)),
                      const SizedBox(width: 12),
                      Expanded(child: _buildStatBox('Charging', '${_warehouseData?['uncharged_batteries'] ?? '-'}',
                          Icons.battery_charging_full, Colors.blue)),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(child: _buildStatBox('45W', '${_warehouseData?['batteries_45w'] ?? '-'}',
                          Icons.battery_std, Colors.purple)),
                      const SizedBox(width: 12),
                      Expanded(child: _buildStatBox('110W', '${_warehouseData?['batteries_110w'] ?? '-'}',
                          Icons.battery_std, Colors.orange)),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          const Text('Task Summary', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: _buildSummaryCard('Pending', _pendingTasks.length, Icons.pending_actions, Colors.orange)),
              const SizedBox(width: 12),
              Expanded(child: _buildSummaryCard('To Deliver', _acceptedTasks.length, Icons.local_shipping, Colors.blue)),
              const SizedBox(width: 12),
              Expanded(child: _buildSummaryCard('Total', _allTasks.length, Icons.assignment, Colors.grey)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStatBox(String label, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
      child: Row(
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: color)),
              Text(label, style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSummaryCard(String label, int count, IconData icon, Color color) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            Icon(icon, color: color, size: 28),
            const SizedBox(height: 8),
            Text('$count', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: color)),
            Text(label, style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
          ],
        ),
      ),
    );
  }

  void _showRejectDialog(String taskId) {
    final reasonController = TextEditingController();
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Reject Task'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Please provide a reason:'),
            const SizedBox(height: 12),
            TextField(
              controller: reasonController,
              maxLines: 3,
              decoration: const InputDecoration(hintText: 'Enter reason...', border: OutlineInputBorder()),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              _rejectTask(taskId, reasonController.text.isNotEmpty ? reasonController.text : 'Rejected by warehouse');
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Reject', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }
}
