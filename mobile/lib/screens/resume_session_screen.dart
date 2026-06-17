import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../blocs/fulltest/fulltest_bloc.dart';
import '../services/session_storage_service.dart';
import '../utils/app_router.dart';

/// Screen listing interrupted full test sessions available for resume.
///
/// Displays sessions that were interrupted within the last 24 hours,
/// allowing the student to resume or dismiss them.
///
/// Requirements: 4.9 - Allow the Student to resume from where they left off
/// Requirements: 4.10 - Discard sessions not resumed within 24 hours
class ResumeSessionScreen extends StatelessWidget {
  const ResumeSessionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<FullTestBloc, FullTestState>(
      listener: (context, state) {
        if (state is FullTestActive) {
          // Successfully resumed — navigate to the test question screen
          Navigator.of(context).pushReplacementNamed(
            AppRouter.fullTestQuestion,
          );
        } else if (state is FullTestError) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(state.message),
              backgroundColor: Colors.red[700],
            ),
          );
        }
      },
      builder: (context, state) {
        return Scaffold(
          appBar: AppBar(
            title: const Text('Resume Session'),
          ),
          body: _buildBody(context, state),
        );
      },
    );
  }

  Widget _buildBody(BuildContext context, FullTestState state) {
    if (state is FullTestLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (state is InterruptedSessionsLoaded) {
      if (state.sessions.isEmpty) {
        return _buildEmptyState(context);
      }
      return _buildSessionList(context, state.sessions);
    }

    // Initial state — trigger loading
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<FullTestBloc>().add(const LoadInterruptedSessions());
    });
    return const Center(child: CircularProgressIndicator());
  }

  Widget _buildEmptyState(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32.0),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.check_circle_outline,
              size: 64,
              color: Colors.grey[400],
            ),
            const SizedBox(height: 16),
            Text(
              'No Interrupted Sessions',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    color: Colors.grey[600],
                  ),
            ),
            const SizedBox(height: 8),
            Text(
              'All your sessions are complete. Start a new test to continue practicing.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Colors.grey[500],
                  ),
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () {
                Navigator.of(context).pushReplacementNamed(AppRouter.fullTest);
              },
              child: const Text('Start New Test'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSessionList(
    BuildContext context,
    List<InterruptedSession> sessions,
  ) {
    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Interrupted Sessions',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
          ),
          const SizedBox(height: 8),
          Text(
            'You have ${sessions.length} session${sessions.length > 1 ? 's' : ''} '
            'that can be resumed. Sessions expire 24 hours after interruption.',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Colors.grey[600],
                ),
          ),
          const SizedBox(height: 16),
          Expanded(
            child: ListView.separated(
              itemCount: sessions.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                return _SessionCard(session: sessions[index]);
              },
            ),
          ),
        ],
      ),
    );
  }
}

/// Card widget representing a single interrupted session.
class _SessionCard extends StatelessWidget {
  final InterruptedSession session;

  const _SessionCard({required this.session});

  @override
  Widget build(BuildContext context) {
    final sectionTitle = _sectionDisplayName(session.section);
    final sectionColor = _sectionColor(session.section);
    final sectionIcon = _sectionIcon(session.section);
    final answeredCount = session.answers.length;
    final totalQuestions = session.questions.length;
    final progress = totalQuestions > 0 ? answeredCount / totalQuestions : 0.0;

    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: sectionColor.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(sectionIcon, color: sectionColor, size: 24),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '$sectionTitle Test',
                        style:
                            Theme.of(context).textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.bold,
                                ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        session.timeUntilExpiry,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: _expiryColor(session),
                              fontWeight: FontWeight.w500,
                            ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close, size: 20),
                  onPressed: () => _dismissSession(context),
                  tooltip: 'Dismiss session',
                  color: Colors.grey[500],
                ),
              ],
            ),
            const SizedBox(height: 12),
            // Progress bar
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: progress,
                minHeight: 6,
                backgroundColor: Colors.grey[200],
                valueColor: AlwaysStoppedAnimation<Color>(sectionColor),
              ),
            ),
            const SizedBox(height: 8),
            // Details row
            Row(
              children: [
                _DetailChip(
                  icon: Icons.quiz_outlined,
                  label: '$answeredCount / $totalQuestions answered',
                ),
                const SizedBox(width: 12),
                _DetailChip(
                  icon: Icons.timer_outlined,
                  label: _formatTimeRemaining(session.timeRemainingSeconds),
                ),
              ],
            ),
            const SizedBox(height: 12),
            // Resume button
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () => _resumeSession(context),
                icon: const Icon(Icons.play_arrow),
                label: const Text('Resume'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: sectionColor,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _resumeSession(BuildContext context) {
    context.read<FullTestBloc>().add(ResumeTest(sessionId: session.sessionId));
  }

  void _dismissSession(BuildContext context) {
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Dismiss Session?'),
        content: const Text(
          'This session will be marked as incomplete and cannot be resumed. '
          'Are you sure you want to dismiss it?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(dialogContext).pop();
              context.read<FullTestBloc>().add(
                    DismissInterruptedSession(sessionId: session.sessionId),
                  );
            },
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Dismiss'),
          ),
        ],
      ),
    );
  }

  String _formatTimeRemaining(int seconds) {
    final minutes = seconds ~/ 60;
    final secs = seconds % 60;
    return '${minutes}m ${secs}s remaining';
  }

  Color _expiryColor(InterruptedSession session) {
    final remaining = session.expiresAt.difference(DateTime.now());
    if (remaining.inHours < 2) return Colors.red[700]!;
    if (remaining.inHours < 6) return Colors.orange[700]!;
    return Colors.green[700]!;
  }

  String _sectionDisplayName(String section) {
    switch (section) {
      case 'english':
        return 'English';
      case 'math':
        return 'Math';
      case 'reading':
        return 'Reading';
      case 'science':
        return 'Science';
      default:
        return section[0].toUpperCase() + section.substring(1);
    }
  }

  Color _sectionColor(String section) {
    switch (section) {
      case 'english':
        return const Color(0xFF4CAF50);
      case 'math':
        return const Color(0xFF2196F3);
      case 'reading':
        return const Color(0xFFFF9800);
      case 'science':
        return const Color(0xFF9C27B0);
      default:
        return const Color(0xFF607D8B);
    }
  }

  IconData _sectionIcon(String section) {
    switch (section) {
      case 'english':
        return Icons.edit_note;
      case 'math':
        return Icons.calculate;
      case 'reading':
        return Icons.menu_book;
      case 'science':
        return Icons.science;
      default:
        return Icons.quiz;
    }
  }
}

/// Small detail chip showing an icon and label.
class _DetailChip extends StatelessWidget {
  final IconData icon;
  final String label;

  const _DetailChip({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: Colors.grey[600]),
        const SizedBox(width: 4),
        Text(
          label,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Colors.grey[600],
              ),
        ),
      ],
    );
  }
}
