import 'package:flutter/material.dart';
import 'tabs/driver_tab.dart';
import 'tabs/partner_tab.dart';
import 'tabs/warehouse_tab.dart';
import 'utils/app_colors.dart';
import 'widgets/notifications_widget.dart';
import 'widgets/driver_wallet_widget.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _selectedIndex = 0;

  static const List<Widget> _widgetOptions = <Widget>[
    DriverTab(),
    PartnerTab(),
    WarehouseTab(),
  ];

  void _onItemTapped(int index) {
    setState(() {
      _selectedIndex = index;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: _selectedIndex == 0 // Custom AppBar only for Driver/Home tab to match screenshot somewhat
          ? AppBar(
              backgroundColor: AppColors.white,
              elevation: 0,
              automaticallyImplyLeading: false,
              title: const Text(
                'BatterySmart',
                style: TextStyle(
                  color: AppColors.primaryBlue,
                  fontWeight: FontWeight.bold,
                  fontSize: 20,
                ),
              ),
              centerTitle: true,
              leading: IconButton(
                icon: const Icon(
                  Icons.account_balance_wallet,
                  color: AppColors.primaryBlue,
                ),
                onPressed: () {
                  // Navigate to wallet page
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (context) => const DriverWalletWidget(
                        driverId: 'DRIVER_001',
                      ),
                    ),
                  );
                },
              ),
              actions: [
                 NotificationBellIcon(
                  recipientType: 'DRIVER',
                  recipientId: 'DRIVER_001',
                  iconColor: AppColors.primaryBlue,
                ),
              ],
            )
          : null,
      body: _widgetOptions.elementAt(_selectedIndex),
      bottomNavigationBar: BottomNavigationBar(
        items: const <BottomNavigationBarItem>[
          BottomNavigationBarItem(
            icon: Icon(Icons.electric_scooter),
            label: 'Driver',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.business),
            label: 'Partner',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.warehouse),
            label: 'Warehouse',
          ),
        ],
        currentIndex: _selectedIndex,
        selectedItemColor: AppColors.primaryBlue,
        onTap: _onItemTapped,
      ),
    );
  }
}
