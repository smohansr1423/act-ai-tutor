import 'package:flutter/material.dart';

import '../utils/app_router.dart';

/// Full Test score summary and review screen.
///
/// Displays:
/// - Score header showing "X / Y correct" with a percentage
/// - Performance badge (Excellent, Good, Needs Work)
/// - Scrollable list of all questions with student answers, correct answers,
///   color coding, and expandable explanations
/// - "Practice Again" and "Go Home" navigation buttons
///
/// Receives `scoreSummary` (Map<String, dynamic>) via route arguments from
/// FullTestCompleted state.
/// Structure: { score: { correct, total }, details: [{ questionId, selectedAnswer,
/// correctAnswer, isCorrect, explanation }] }
///
/// Validates: Requirements 4.7
class FullTestSummaryScreen extends StatelessWidget {
  const FullTestSummaryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final scoreSummary = ModalRoute.of(context)?.settings.arguments
        as Map<String, dynamic>? ??
        <String, dynamic>{};

    final scoreData = scoreSummary['score'] as Map<String, dynamic>? ??
        <String, dynamic>{};
    final correct = scoreData['correct'] as int? ?? 0;
    final total = scoreData['total'] as int? ?? 0;
    final details = scoreSummary['details'] as List<dynamic>? ?? [];
    final percentage = total > 0 ? correct / total : 0.0;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Test Results'),
        automaticallyImplyLeading: false,
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Score header section
            _ScoreHeader(
              correct: correct,
              total: total,
              percentage: percentage,
            ),
            const Divider(height: 1),
            // Scrollable question review list
            Expanded(
              child: details.isEmpty
                  ? const Center(
                      child: Text('No question details available.'),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 12,
                      ),
                      itemCount: details.length,
                      itemBuilder: (context, index) {
                        final detail =
                            details[index] as Map<String, dynamic>? ??
                                <String, dynamic>{};
                        return _QuestionReviewTile(
                          index: index,
                          detail: detail,
                        );
                      },
                    ),
            ),
            // Navigation buttons
            _ActionButtons(),
          ],
        ),
      ),
    );
  }
}

/// Score header showing correct/total, percentage, and performance badge.
class _ScoreHeader extends StatelessWidget {
  final int correct;
  final int total;
  final double percentage;

