import 'package:flutter/material.dart';
import '../utils/app_colors.dart';

/// Automatic inventory status display widget
/// Shows current inventory state with auto-rebalancing indicator
/// No manual check button - rebalancing happens automatically on events
class InventoryStatusWidget extends StatelessWidget {
  final List<dynamic> batteries;
  final int avgDailySwaps;
  final bool hasPendingTransfer;
  
  const InventoryStatusWidget({
    super.key,
    required this.batteries,
    this.avgDailySwaps = 0,
    this.hasPendingTransfer = false,
  });
  
  @override
  Widget build(BuildContext context) {
    // Calculate from actual battery data (same logic as dashboard)
    final int readyNow = batteries.where((b) => 
      b['soc'] != null && (b['soc'] as num) > 80
    ).length;
    
    final int charging = batteries.where((b) => 
      b['soc'] != null && (b['soc'] as num) <= 80 && (b['soc'] as num) > 20
    ).length;
    
    // Determine status
    final bool isLow = readyNow <= 2;
    final bool isCritical = readyNow == 0;
    
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isCritical 
                ? Colors.red.shade300 
                : isLow 
                    ? Colors.orange.shade300 
                    : Colors.green.shade300,
            width: 1.5,
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header with status indicator
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: isCritical 
                          ? Colors.red.shade100 
                          : isLow 
                              ? Colors.orange.shade100 
                              : Colors.green.shade100,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(
                      isCritical 
                          ? Icons.error 
                          : isLow 
                              ? Icons.warning_amber 
                              : Icons.check_circle,
                      color: isCritical 
                          ? Colors.red.shade700 
                          : isLow 
                              ? Colors.orange.shade700 
                              : Colors.green.shade700,
                      size: 24,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          isCritical 
                              ? 'No Batteries Available' 
                              : isLow 
                                  ? 'Low Inventory' 
                                  : 'Inventory OK',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: isCritical 
                                ? Colors.red.shade700 
                                : isLow 
                                    ? Colors.orange.shade700 
                                    : Colors.green.shade700,
                          ),
                        ),
                        Text(
                          'Auto-rebalancing active',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey.shade600,
                          ),
                        ),
                      ],
                    ),
                  ),
                  // Auto indicator
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppColors.primaryBlue.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.autorenew, size: 14, color: AppColors.primaryBlue),
                        const SizedBox(width: 4),
                        Text(
                          'AUTO',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            color: AppColors.primaryBlue,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              
              const SizedBox(height: 16),
              
              // Battery stats
              Row(
                children: [
                  Expanded(
                    child: _buildStatBox(
                      'Ready',
                      '$readyNow',
                      Icons.battery_full,
                      Colors.green,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _buildStatBox(
                      'Charging',
                      '$charging',
                      Icons.battery_charging_full,
                      Colors.blue,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _buildStatBox(
                      'Avg/Day',
                      '$avgDailySwaps',
                      Icons.swap_horiz,
                      Colors.purple,
                    ),
                  ),
                ],
              ),
              
              // Warning message if low
              if (isLow || isCritical) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: isCritical ? Colors.red.shade50 : Colors.orange.shade50,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        Icons.info_outline,
                        size: 18,
                        color: isCritical ? Colors.red.shade700 : Colors.orange.shade700,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          isCritical 
                              ? 'Automatic transfer request in progress'
                              : 'System monitoring inventory levels',
                          style: TextStyle(
                            fontSize: 12,
                            color: isCritical ? Colors.red.shade700 : Colors.orange.shade700,
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
      ),
    );
  }
  
  Widget _buildStatBox(String label, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
          Text(
            label,
            style: TextStyle(
              fontSize: 10,
              color: Colors.grey.shade600,
            ),
          ),
        ],
      ),
    );
  }
}
