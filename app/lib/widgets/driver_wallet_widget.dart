import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../utils/app_colors.dart';

/// A wallet widget showing driver's balance and pending charges
class DriverWalletWidget extends StatefulWidget {
  final String driverId;
  final VoidCallback? onRefresh;
  
  const DriverWalletWidget({
    super.key,
    required this.driverId,
    this.onRefresh,
  });
  
  @override
  State<DriverWalletWidget> createState() => _DriverWalletWidgetState();
}

class _DriverWalletWidgetState extends State<DriverWalletWidget> {
  final ApiService _apiService = ApiService();
  Map<String, dynamic>? _balance;
  bool _isLoading = true;
  
  @override
  void initState() {
    super.initState();
    _loadBalance();
  }
  
  @override
  void didUpdateWidget(DriverWalletWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.driverId != widget.driverId) {
      _loadBalance();
    }
  }
  
  Future<void> _loadBalance() async {
    if (widget.driverId.isEmpty) return;
    
    setState(() => _isLoading = true);
    
    final balance = await _apiService.getDriverBalance(widget.driverId);
    print('[DriverWallet] Balance response for ${widget.driverId}: $balance');
    
    if (mounted) {
      setState(() {
        _balance = balance['success'] == true ? balance : null;
        _isLoading = false;
      });
    }
  }
  
  void refresh() {
    _loadBalance();
  }
  
  @override
  Widget build(BuildContext context) {
    // Check if this is a full page navigation (has Scaffold ancestor)
    final isFullPage = widget.onRefresh == null;
    
    if (_isLoading) {
      return isFullPage 
        ? Scaffold(
            appBar: AppBar(
              title: const Text('My Wallet'),
              backgroundColor: AppColors.primaryBlue,
              foregroundColor: Colors.white,
            ),
            body: const Center(child: CircularProgressIndicator()),
          )
        : const Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Center(child: CircularProgressIndicator()),
            ),
          );
    }
    
    if (_balance == null) {
      return isFullPage 
        ? Scaffold(
            appBar: AppBar(
              title: const Text('My Wallet'),
              backgroundColor: AppColors.primaryBlue,
              foregroundColor: Colors.white,
            ),
            body: const Center(child: Text('Unable to load wallet data')),
          )
        : const SizedBox.shrink();
    }
    
    final pendingPenalty = (_balance!['pendingLeavePenalty'] ?? 0).toDouble();
    final pendingService = (_balance!['pendingServiceCharge'] ?? 0).toDouble();
    final totalPending = pendingPenalty + pendingService;
    final swapsNeeded = _balance!['swapsNeededToClear'] ?? 0;
    final freeLeave = _balance!['freeLeaveRemaining'] ?? 4;
    final leaveDaysUsed = _balance!['leaveDaysUsed'] ?? 0;
    final balance = (_balance!['balance'] ?? 0).toDouble();
    
    final walletContent = isFullPage 
      ? Scaffold(
          appBar: AppBar(
            title: const Text('My Wallet'),
            backgroundColor: AppColors.primaryBlue,
            foregroundColor: Colors.white,
            elevation: 0,
            actions: [
              IconButton(
                icon: const Icon(Icons.refresh),
                onPressed: _loadBalance,
              ),
            ],
          ),
          body: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildBalanceCard(balance, totalPending),
                const SizedBox(height: 16),
                if (totalPending > 0)
                  _buildPendingChargesCard(pendingPenalty, pendingService, swapsNeeded, totalPending),
                if (totalPending > 0) const SizedBox(height: 16),
                _buildLeaveStatusCard(leaveDaysUsed, freeLeave),
                const SizedBox(height: 16),
                _buildTotalSwapsCard(),
                const SizedBox(height: 16),
                _buildViewTransactionsButton(context),
              ],
            ),
          ),
        )
      : _buildWalletWidget(balance, totalPending, pendingPenalty, pendingService, swapsNeeded, freeLeave, leaveDaysUsed);
    
    return walletContent;
  }
  
  Widget _buildWalletWidget(double balance, double totalPending, double pendingPenalty, double pendingService, int swapsNeeded, int freeLeave, int leaveDaysUsed) {
    return Card(
      elevation: 4,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              AppColors.primaryBlue,
              AppColors.primaryBlue.withOpacity(0.8),
            ],
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'My Wallet',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.refresh, color: Colors.white),
                    onPressed: _loadBalance,
                  ),
                ],
              ),
              const SizedBox(height: 8),
              
              // Balance Display
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: Colors.white.withOpacity(0.3),
                    width: 2,
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Available Balance',
                      style: TextStyle(
                        color: Colors.white.withOpacity(0.9),
                        fontSize: 14,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        const Text(
                          '₹',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 32,
                            fontWeight: FontWeight.w300,
                          ),
                        ),
                        const SizedBox(width: 4),
                        Text(
                          balance.toStringAsFixed(0),
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 42,
                            fontWeight: FontWeight.bold,
                            letterSpacing: -1,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              
              // Pending Charges
              if (totalPending > 0) ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.orange.shade100,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(Icons.warning_amber, color: Colors.orange.shade700),
                          const SizedBox(width: 8),
                          Text(
                            'Pending Charges: ₹${totalPending.toStringAsFixed(0)}',
                            style: TextStyle(
                              color: Colors.orange.shade800,
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      if (pendingPenalty > 0)
                        _buildChargeRow('Leave Penalty', pendingPenalty, Colors.orange.shade700),
                      if (pendingService > 0)
                        _buildChargeRow('Service Charge', pendingService, Colors.orange.shade700),
                      const Divider(color: Colors.orange),
                      Text(
                        '$swapsNeeded more swaps to clear',
                        style: TextStyle(color: Colors.orange.shade600, fontSize: 12),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
              ] else ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.green.shade100,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.check_circle, color: Colors.green.shade700),
                      const SizedBox(width: 8),
                      Text(
                        'No pending charges!',
                        style: TextStyle(
                          color: Colors.green.shade700,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
              ],
              
              // Leave Status
              Row(
                children: [
                  Expanded(
                    child: _buildStatCard(
                      'Leave Days Used',
                      '$leaveDaysUsed / 4',
                      Icons.event_busy,
                      leaveDaysUsed >= 4 ? Colors.red : Colors.white,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildStatCard(
                      'Free Leave Left',
                      '$freeLeave days',
                      Icons.event_available,
                      freeLeave == 0 ? Colors.red : Colors.white,
                    ),
                  ),
                ],
              ),
              
              const SizedBox(height: 16),
              
              // Total Swaps
              Row(
                children: [
                  Icon(Icons.swap_horiz, color: Colors.white.withOpacity(0.8)),
                  const SizedBox(width: 8),
                  Text(
                    'Total Swaps: ${_balance!['totalSwaps'] ?? 0}',
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.9),
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
  
  Widget _buildBalanceCard(double balance, double totalPending) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppColors.primaryBlue,
            AppColors.primaryBlue.withOpacity(0.8),
          ],
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: AppColors.primaryBlue.withOpacity(0.3),
            blurRadius: 12,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Available Balance',
            style: TextStyle(
              color: Colors.white.withOpacity(0.9),
              fontSize: 16,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                '\u20b9',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 36,
                  fontWeight: FontWeight.w300,
                ),
              ),
              const SizedBox(width: 4),
              Text(
                balance.toStringAsFixed(0),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 48,
                  fontWeight: FontWeight.bold,
                  letterSpacing: -1.5,
                ),
              ),
            ],
          ),
          if (totalPending > 0) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.orange.withOpacity(0.2),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.orange.withOpacity(0.5)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.warning_amber, color: Colors.white, size: 16),
                  const SizedBox(width: 6),
                  Text(
                    'Pending: \u20b9${totalPending.toStringAsFixed(0)}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
  
  Widget _buildPendingChargesCard(double pendingPenalty, double pendingService, int swapsNeeded, double totalPending) {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.warning_amber, color: Colors.orange.shade700, size: 24),
                const SizedBox(width: 12),
                const Text(
                  'Pending Charges',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            if (pendingPenalty > 0)
              _buildChargeRow('Leave Penalty', pendingPenalty, Colors.orange.shade700),
            if (pendingService > 0)
              _buildChargeRow('Service Charge', pendingService, Colors.orange.shade700),
            const Divider(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Total',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
                Text(
                  '\u20b9${totalPending.toStringAsFixed(0)}',
                  style: TextStyle(
                    color: Colors.orange.shade800,
                    fontWeight: FontWeight.bold,
                    fontSize: 18,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.blue.shade50,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Icon(Icons.info_outline, color: Colors.blue.shade700, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      '$swapsNeeded more swaps to clear all charges',
                      style: TextStyle(
                        color: Colors.blue.shade700,
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
    );
  }
  
  Widget _buildLeaveStatusCard(int leaveDaysUsed, int freeLeave) {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.event_available, color: AppColors.primaryBlue, size: 24),
                SizedBox(width: 12),
                Text(
                  'Leave Status',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: _buildStatItem(
                    'Used',
                    '$leaveDaysUsed / 4',
                    Icons.event_busy,
                    leaveDaysUsed >= 4 ? Colors.red : AppColors.primaryBlue,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _buildStatItem(
                    'Remaining',
                    '$freeLeave days',
                    Icons.event_available,
                    freeLeave == 0 ? Colors.red : Colors.green,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
  
  Widget _buildTotalSwapsCard() {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.primaryBlue.withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(
                Icons.swap_horiz,
                color: AppColors.primaryBlue,
                size: 32,
              ),
            ),
            const SizedBox(width: 16),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Total Swaps',
                  style: TextStyle(
                    color: Colors.grey,
                    fontSize: 14,
                  ),
                ),
                Text(
                  '${_balance!['totalSwaps'] ?? 0}',
                  style: const TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                    color: AppColors.primaryBlue,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
  
  Widget _buildViewTransactionsButton(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton.icon(
        onPressed: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) =>
                  DriverTransactionsScreen(driverId: widget.driverId),
            ),
          );
        },
        icon: const Icon(Icons.receipt_long),
        label: const Text('View Transaction History'),
        style: ElevatedButton.styleFrom(
          minimumSize: const Size.fromHeight(56),
          backgroundColor: AppColors.primaryBlue,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
    );
  }
  
  Widget _buildStatItem(String label, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 32),
          const SizedBox(height: 8),
          Text(
            value,
            style: TextStyle(
              color: color,
              fontSize: 20,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: const TextStyle(
              color: Colors.grey,
              fontSize: 12,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
  
  Widget _buildChargeRow(String label, double amount, Color color) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: color)),
          Text('₹${amount.toStringAsFixed(0)}', style: TextStyle(color: color, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
  
  Widget _buildStatCard(String label, String value, IconData icon, Color valueColor) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.15),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          Icon(icon, color: Colors.white.withOpacity(0.7), size: 24),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(
              color: valueColor,
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          Text(
            label,
            style: TextStyle(
              color: Colors.white.withOpacity(0.7),
              fontSize: 11,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

/// A transaction history screen for drivers
class DriverTransactionsScreen extends StatefulWidget {
  final String driverId;
  
  const DriverTransactionsScreen({
    super.key,
    required this.driverId,
  });
  
  @override
  State<DriverTransactionsScreen> createState() => _DriverTransactionsScreenState();
}

class _DriverTransactionsScreenState extends State<DriverTransactionsScreen> {
  final ApiService _apiService = ApiService();
  List<dynamic> _transactions = [];
  bool _isLoading = true;
  
  @override
  void initState() {
    super.initState();
    _loadTransactions();
  }
  
  Future<void> _loadTransactions() async {
    setState(() => _isLoading = true);
    
    final transactions = await _apiService.getDriverTransactions(widget.driverId);
    
    if (mounted) {
      setState(() {
        _transactions = transactions;
        _isLoading = false;
      });
    }
  }
  
  String _formatDate(String? timestamp) {
    if (timestamp == null) return '';
    try {
      final dt = DateTime.parse(timestamp);
      return '${dt.day}/${dt.month}/${dt.year} ${dt.hour}:${dt.minute.toString().padLeft(2, '0')}';
    } catch (e) {
      return '';
    }
  }

  double _parseAmount(dynamic value) {
    if (value == null) return 0.0;
    if (value is num) return value.toDouble();
    if (value is String) return double.tryParse(value) ?? 0.0;
    return 0.0;
  }
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Transaction History'),
        backgroundColor: AppColors.primaryBlue,
        foregroundColor: Colors.white,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _transactions.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.receipt_long, size: 64, color: Colors.grey[400]),
                      const SizedBox(height: 16),
                      Text(
                        'No transactions yet',
                        style: TextStyle(fontSize: 18, color: Colors.grey[600]),
                      ),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _loadTransactions,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(8),
                    itemCount: _transactions.length,
                    itemBuilder: (context, index) {
                      final tx = _transactions[index];
                      final penalty = _parseAmount(tx['penalty_deduction']);
                      final service = _parseAmount(tx['service_deduction']);
                      final hasDeductions = penalty > 0 || service > 0;
                      
                      return Card(
                        margin: const EdgeInsets.symmetric(vertical: 4),
                        child: ListTile(
                          leading: CircleAvatar(
                            backgroundColor: Colors.green.shade100,
                            child: Icon(Icons.swap_horiz, color: Colors.green.shade700),
                          ),
                          title: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text('₹${tx['total_amount'] ?? 0}', 
                                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                decoration: BoxDecoration(
                                  color: Colors.blue.shade100,
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Text(
                                  tx['zone'] ?? 'URBAN',
                                  style: TextStyle(fontSize: 11, color: Colors.blue.shade700),
                                ),
                              ),
                            ],
                          ),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Station: ${tx['station_id'] ?? 'Unknown'}'),
                              if (hasDeductions) ...[
                                const SizedBox(height: 4),
                                Wrap(
                                  spacing: 8,
                                  children: [
                                    if (penalty > 0)
                                      Chip(
                                        label: Text('Penalty: ₹$penalty'),
                                        backgroundColor: Colors.orange.shade100,
                                        labelStyle: TextStyle(fontSize: 11, color: Colors.orange.shade700),
                                        padding: EdgeInsets.zero,
                                        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                      ),
                                    if (service > 0)
                                      Chip(
                                        label: Text('Service: ₹$service'),
                                        backgroundColor: Colors.purple.shade100,
                                        labelStyle: TextStyle(fontSize: 11, color: Colors.purple.shade700),
                                        padding: EdgeInsets.zero,
                                        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                      ),
                                  ],
                                ),
                              ],
                              const SizedBox(height: 4),
                              Text(
                                _formatDate(tx['created_at']),
                                style: TextStyle(fontSize: 12, color: Colors.grey[500]),
                              ),
                            ],
                          ),
                          isThreeLine: true,
                        ),
                      );
                    },
                  ),
                ),
    );
  }
}

/// Pricing info widget showing current rates
class PricingInfoWidget extends StatelessWidget {
  const PricingInfoWidget({super.key});
  
  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.info_outline, color: AppColors.primaryBlue),
                SizedBox(width: 8),
                Text(
                  'Swap Pricing',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            _buildPriceRow('Base Swap Price', '₹170'),
            _buildPriceRow('Secondary Swap', '₹70'),
            const Divider(),
            const Text(
              'Zone Multipliers:',
              style: TextStyle(fontWeight: FontWeight.w500, fontSize: 13),
            ),
            const SizedBox(height: 4),
            _buildZoneRow('Metro', '1.2x', '₹204'),
            _buildZoneRow('Urban', '1.0x', '₹170'),
            _buildZoneRow('Semi-Urban', '0.9x', '₹153'),
            _buildZoneRow('Rural', '0.8x', '₹136'),
            const Divider(),
            const Text(
              'Leave Policy:',
              style: TextStyle(fontWeight: FontWeight.w500, fontSize: 13),
            ),
            const SizedBox(height: 4),
            _buildPriceRow('Free Leave Days', '4 / month'),
            _buildPriceRow('Leave Penalty', '₹120'),
            _buildPriceRow('Recovery per Swap', '₹60'),
            const Divider(),
            _buildPriceRow('Service Charge Recovery', '₹40 / swap'),
          ],
        ),
      ),
    );
  }
  
  Widget _buildPriceRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.grey)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
  
  Widget _buildZoneRow(String zone, String multiplier, String price) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          SizedBox(width: 80, child: Text(zone, style: const TextStyle(fontSize: 12))),
          SizedBox(width: 40, child: Text(multiplier, style: const TextStyle(fontSize: 12, color: Colors.grey))),
          Text(price, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}
