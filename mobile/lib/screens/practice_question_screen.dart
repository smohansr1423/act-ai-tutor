import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../blocs/practice/practice_bloc.dart';

/// Screen displaying individual practice questions with:
/// - Question text display
/// - 4 answer choices (A, B, C, D) as selectable cards
/// - Elapsed timer
/// - Hint button (enabled before submission)
/// - Explain button (disabled until submission)
/// - Submit button (enabled only when an option is selected)
/// - Correct/incorrect feedback after submission
class PracticeQuestionScreen extends StatelessWidget {
  const PracticeQuestionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<PracticeBloc, PracticeState>(
      listener: (context, state) {
        if (state is PracticeSessionEnded) {
          _showSessionSummary(context, state);
        } else if (state is PracticeError) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(state.message),
              backgroundColor: Theme.of(context).colorScheme.error,
            ),
          );
        }
      },
      builder: (context, state) {
        if (state is PracticeLoading) {
          return Scaffold(
            appBar: AppBar(title: const Text('Practice')),
            body: const Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  CircularProgressIndicator(),
                  SizedBox(height: 16),
                  Text('Loading question...'),
                ],
              ),
            ),
          );
        }

        if (state is PracticeQuestion) {
          return _QuestionView(state: state);
        }

        if (state is PracticeResult) {
          return _ResultView(state: state);
        }

        // Fallback for unexpected states
        return Scaffold(
          appBar: AppBar(title: const Text('Practice')),
          body: const Center(child: Text('Loading...')),
        );
      },
    );
  }

  void _showSessionSummary(BuildContext context, PracticeSessionEnded state) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => AlertDialog(
        title: const Text('Session Complete'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _SummaryRow(
              label: 'Total Questions',
              value: '${state.totalQuestions}',
            ),
            const SizedBox(height: 8),
            _SummaryRow(
              label: 'Correct Answers',
              value: '${state.correctAnswers}',
            ),
            const SizedBox(height: 8),
            _SummaryRow(
              label: 'Accuracy',
              value: '${(state.accuracy * 100).toStringAsFixed(1)}%',
            ),
            const SizedBox(height: 8),
            _SummaryRow(
              label: 'Avg Time',
              value: '${state.averageTimeSeconds.toStringAsFixed(1)}s',
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(context).pop(); // close dialog
              Navigator.of(context).pop(); // go back to section selection
            },
            child: const Text('Done'),
          ),
        ],
      ),
    );
  }
}

/// View for displaying a question with answer choices.
class _QuestionView extends StatelessWidget {
  final PracticeQuestion state;

  const _QuestionView({required this.state});

  @override
  Widget build(BuildContext context) {
    final question = state.question;
    final labels = ['A', 'B', 'C', 'D'];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Practice'),
        actions: [
          // Elapsed timer display
          Padding(
            padding: const EdgeInsets.only(right: 16.0),
            child: Center(
              child: Semantics(
                label: 'Elapsed time: ${state.elapsedSeconds} seconds',
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.timer_outlined, size: 18),
                    const SizedBox(width: 4),
                    Text(
                      _formatTime(state.elapsedSeconds),
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Question text
                    if (question.passage != null &&
                        question.passage!.isNotEmpty) ...[
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Theme.of(context)
                              .colorScheme
                              .surfaceVariant
                              .withOpacity(0.5),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          question.passage!,
                          style: Theme.of(context).textTheme.bodyMedium,
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],
                    Text(
                      question.questionText,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w500,
                            height: 1.4,
                          ),
                    ),
                    const SizedBox(height: 24),

                    // Answer choices
                    ...List.generate(question.options.length, (index) {
                      final label = labels[index];
                      final optionText = question.options[index];
                      final isSelected = state.selectedOption == label;

                      return Padding(
                        padding: const EdgeInsets.only(bottom: 12.0),
                        child: _OptionCard(
                          label: label,
                          text: optionText,
                          isSelected: isSelected,
                          onTap: () {
                            context
                                .read<PracticeBloc>()
                                .add(SelectOption(selectedOption: label));
                          },
                        ),
                      );
                    }),

                    // Hint text display
                    if (state.hintText != null) ...[
                      const SizedBox(height: 16),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.amber.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                            color: Colors.amber.withOpacity(0.3),
                          ),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Icon(
                              Icons.lightbulb_outline,
                              color: Colors.amber,
                              size: 20,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                state.hintText!,
                                style: Theme.of(context).textTheme.bodyMedium,
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

            // Bottom action buttons
            _QuestionActionBar(
              hasSelection: state.selectedOption != null,
              isHintLoading: state.isHintLoading,
              hasHint: state.hintText != null,
            ),
          ],
        ),
      ),
    );
  }

  String _formatTime(int seconds) {
    final minutes = seconds ~/ 60;
    final secs = seconds % 60;
    return '${minutes.toString().padLeft(2, '0')}:${secs.toString().padLeft(2, '0')}';
  }
}

/// Bottom action bar with Submit, Hint, and End Session buttons.
class _QuestionActionBar extends StatelessWidget {
  final bool hasSelection;
  final bool isHintLoading;
  final bool hasHint;

