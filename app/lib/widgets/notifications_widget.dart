import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../utils/app_colors.dart';

/// Notification types that require actions
class ActionableNotificationTypes {
  static const approvalRequired = 'APPROVAL_REQUIRED';
  static const transferRequest = 'TRANSFER_REQUEST';
  static const dispatchRequest = 'DISPATCH_REQUEST';
  static const leavePenalty = 'LEAVE_PENALTY';
  static const serviceCharge = 'SERVICE_CHARGE';
  static const lowInventory = 'LOW_INVENTORY';
  static const rebalancingInitiated = 'REBALANCING_INITIATED';
}

/// A reusable notifications screen that can be used by drivers, partners, and warehouses
class NotificationsScreen extends StatefulWidget {
  final String recipientType; // 'DRIVER', 'PARTNER', or 'WAREHOUSE'
  final String recipientId;
  final String title;
  
  const NotificationsScreen({
    super.key,
    required this.recipientType,
    required this.recipientId,
    this.title = 'Notifications',
  });
  
  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  final ApiService _apiService = ApiService();
  List<dynamic> _notifications = [];
  bool _isLoading = true;
  
  @override
  void initState() {
    super.initState();
    _loadNotifications();
  }
  
  Future<void> _loadNotifications() async {
    setState(() => _isLoading = true);
    
    final data = await _apiService.getNotifications(
      recipientType: widget.recipientType,
      recipientId: widget.recipientId,
      limit: 100,
    );
    
    setState(() {
      _notifications = data['notifications'] ?? [];
      _isLoading = false;
    });
  }
  
  Future<void> _markAsRead(String notificationId) async {
    await _apiService.markNotificationAsRead(notificationId);
    setState(() {
      final index = _notifications.indexWhere((n) => n['id'] == notificationId);
      if (index != -1) {
        _notifications[index]['is_read'] = true;
      }
    });
  }
  
  Future<void> _markAllAsRead() async {
    await _apiService.markAllNotificationsAsRead(
      recipientType: widget.recipientType,
      recipientId: widget.recipientId,
    );
    setState(() {
      for (var n in _notifications) {
        n['is_read'] = true;
      }
    });
  }
  
  IconData _getNotificationIcon(String type) {
    switch (type) {
      case 'SWAP_COMPLETE':
        return Icons.swap_horiz;
      case 'LOW_BATTERY_WARNING':
        return Icons.battery_alert;
      case 'STATION_NEARBY':
        return Icons.location_on;
      case 'BATTERY_RECEIVED':
        return Icons.battery_charging_full;
      case 'BATTERY_DISPATCHED':
        return Icons.send;
      case 'LOW_INVENTORY':
        return Icons.warning;
      case 'TRANSFER_REQUEST':
        return Icons.local_shipping;
      case 'DISPATCH_REQUEST':
        return Icons.inventory;
      case 'TRANSFER_COMPLETE':
        return Icons.check_circle;
      case 'INVENTORY_ALERT':
        return Icons.error;
      case 'SYSTEM_ALERT':
        return Icons.notification_important;
      case 'PAYMENT_DUE':
        return Icons.payment;
      case 'LEAVE_PENALTY':
        return Icons.event_busy;
      case 'SERVICE_CHARGE':
        return Icons.build;
      case 'PENALTY_CLEARED':
        return Icons.celebration;
      case 'TRANSFER_APPROVED':
        return Icons.thumb_up;
      case 'TRANSFER_REJECTED':
        return Icons.thumb_down;
      case 'REBALANCING_INITIATED':
        return Icons.autorenew;
      case 'APPROVAL_REQUIRED':
        return Icons.pending_actions;
      default:
        return Icons.notifications;
    }
  }
  
  Color _getNotificationColor(String type) {
    switch (type) {
      case 'SWAP_COMPLETE':
      case 'TRANSFER_COMPLETE':
      case 'BATTERY_RECEIVED':
      case 'TRANSFER_APPROVED':
      case 'PENALTY_CLEARED':
        return Colors.green;
      case 'LOW_BATTERY_WARNING':
      case 'LOW_INVENTORY':
      case 'INVENTORY_ALERT':
      case 'LEAVE_PENALTY':
      case 'SERVICE_CHARGE':
      case 'PAYMENT_DUE':
        return Colors.orange;
      case 'SYSTEM_ALERT':
      case 'TRANSFER_REJECTED':
        return Colors.red;
      case 'APPROVAL_REQUIRED':
      case 'TRANSFER_REQUEST':
      case 'DISPATCH_REQUEST':
        return Colors.purple;
      case 'REBALANCING_INITIATED':
        return Colors.teal;
      default:
        return AppColors.primaryBlue;
    }
  }
  
