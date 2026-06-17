import 'package:flutter/material.dart';

import '../utils/app_router.dart';

/// Data class holding the practice session summary information.
/// Populated from the POST /api/sessions/practice/end response.
class PracticeSessionSummary {
  final int totalQuestions;
  final int correctCount;
  final double avgTimeSeconds;

  const PracticeSessionSummary({
    required this.totalQuestions,
    required this.correctCount,
    required this.avgTimeSeconds,
  });

  /// Percentage of questions answered correctly (0.0 - 1.0).
  double get correctPercentage =>
      totalQuestions > 0 ? correctCount / totalQuestions : 0.0;

  /// Factory constructor from API response JSON.
  factory PracticeSessionSummary.fromJson(Map<String, dynamic> json) {
    return PracticeSessionSummary(
      totalQuestions: json['totalQuestions'] as int? ?? 0,
      correctCount: json['correct'] as int? ?? 0,
      avgTimeSeconds: (json['avgTime'] as num?)?.toDouble() ?? 0.0,
    );
  }
}

/// Practice session summary screen displayed after the student taps "End Session".
///
/// Shows:
/// - Total questions answered
/// - Number correct with percentage
/// - Average time per question (in seconds)
/// - Circular progress indicator for percentage correct
/// - Navigation buttons: Practice Again, View Analytics, Go Home
///
/// Validates: Requirements 3.9
class PracticeSummaryScreen extends StatelessWidget {
  final PracticeSessionSummary summary;

  const PracticeSummaryScreen({
    super.key,
    required this.summary,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Session Summary'),
        automaticallyImplyLeading: false,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
          child: Column(
            children: [
              // Circular progress indicator showing % correct
              _buildProgressIndicator(context),
              const SizedBox(height: 32),
              // Summary statistics
              _buildStatisticsCard(context),
              const SizedBox(height: 32),
              // Action buttons
              _buildActionButtons(context),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildProgressIndicator(BuildContext context) {
    final theme = Theme.of(context);
    final percentage = summary.correctPercentage;
    final percentText = '${(percentage * 100).toStringAsFixed(0)}%';

    // Color based on performance
    final progressColor = _performanceColor(percentage, theme.colorScheme);

    return Column(
      children: [
        SizedBox(
          width: 160,
          height: 160,
          child: Stack(
            alignment: Alignment.center,
            children: [
              SizedBox(
                width: 160,
                height: 160,
                child: CircularProgressIndicator(
                  value: percentage,
                  strokeWidth: 12,
                  backgroundColor: theme.colorScheme.surfaceContainerHighest,
                  valueColor: AlwaysStoppedAnimation<Color>(progressColor),
                  semanticsLabel: 'Score: $percentText correct',
                ),
              ),
              Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    percentText,
                    style: theme.textTheme.headlineLarge?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: progressColor,
                    ),
                    semanticsLabel: '$percentText correct',
                  ),
                  Text(
                    'Correct',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Text(
          _performanceMessage(percentage),
          style: theme.textTheme.titleMedium?.copyWith(
            color: progressColor,
            fontWeight: FontWeight.w600,
          ),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  Widget _buildStatisticsCard(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            _buildStatRow(
              context,
              icon: Icons.quiz_outlined,
              label: 'Total Questions',
              value: '${summary.totalQuestions}',
            ),
            const Divider(height: 24),
            _buildStatRow(
              context,
              icon: Icons.check_circle_outline,
              label: 'Correct Answers',
              value: '${summary.correctCount} / ${summary.totalQuestions}',
            ),
            const Divider(height: 24),
            _buildStatRow(
              context,
              icon: Icons.timer_outlined,
              label: 'Avg. Time per Question',
              value: '${summary.avgTimeSeconds.toStringAsFixed(1)}s',
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatRow(
    BuildContext context, {
    required IconData icon,
    required String label,
    required String value,
  }) {
    final theme = Theme.of(context);

    return Semantics(
      label: '$label: $value',
      child: Row(
        children: [
          Icon(icon, size: 28, color: theme.colorScheme.primary),
          const SizedBox(width: 16),
          Expanded(
            child: Text(
              label,
              style: theme.textTheme.bodyLarge,
            ),
          ),
          Text(
            value,
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionButtons(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        FilledButton.icon(
          onPressed: () => _navigateToPractice(context),
          icon: const Icon(Icons.replay),
          label: const Text('Practice Again'),
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: () => _navigateToAnalytics(context),
          icon: const Icon(Icons.analytics_outlined),
          label: const Text('View Analytics'),
        ),
        const SizedBox(height: 12),
        TextButton.icon(
          onPressed: () => _navigateToHome(context),
          icon: const Icon(Icons.home_outlined),
          label: const Text('Go Home'),
        ),
      ],
    );
  }

  /// Navigate back to the practice section selection screen.
  void _navigateToPractice(BuildContext context) {
    Navigator.of(context).pushNamedAndRemoveUntil(
      AppRouter.practice,
      (route) => route.settings.name == AppRouter.home,
    );
  }

  /// Navigate to the analytics dashboard.
  void _navigateToAnalytics(BuildContext context) {
    Navigator.of(context).pushNamed(AppRouter.analytics);
  }

  /// Navigate to the home screen, clearing the navigation stack.
  void _navigateToHome(BuildContext context) {
    Navigator.of(context).pushNamedAndRemoveUntil(
      AppRouter.home,
      (route) => false,
    );
  }

  /// Returns a color reflecting the student's performance.
  Color _performanceColor(double percentage, ColorScheme colorScheme) {
    if (percentage >= 0.8) return Colors.green;
    if (percentage >= 0.6) return Colors.orange;
    return Colors.redAccent;
  }

  /// Returns an encouraging message based on performance.
  String _performanceMessage(double percentage) {
    if (percentage >= 0.9) return 'Excellent work!';
    if (percentage >= 0.8) return 'Great job!';
    if (percentage >= 0.6) return 'Good effort, keep practicing!';
    if (percentage >= 0.4) return 'You\'re improving, keep going!';
    return 'Keep practicing, you\'ll get there!';
  }
}