  const _QuestionActionBar({
    required this.hasSelection,
    required this.isHintLoading,
    required this.hasHint,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 8,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: Row(
        children: [
          // Hint button
          OutlinedButton.icon(
            onPressed: isHintLoading || hasHint
                ? null
                : () {
                    context.read<PracticeBloc>().add(const RequestHint());
                  },
            icon: isHintLoading
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.lightbulb_outline, size: 18),
            label: const Text('Hint'),
          ),
          const SizedBox(width: 8),
          // Explain button (disabled before submission)
          OutlinedButton.icon(
            onPressed: null, // Disabled until submission
            icon: const Icon(Icons.help_outline, size: 18),
            label: const Text('Explain'),
          ),
          const Spacer(),
          // Submit button
          FilledButton(
            onPressed: hasSelection
                ? () {
                    final bloc = context.read<PracticeBloc>();
                    final currentState = bloc.state;
                    if (currentState is PracticeQuestion &&
                        currentState.selectedOption != null) {
                      bloc.add(SubmitAnswer(
                        selectedOption: currentState.selectedOption!,
                      ));
                    }
                  }
                : null,
            child: const Text('Submit'),
          ),
        ],
      ),
    );
  }
}

/// Selectable answer option card.
class _OptionCard extends StatelessWidget {
  final String label;
  final String text;
  final bool isSelected;
  final VoidCallback onTap;

  const _OptionCard({
    required this.label,
    required this.text,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Semantics(
      label: 'Option $label: $text${isSelected ? ", selected" : ""}',
      selected: isSelected,
      child: Material(
        color: isSelected
            ? colorScheme.primaryContainer
            : colorScheme.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(
            color: isSelected
                ? colorScheme.primary
                : colorScheme.outline.withOpacity(0.3),
            width: isSelected ? 2 : 1,
          ),
        ),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 14,
            ),
            child: Row(
              children: [
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isSelected
                        ? colorScheme.primary
                        : colorScheme.surfaceVariant,
                  ),
                  child: Center(
                    child: Text(
                      label,
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        color: isSelected
                            ? colorScheme.onPrimary
                            : colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    text,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: isSelected
                              ? colorScheme.onPrimaryContainer
                              : colorScheme.onSurface,
                        ),
                  ),
                ),
                if (isSelected)
                  Icon(
                    Icons.check_circle,
                    color: colorScheme.primary,
                    size: 20,
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Result view shown after answer submission.
class _ResultView extends StatelessWidget {
  final PracticeResult state;

  const _ResultView({required this.state});

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final isCorrect = state.isCorrect;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Practice'),
        automaticallyImplyLeading: false,
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Result banner
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: isCorrect
                            ? Colors.green.withOpacity(0.1)
                            : Colors.red.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: isCorrect
                              ? Colors.green.withOpacity(0.3)
                              : Colors.red.withOpacity(0.3),
                        ),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            isCorrect
                                ? Icons.check_circle_rounded
                                : Icons.cancel_rounded,
                            color: isCorrect ? Colors.green : Colors.red,
                            size: 32,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  isCorrect ? 'Correct!' : 'Incorrect',
                                  style: Theme.of(context)
                                      .textTheme
                                      .titleMedium
                                      ?.copyWith(
                                        fontWeight: FontWeight.bold,
                                        color: isCorrect
                                            ? Colors.green.shade700
                                            : Colors.red.shade700,
                                      ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  isCorrect
                                      ? 'Great job! Keep it up.'
                                      : 'Your answer: ${state.selectedAnswer} | Correct: ${state.correctAnswer}',
                                  style: Theme.of(context)
                                      .textTheme
                                      .bodySmall
                                      ?.copyWith(
                                        color: isCorrect
                                            ? Colors.green.shade600
                                            : Colors.red.shade600,
                                      ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Question recap
                    Text(
                      'Question',
                      style: Theme.of(context).textTheme.labelLarge?.copyWith(
                            color: colorScheme.onSurface.withOpacity(0.6),
                          ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      state.question.questionText,
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                    const SizedBox(height: 24),

                    // Explanation
                    Text(
                      'Explanation',
                      style: Theme.of(context).textTheme.labelLarge?.copyWith(
                            color: colorScheme.onSurface.withOpacity(0.6),
                          ),
                    ),
                    const SizedBox(height: 8),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: colorScheme.surfaceVariant.withOpacity(0.5),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        state.explanation,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              height: 1.5,
                            ),
                      ),
                    ),

                    // Strategy tip for correct answers
                    if (isCorrect && state.strategyTip != null) ...[
                      const SizedBox(height: 24),
                      Text(
                        'Strategy Tip',
                        style:
                            Theme.of(context).textTheme.labelLarge?.copyWith(
                                  color:
                                      colorScheme.onSurface.withOpacity(0.6),
                                ),
                      ),
                      const SizedBox(height: 8),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.blue.withOpacity(0.05),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                            color: Colors.blue.withOpacity(0.2),
                          ),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Icon(
                              Icons.tips_and_updates_outlined,
                              color: Colors.blue,
                              size: 20,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                state.strategyTip!,
                                style: Theme.of(context)
                                    .textTheme
                                    .bodyMedium
                                    ?.copyWith(height: 1.5),
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

            // Bottom buttons
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: colorScheme.surface,
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.05),
                    blurRadius: 8,
                    offset: const Offset(0, -2),
                  ),
                ],
              ),
              child: Row(
                children: [
                  OutlinedButton(
                    onPressed: () {
                      context
                          .read<PracticeBloc>()
                          .add(const EndSession());
                    },
                    child: const Text('End Session'),
                  ),
                  const Spacer(),
                  FilledButton.icon(
                    onPressed: () {
                      context
                          .read<PracticeBloc>()
                          .add(const NextQuestion());
                    },
                    icon: const Icon(Icons.arrow_forward, size: 18),
                    label: const Text('Next Question'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Summary row widget for session-end dialog.
class _SummaryRow extends StatelessWidget {
  final String label;
  final String value;

  const _SummaryRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: Theme.of(context).textTheme.bodyMedium),
        Text(
          value,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
        ),
      ],
    );
  }
}