  // Check if notification requires manual action
  // Warehouses can manually approve/reject dispatch requests
  bool _isActionable(String type) {
    if (widget.recipientType == 'WAREHOUSE') {
      return type == ActionableNotificationTypes.dispatchRequest ||
             type == ActionableNotificationTypes.transferRequest ||
             type == ActionableNotificationTypes.approvalRequired;
    }
    return false;
  }
  
  String _formatTime(String? timestamp) {
    if (timestamp == null) return '';
    try {
      final dt = DateTime.parse(timestamp);
      final now = DateTime.now();
      final diff = now.difference(dt);
      
      if (diff.inMinutes < 1) {
        return 'Just now';
      } else if (diff.inMinutes < 60) {
        return '${diff.inMinutes}m ago';
      } else if (diff.inHours < 24) {
        return '${diff.inHours}h ago';
      } else if (diff.inDays < 7) {
        return '${diff.inDays}d ago';
      } else {
        return '${dt.day}/${dt.month}/${dt.year}';
      }
    } catch (e) {
      return '';
    }
  }
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text(widget.title),
        backgroundColor: AppColors.primaryBlue,
        foregroundColor: Colors.white,
        actions: [
          if (_notifications.any((n) => n['is_read'] == false))
            TextButton.icon(
              onPressed: _markAllAsRead,
              icon: const Icon(Icons.done_all, color: Colors.white, size: 20),
              label: const Text('Mark all read', style: TextStyle(color: Colors.white)),
            ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _notifications.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.notifications_none, size: 64, color: Colors.grey[400]),
                      const SizedBox(height: 16),
                      Text(
                        'No notifications yet',
                        style: TextStyle(fontSize: 18, color: Colors.grey[600]),
                      ),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _loadNotifications,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(8),
                    itemCount: _notifications.length,
                    itemBuilder: (context, index) {
                      final notification = _notifications[index];
                      final isUnread = notification['is_read'] == false;
                      final type = notification['type'] ?? 'INFO';
                      
                      return Card(
                        color: isUnread ? Colors.blue.shade50 : Colors.white,
                        margin: const EdgeInsets.symmetric(vertical: 4),
                        child: ListTile(
                          leading: CircleAvatar(
                            backgroundColor: _getNotificationColor(type).withOpacity(0.2),
                            child: Icon(
                              _getNotificationIcon(type),
                              color: _getNotificationColor(type),
                            ),
                          ),
                          title: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  notification['title'] ?? 'Notification',
                                  style: TextStyle(
                                    fontWeight: isUnread ? FontWeight.bold : FontWeight.normal,
                                  ),
                                ),
                              ),
                              if (isUnread)
                                Container(
                                  width: 8,
                                  height: 8,
                                  decoration: const BoxDecoration(
                                    color: Colors.blue,
                                    shape: BoxShape.circle,
                                  ),
                                ),
                            ],
                          ),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                notification['message'] ?? '',
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 4),
                              Text(
                                _formatTime(notification['created_at']),
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Colors.grey[500],
                                ),
                              ),
                            ],
                          ),
                          onTap: () {
                            if (isUnread) {
                              _markAsRead(notification['id']);
                            }
                            // Show notification details dialog
                            _showNotificationDetails(notification);
                          },
                        ),
                      );
                    },
                  ),
                ),
    );
  }
  
  void _showNotificationDetails(Map<String, dynamic> notification) {
    final type = notification['type'] ?? 'INFO';
    final data = notification['data'] as Map<String, dynamic>?;
    final isActionable = _isActionable(type);
    
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Row(
          children: [
            Icon(_getNotificationIcon(type), color: _getNotificationColor(type)),
            const SizedBox(width: 8),
            Expanded(child: Text(notification['title'] ?? 'Notification')),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(notification['message'] ?? ''),
              if (data != null) ...[
                const SizedBox(height: 16),
                const Divider(),
                const SizedBox(height: 8),
                _buildNotificationDataView(type, data),
              ],
              const SizedBox(height: 16),
              Text(
                _formatTime(notification['created_at']),
                style: TextStyle(fontSize: 12, color: Colors.grey[500]),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
          // Show approve/reject buttons for actionable notifications
          if (isActionable && data != null && data['taskId'] != null) ...[
            ElevatedButton.icon(
              onPressed: () => _handleReject(notification, data['taskId'].toString()),
              icon: const Icon(Icons.close, size: 18),
              label: const Text('Reject'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.red,
                foregroundColor: Colors.white,
              ),
            ),
            ElevatedButton.icon(
              onPressed: () => _handleApprove(notification, data['taskId'].toString()),
              icon: const Icon(Icons.check, size: 18),
              label: const Text('Approve'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.green,
                foregroundColor: Colors.white,
              ),
            ),
          ],
        ],
      ),
    );
  }
  
  Widget _buildNotificationDataView(String type, Map<String, dynamic> data) {
    // Special formatting for payment-related notifications
    if (type == 'SWAP_COMPLETE' && data['payment'] != null) {
      final payment = data['payment'] as Map<String, dynamic>;
      return _buildPaymentBreakdown(payment);
    }
    
    // Special formatting for transfer requests
    if (type == 'TRANSFER_REQUEST' || type == 'APPROVAL_REQUIRED' || type == 'DISPATCH_REQUEST') {
      return _buildTransferRequestView(data);
    }
    
    // Special formatting for rebalancing
    if (type == 'REBALANCING_INITIATED') {
      return _buildRebalancingView(data);
    }
    
    // Default view
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Details:', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.grey[600])),
        const SizedBox(height: 8),
        ...data.entries.where((e) => e.value != null && e.key != 'payment').map((e) => 
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${_formatKey(e.key)}: ', style: const TextStyle(fontWeight: FontWeight.w500)),
                Expanded(child: Text('${e.value}')),
              ],
            ),
          ),
        ),
      ],
    );
  }
  
  Widget _buildPaymentBreakdown(Map<String, dynamic> payment) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.green.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.green.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Payment Breakdown', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
          const SizedBox(height: 12),
          _buildPaymentRow('Swap Price', '₹${payment['swapPrice'] ?? payment['base'] ?? 0}'),
          _buildPaymentRow('Zone', '${payment['zone'] ?? 'URBAN'}'),
          if ((payment['penaltyDeduction'] ?? 0) > 0)
            _buildPaymentRow('Leave Penalty Recovery', '₹${payment['penaltyDeduction']}', isDeduction: true),
          if ((payment['serviceDeduction'] ?? 0) > 0)
            _buildPaymentRow('Service Charge Recovery', '₹${payment['serviceDeduction']}', isDeduction: true),
          const Divider(),
          _buildPaymentRow('Total', '₹${payment['total'] ?? payment['swapPrice'] ?? 0}', isBold: true),
        ],
      ),
    );
  }
  
  Widget _buildPaymentRow(String label, String value, {bool isDeduction = false, bool isBold = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(
            fontWeight: isBold ? FontWeight.bold : FontWeight.normal,
            color: isDeduction ? Colors.orange.shade700 : null,
          )),
          Text(value, style: TextStyle(
            fontWeight: isBold ? FontWeight.bold : FontWeight.w500,
            color: isDeduction ? Colors.orange.shade700 : Colors.green.shade700,
          )),
        ],
      ),
    );
  }
  
  Widget _buildTransferRequestView(Map<String, dynamic> data) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.purple.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.purple.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Transfer Details', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
          const SizedBox(height: 12),
          if (data['sourceId'] != null) _buildInfoRow('From', '${data['sourceType'] ?? ''} ${data['sourceId']}'),
          if (data['targetId'] != null) _buildInfoRow('To', '${data['targetType'] ?? ''} ${data['targetId']}'),
          if (data['amount'] != null) _buildInfoRow('Batteries', '${data['amount']}'),
          if (data['priority'] != null) _buildPriorityBadge(data['priority']),
          if (data['reason'] != null) ...[
            const SizedBox(height: 8),
            Text('Reason: ${data['reason']}', style: TextStyle(color: Colors.grey[600], fontStyle: FontStyle.italic)),
          ],
        ],
      ),
    );
  }
  
  Widget _buildRebalancingView(Map<String, dynamic> data) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.teal.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.teal.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.autorenew, color: Colors.teal.shade700),
              const SizedBox(width: 8),
              const Text('Auto-Rebalancing', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            ],
          ),
          const SizedBox(height: 12),
          if (data['forecastedDemand'] != null) _buildInfoRow('Forecasted Demand', '${data['forecastedDemand']} swaps'),
          if (data['currentCharged'] != null) _buildInfoRow('Current Charged', '${data['currentCharged']} batteries'),
          if (data['deficit'] != null) _buildInfoRow('Deficit', '${data['deficit']} batteries'),
          if (data['agentResponse'] != null) ...[
            const SizedBox(height: 8),
            const Text('AI Agent Response:', style: TextStyle(fontWeight: FontWeight.w500)),
            const SizedBox(height: 4),
            Text('${data['agentResponse']}', style: TextStyle(color: Colors.grey[700])),
          ],
        ],
      ),
    );
  }
  
  Widget _buildInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Text('$label: ', style: const TextStyle(fontWeight: FontWeight.w500)),
          Text(value),
        ],
      ),
    );
  }
  
  Widget _buildPriorityBadge(String priority) {
    Color badgeColor;
    switch (priority.toUpperCase()) {
      case 'CRITICAL':
        badgeColor = Colors.red;
        break;
      case 'HIGH':
        badgeColor = Colors.orange;
        break;
      case 'NORMAL':
        badgeColor = Colors.blue;
        break;
      default:
        badgeColor = Colors.grey;
    }
    
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Row(
        children: [
          const Text('Priority: ', style: TextStyle(fontWeight: FontWeight.w500)),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: badgeColor,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(priority.toUpperCase(), style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }
  
  String _formatKey(String key) {
    return key.replaceAllMapped(RegExp(r'([A-Z])'), (m) => ' ${m.group(1)}')
              .replaceAll('_', ' ')
              .trim()
              .split(' ')
              .map((w) => w.isNotEmpty ? '${w[0].toUpperCase()}${w.substring(1).toLowerCase()}' : '')
              .join(' ');
  }
  
  Future<void> _handleApprove(Map<String, dynamic> notification, String taskId) async {
    Navigator.pop(context);
    
    // Show loading
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => const Center(child: CircularProgressIndicator()),
    );
    
    try {
      await _apiService.approveTransfer(taskId, widget.recipientId, 'Approved via app');
      
      Navigator.pop(context); // Close loading
      
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Transfer approved successfully'), backgroundColor: Colors.green),
      );
      
      _markAsRead(notification['id']);
      _loadNotifications();
    } catch (e) {
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: ${e.toString()}'), backgroundColor: Colors.red),
      );
    }
  }
  
  Future<void> _handleReject(Map<String, dynamic> notification, String taskId) async {
    // Show reason dialog
    final reasonController = TextEditingController();
    
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Reject Transfer'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Are you sure you want to reject this transfer request?'),
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
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Reject'),
          ),
        ],
      ),
    );
    
    if (confirmed != true) return;
    
    Navigator.pop(context); // Close notification details
    
    // Show loading
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => const Center(child: CircularProgressIndicator()),
    );
    
    try {
      await _apiService.rejectTransfer(taskId, widget.recipientId, reasonController.text);
      
      Navigator.pop(context);
      
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Transfer rejected'), backgroundColor: Colors.orange),
      );
      
      _markAsRead(notification['id']);
      _loadNotifications();
    } catch (e) {
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: ${e.toString()}'), backgroundColor: Colors.red),
      );
    }
  }
}

