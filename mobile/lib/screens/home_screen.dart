import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../blocs/sync/sync_bloc.dart';
import '../services/sync_service.dart';
import '../widgets/sync_status_indicator.dart';

/// Home/dashboard screen after login.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final syncService = context.read<SyncService>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('ACT AI Tutor'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: SyncStatusIndicator(syncService: syncService),
          ),
        ],
      ),
      body: const Center(child: Text('Home Screen')),
    );
  }
}
