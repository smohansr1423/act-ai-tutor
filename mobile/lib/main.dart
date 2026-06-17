import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:hive_flutter/hive_flutter.dart';

import 'utils/app_router.dart';
import 'services/api_service.dart';
import 'services/connectivity_service.dart';
import 'services/sync_service.dart';
import 'blocs/auth/auth_bloc.dart';
import 'blocs/practice/practice_bloc.dart';
import 'blocs/sync/sync_bloc.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize Hive for local caching
  await Hive.initFlutter();

  // Open cache boxes
  await Hive.openBox('performance_cache');
  await Hive.openBox('session_cache');
  await Hive.openBox('sync_cache');
  await Hive.openBox('settings');

  runApp(const ActAiTutorApp());
}

class ActAiTutorApp extends StatelessWidget {
  const ActAiTutorApp({super.key});

  @override
  Widget build(BuildContext context) {
    final apiService = ApiService();
    final connectivityService = ConnectivityService()..startMonitoring();
    final syncService = SyncService(
      apiService: apiService,
      connectivityService: connectivityService,
    );

    return MultiRepositoryProvider(
      providers: [
        RepositoryProvider<ApiService>.value(value: apiService),
        RepositoryProvider<ConnectivityService>.value(
          value: connectivityService,
        ),
        RepositoryProvider<SyncService>.value(value: syncService),
      ],
      child: MultiBlocProvider(
        providers: [
          BlocProvider<AuthBloc>(
            create: (_) => AuthBloc(apiService: apiService),
          ),
          BlocProvider<PracticeBloc>(
            create: (_) => PracticeBloc(apiService: apiService),
          ),
          BlocProvider<SyncBloc>(
            create: (_) => SyncBloc(syncService: syncService)
              ..add(const SyncInitialized()),
          ),
        ],
        child: MaterialApp(
          title: 'ACT AI Tutor',
          debugShowCheckedModeBanner: false,
          theme: ThemeData(
            colorScheme: ColorScheme.fromSeed(
              seedColor: const Color(0xFF1E88E5),
              brightness: Brightness.light,
            ),
            useMaterial3: true,
          ),
          initialRoute: AppRouter.login,
          onGenerateRoute: AppRouter.generateRoute,
        ),
      ),
    );
  }
}