/// A notification bell icon with badge that can be added to app bars
class NotificationBellIcon extends StatefulWidget {
  final String recipientType;
  final String recipientId;
  final VoidCallback? onTap;
  final Color? iconColor;
  
  const NotificationBellIcon({
    super.key,
    required this.recipientType,
    required this.recipientId,
    this.onTap,
    this.iconColor,
  });
  
  @override
  State<NotificationBellIcon> createState() => _NotificationBellIconState();
}

class _NotificationBellIconState extends State<NotificationBellIcon> {
  final ApiService _apiService = ApiService();
  int _unreadCount = 0;
  
  @override
  void initState() {
    super.initState();
    _loadUnreadCount();
  }
  
  @override
  void didUpdateWidget(NotificationBellIcon oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.recipientId != widget.recipientId) {
      _loadUnreadCount();
    }
  }
  
  Future<void> _loadUnreadCount() async {
    if (widget.recipientId.isEmpty) return;
    
    final count = await _apiService.getUnreadNotificationCount(
      recipientType: widget.recipientType,
      recipientId: widget.recipientId,
    );
    
    if (mounted) {
      setState(() => _unreadCount = count);
    }
  }
  
  /// Call this method to refresh the unread count from outside
  void refresh() {
    _loadUnreadCount();
  }
  
  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        IconButton(
          icon: Icon(Icons.notifications_outlined, color: widget.iconColor ?? Colors.white),
          onPressed: () {
            widget.onTap?.call();
            // Navigate to notifications screen
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (context) => NotificationsScreen(
                  recipientType: widget.recipientType,
                  recipientId: widget.recipientId,
                ),
              ),
            ).then((_) => _loadUnreadCount()); // Refresh count when returning
          },
        ),
        if (_unreadCount > 0)
          Positioned(
            right: 8,
            top: 8,
            child: Container(
              padding: const EdgeInsets.all(4),
              decoration: const BoxDecoration(
                color: Colors.red,
                shape: BoxShape.circle,
              ),
              constraints: const BoxConstraints(
                minWidth: 18,
                minHeight: 18,
              ),
              child: Text(
                _unreadCount > 99 ? '99+' : '$_unreadCount',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                ),
                textAlign: TextAlign.center,
              ),
            ),
          ),
      ],
    );
  }
}
