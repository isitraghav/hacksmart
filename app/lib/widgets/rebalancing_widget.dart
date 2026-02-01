import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../utils/app_colors.dart';

/// Widget to show inventory status and trigger manual rebalancing check
class RebalancingWidget extends StatefulWidget {
  final String entityType; // 'PARTNER' or 'WAREHOUSE'
  final String entityId;
  final VoidCallback? onRebalancingRequested;
  
  const RebalancingWidget({
    super.key,
    required this.entityType,
    required this.entityId,
    this.onRebalancingRequested,
  });
  
  @override
  State<RebalancingWidget> createState() => _RebalancingWidgetState();
}

class _RebalancingWidgetState extends State<RebalancingWidget> {
  final ApiService _apiService = ApiService();
  bool _isChecking = false;
  Map<String, dynamic>? _lastAnalysis;
  
  Future<void> _checkInventory() async {
    setState(() => _isChecking = true);
    
    try {
      final result = await _apiService.checkRebalancing(widget.entityId);
      
      if (result['success'] == true) {
        setState(() {
          _lastAnalysis = result['analysis'] ?? result;
        });
        
        final needsRebalancing = result['needsRebalancing'] ?? result['analysis']?['needsRebalancing'] ?? false;
        final taskId = result['taskId'];
        
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(taskId != null 
                  ? 'Transfer task #$taskId created!'
                  : needsRebalancing 
                      ? 'Rebalancing needed but no sources available'
                      : 'Inventory levels are sufficient'),
              backgroundColor: taskId != null ? Colors.green : (needsRebalancing ? Colors.orange : Colors.blue),
            ),
          );
        }
        
        widget.onRebalancingRequested?.call();
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Error: ${result['error'] ?? 'Check failed'}'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isChecking = false);
      }
    }
  }
  
  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.autorenew, color: AppColors.primaryBlue),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text(
                    'Inventory Rebalancing',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'Auto-rebalances when predicted demand exceeds charging capacity.',
              style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
            ),
            const SizedBox(height: 12),
            
            // Info card about charging
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.blue.shade50,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Icon(Icons.battery_charging_full, color: Colors.blue.shade700, size: 20),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      'Battery: 6 hours to full charge (0→100%)',
                      style: TextStyle(fontSize: 12),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            
            // Check button
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _isChecking ? null : _checkInventory,
                icon: _isChecking 
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.fact_check),
                label: Text(_isChecking ? 'Checking...' : 'Check Inventory Status'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primaryBlue,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
              ),
            ),
            
            // Analysis results
            if (_lastAnalysis != null) ...[
              const SizedBox(height: 16),
              _buildAnalysisCard(_lastAnalysis!),
            ],
          ],
        ),
      ),
    );
  }
  
  Widget _buildAnalysisCard(Map<String, dynamic> analysis) {
    final needsRebalancing = analysis['needsRebalancing'] ?? false;
    final readyNow = analysis['readyNow'] ?? 0;
    final totalBatteries = analysis['totalBatteries'] ?? 0;
    final demandIn8Hours = analysis['forecastedDemandIn8Hours'] ?? 0;
    final availableIn8Hours = analysis['projectedAvailableIn8Hours'] ?? 0;
    final deficit = analysis['deficit'] ?? 0;
    final hoursUntilShortage = analysis['hoursUntilShortage'];
    
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: needsRebalancing ? Colors.orange.shade50 : Colors.green.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: needsRebalancing ? Colors.orange.shade300 : Colors.green.shade300,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                needsRebalancing ? Icons.warning_amber : Icons.check_circle,
                color: needsRebalancing ? Colors.orange.shade700 : Colors.green.shade700,
                size: 20,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  needsRebalancing ? 'Rebalancing Needed' : 'Sufficient Capacity',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: needsRebalancing ? Colors.orange.shade700 : Colors.green.shade700,
                  ),
                ),
              ),
            ],
          ),
          const Divider(height: 16),
          
          // Stats grid
          Row(
            children: [
              Expanded(child: _buildStatItem('Ready Now', '$readyNow', Icons.battery_full)),
              Expanded(child: _buildStatItem('Total', '$totalBatteries', Icons.battery_std)),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(child: _buildStatItem('Demand (8h)', '$demandIn8Hours', Icons.trending_up)),
              Expanded(child: _buildStatItem('Available (8h)', '$availableIn8Hours', Icons.schedule)),
            ],
          ),
          
          if (needsRebalancing) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.red.shade100,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Row(
                children: [
                  Icon(Icons.warning, size: 16, color: Colors.red.shade700),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Deficit: $deficit batteries${hoursUntilShortage != null ? ' (shortage in ~${hoursUntilShortage}h)' : ''}',
                      style: TextStyle(color: Colors.red.shade700, fontWeight: FontWeight.w500),
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
  
  Widget _buildStatItem(String label, String value, IconData icon) {
    return Row(
      children: [
        Icon(icon, size: 16, color: Colors.grey.shade600),
        const SizedBox(width: 4),
        Text(
          '$label: ',
          style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
        ),
        Text(
          value,
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
        ),
      ],
    );
  }
}

/// Compact status card for inventory
class InventoryStatusCard extends StatelessWidget {
  final int readyBatteries;
  final int totalBatteries;
  final int forecastedDemand;
  final bool needsAttention;
  
  const InventoryStatusCard({
    super.key,
    required this.readyBatteries,
    required this.totalBatteries,
    required this.forecastedDemand,
    this.needsAttention = false,
  });
  
  @override
  Widget build(BuildContext context) {
    return Card(
      color: needsAttention ? Colors.orange.shade50 : null,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: needsAttention ? Colors.orange.shade100 : Colors.blue.shade100,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(
                needsAttention ? Icons.warning_amber : Icons.inventory_2,
                color: needsAttention ? Colors.orange.shade700 : Colors.blue.shade700,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '$readyBatteries ready / $totalBatteries total',
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  Text(
                    'Forecasted demand: $forecastedDemand (8h)',
                    style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
                  ),
                ],
              ),
            ),
            if (needsAttention)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.orange,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Text(
                  'LOW',
                  style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
