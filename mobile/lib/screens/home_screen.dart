import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../blocs/auth/auth_bloc.dart';
import '../blocs/auth/auth_event.dart';
import '../blocs/auth/auth_state.dart';
import '../blocs/sync/sync_bloc.dart';
import '../services/sync_service.dart';
import '../utils/app_router.dart';
import '../widgets/sync_status_indicator.dart';

/// Home/dashboard screen after login.
/// Shows navigation cards for all major features.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final syncService = context.read<SyncService>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('ACT AI Tutor'),
        automaticallyImplyLeading: false,
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: SyncStatusIndicator(syncService: syncService),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () {
              context.read<AuthBloc>().add(AuthLogoutRequested());
              Navigator.of(context).pushReplacementNamed(AppRouter.login);
            },
          ),
        ],
      ),
      body: BlocBuilder<AuthBloc, AuthState>(
        builder: (context, state) {
          String userName = 'Student';
          if (state is AuthAuthenticated) {
            userName = state.user.name;
          }

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Welcome section
                Text(
                  'Welcome back, $userName!',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                ),
                const SizedBox(height: 8),
                Text(
                  'What would you like to practice today?',
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                        color: Colors.grey[600],
                      ),
                ),
                const SizedBox(height: 24),

                // Feature cards
                _buildFeatureCard(
                  context,
                  icon: Icons.school,
                  title: 'Practice',
                  subtitle: 'Practice by section: English, Math, Reading, Science',
                  color: Colors.blue,
                  onTap: () => Navigator.of(context).pushNamed(AppRouter.practice),
                ),
                const SizedBox(height: 12),
                _buildFeatureCard(
                  context,
                  icon: Icons.timer,
                  title: 'Full Test',
                  subtitle: 'Timed full-length ACT practice test',
                  color: Colors.orange,
                  onTap: () => Navigator.of(context).pushNamed(AppRouter.fullTest),
                ),
                const SizedBox(height: 12),
                _buildFeatureCard(
                  context,
                  icon: Icons.chat_bubble_outline,
                  title: 'AI Tutor Chat',
                  subtitle: 'Ask questions and get explanations',
                  color: Colors.purple,
                  onTap: () => Navigator.of(context).pushNamed(AppRouter.chat),
                ),
                const SizedBox(height: 12),
                _buildFeatureCard(
                  context,
                  icon: Icons.analytics_outlined,
                  title: 'Analytics',
                  subtitle: 'Track your progress and weak areas',
                  color: Colors.green,
                  onTap: () => Navigator.of(context).pushNamed(AppRouter.analytics),
                ),
                const SizedBox(height: 12),
                _buildFeatureCard(
                  context,
                  icon: Icons.calendar_today,
                  title: 'Study Plan',
                  subtitle: 'Personalized daily study goals',
                  color: Colors.teal,
                  onTap: () => Navigator.of(context).pushNamed(AppRouter.studyPlan),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildFeatureCard(
    BuildContext context, {
    required IconData icon,
    required String title,
    required String subtitle,
    required Color color,
    required VoidCallback onTap,
  }) {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: color.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: color, size: 32),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: Colors.grey[600],
                          ),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: Colors.grey[400]),
            ],
          ),
        ),
      ),
    );
  }
}