  const _ScoreHeader({
    required this.correct,
    required this.total,
    required this.percentage,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final badgeInfo = _performanceBadge(percentage);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 24),
      color: theme.colorScheme.surfaceContainerHighest.withOpacity(0.3),
      child: Column(
        children: [
          // Score circle
          SizedBox(
            width: 120,
            height: 120,
            child: Stack(
              alignment: Alignment.center,
              children: [
                SizedBox(
                  width: 120,
                  height: 120,
                  child: CircularProgressIndicator(
                    value: percentage,
                    strokeWidth: 10,
                    backgroundColor:
                        theme.colorScheme.surfaceContainerHighest,
                    valueColor:
                        AlwaysStoppedAnimation<Color>(badgeInfo.color),
                    semanticsLabel:
                        'Score: ${(percentage * 100).toStringAsFixed(0)} percent',
                  ),
                ),
                Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      '${(percentage * 100).toStringAsFixed(0)}%',
                      style: theme.textTheme.headlineMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: badgeInfo.color,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          // Score text
          Semantics(
            label: '$correct out of $total correct',
            child: Text(
              '$correct / $total correct',
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const SizedBox(height: 8),
          // Performance badge
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            decoration: BoxDecoration(
              color: badgeInfo.color.withOpacity(0.12),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              badgeInfo.label,
              style: theme.textTheme.labelLarge?.copyWith(
                color: badgeInfo.color,
                fontWeight: FontWeight.w600,
              ),
              semanticsLabel: 'Performance: ${badgeInfo.label}',
            ),
          ),
        ],
      ),
    );
  }

  _BadgeInfo _performanceBadge(double percentage) {
    if (percentage >= 0.8) {
      return _BadgeInfo(label: 'Excellent', color: Colors.green);
    } else if (percentage >= 0.6) {
      return _BadgeInfo(label: 'Good', color: Colors.orange);
    } else {
      return _BadgeInfo(label: 'Needs Work', color: Colors.redAccent);
    }
  }
}

/// Simple data holder for badge info.
class _BadgeInfo {
  final String label;
  final Color color;

  const _BadgeInfo({required this.label, required this.color});
}

/// Expandable tile for reviewing a single question result.
class _QuestionReviewTile extends StatelessWidget {
  final int index;
  final Map<String, dynamic> detail;

  const _QuestionReviewTile({
    required this.index,
    required this.detail,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final selectedAnswer = detail['selectedAnswer'] as String?;
    final correctAnswer = detail['correctAnswer'] as String? ?? '?';
    final isCorrect = detail['isCorrect'] as bool? ?? false;
    final explanation = detail['explanation'] as String? ?? '';
    final questionText = detail['questionText'] as String? ?? '';

    // Determine status for color coding
    final bool isSkipped = selectedAnswer == null;
    final Color statusColor;
    final IconData statusIcon;
    final String statusLabel;

    if (isSkipped) {
      statusColor = Colors.grey;
      statusIcon = Icons.remove_circle_outline;
      statusLabel = 'Skipped';
    } else if (isCorrect) {
      statusColor = Colors.green;
      statusIcon = Icons.check_circle;
      statusLabel = 'Correct';
    } else {
      statusColor = Colors.redAccent;
      statusIcon = Icons.cancel;
      statusLabel = 'Incorrect';
    }

    // Abbreviate question text for display
    final displayText = questionText.isNotEmpty
        ? (questionText.length > 80
            ? '${questionText.substring(0, 80)}...'
            : questionText)
        : 'Question ${index + 1}';

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      child: Theme(
        data: theme.copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          leading: Semantics(
            label: 'Question ${index + 1}: $statusLabel',
            child: Icon(statusIcon, color: statusColor, size: 24),
          ),
          title: Text(
            'Q${index + 1}',
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          subtitle: Text(
            displayText,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.bodySmall?.copyWith(
              color: Colors.grey[600],
            ),
          ),
          trailing: _AnswerBadge(
            selectedAnswer: selectedAnswer,
            correctAnswer: correctAnswer,
            isCorrect: isCorrect,
          ),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (questionText.isNotEmpty) ...[
                    Text(
                      questionText,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                  // Student answer row
                  _AnswerRow(
                    label: 'Your answer:',
                    value: isSkipped ? 'Skipped' : selectedAnswer!,
                    color: isSkipped
                        ? Colors.grey
                        : (isCorrect ? Colors.green : Colors.redAccent),
                    icon: isSkipped
                        ? Icons.horizontal_rule
                        : (isCorrect
                            ? Icons.check_circle_outline
                            : Icons.highlight_off),
                  ),
                  const SizedBox(height: 6),
                  // Correct answer row
                  _AnswerRow(
                    label: 'Correct answer:',
                    value: correctAnswer,
                    color: Colors.green,
                    icon: Icons.check_circle,
                  ),
                  if (explanation.isNotEmpty) ...[
                    const Divider(height: 20),
                    Text(
                      'Explanation',
                      style: theme.textTheme.labelLarge?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      explanation,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        height: 1.5,
                        color: Colors.grey[700],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Compact badge showing the student's answer and the correct answer.
class _AnswerBadge extends StatelessWidget {
  final String? selectedAnswer;
  final String correctAnswer;
  final bool isCorrect;

  const _AnswerBadge({
    required this.selectedAnswer,
    required this.correctAnswer,
    required this.isCorrect,
  });

  @override
  Widget build(BuildContext context) {
    if (selectedAnswer == null) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: Colors.grey.withOpacity(0.15),
          borderRadius: BorderRadius.circular(6),
        ),
        child: const Text(
          '—',
          style: TextStyle(
            color: Colors.grey,
            fontWeight: FontWeight.bold,
            fontSize: 14,
          ),
        ),
      );
    }

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Student answer
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: isCorrect
                ? Colors.green.withOpacity(0.15)
                : Colors.redAccent.withOpacity(0.15),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text(
            selectedAnswer!,
            style: TextStyle(
              color: isCorrect ? Colors.green : Colors.redAccent,
              fontWeight: FontWeight.bold,
              fontSize: 14,
            ),
            semanticsLabel:
                'Selected $selectedAnswer, ${isCorrect ? 'correct' : 'incorrect'}',
          ),
        ),
        if (!isCorrect) ...[
          const SizedBox(width: 4),
          const Icon(Icons.arrow_forward, size: 14, color: Colors.grey),
          const SizedBox(width: 4),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: Colors.green.withOpacity(0.15),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              correctAnswer,
              style: const TextStyle(
                color: Colors.green,
                fontWeight: FontWeight.bold,
                fontSize: 14,
              ),
              semanticsLabel: 'Correct answer is $correctAnswer',
            ),
          ),
        ],
      ],
    );
  }
}

/// Row showing a labeled answer value with icon and color.
class _AnswerRow extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  final IconData icon;

  const _AnswerRow({
    required this.label,
    required this.value,
    required this.color,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '$label $value',
      child: Row(
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 8),
          Text(
            label,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w500,
                ),
          ),
          const SizedBox(width: 8),
          Text(
            value,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: color,
                ),
          ),
        ],
      ),
    );
  }
}

/// Action buttons: Practice Again and Go Home.
class _ActionButtons extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 4,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            FilledButton.icon(
              onPressed: () => _navigateToFullTest(context),
              icon: const Icon(Icons.replay),
              label: const Text('Practice Again'),
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: () => _navigateToHome(context),
              icon: const Icon(Icons.home_outlined),
              label: const Text('Go Home'),
            ),
          ],
        ),
      ),
    );
  }

  void _navigateToFullTest(BuildContext context) {
    Navigator.of(context).pushNamedAndRemoveUntil(
      AppRouter.fullTest,
      (route) => route.settings.name == AppRouter.home,
    );
  }

  void _navigateToHome(BuildContext context) {
    Navigator.of(context).pushNamedAndRemoveUntil(
      AppRouter.home,
      (route) => false,
    );
  }
}
