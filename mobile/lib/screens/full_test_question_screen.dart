import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../blocs/fulltest/fulltest_bloc.dart';
import '../services/api_service.dart';
import '../services/session_storage_service.dart';
import '../utils/app_router.dart';

/// Full Test question screen with countdown timer, question navigation,
/// answer selection (no correctness feedback), and submit functionality.
///
/// Handles app lifecycle interruptions by saving progress locally when
/// the app is backgrounded or closed.
///
/// Requirements: 4.5, 4.8, 4.9, 9.6, 9.7
/// Property 27: No feedback during full test.
class FullTestQuestionScreen extends StatelessWidget {
  const FullTestQuestionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    // Get the section from route arguments — can be a String (new test)
    // or null when resuming (already handled by the bloc).
    final args = ModalRoute.of(context)?.settings.arguments;
    final section = args is String ? args : null;

    return BlocProvider(
      create: (context) {
        final bloc = FullTestBloc(
          apiService: context.read<ApiService>(),
          sessionStorageService: SessionStorageService(),
        );
        // Only start a new test if a section was passed.
        // Resume flows dispatch ResumeTest before navigating here.
        if (section != null) {
          bloc.add(StartFullTest(section: section));
        }
        return bloc;
      },
      child: const _FullTestQuestionBody(),
    );
  }
}

/// Wraps the test body with lifecycle observation for session interruption.
class _FullTestQuestionBody extends StatefulWidget {
  const _FullTestQuestionBody();

  @override
  State<_FullTestQuestionBody> createState() => _FullTestQuestionBodyState();
}

class _FullTestQuestionBodyState extends State<_FullTestQuestionBody>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    super.didChangeAppLifecycleState(state);
    // Detect when the app is paused (backgrounded) or detached (closing)
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached) {
      final bloc = context.read<FullTestBloc>();
      final currentState = bloc.state;
      if (currentState is FullTestActive) {
        bloc.add(const AppLifecycleInterrupted());
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<FullTestBloc, FullTestState>(
      listener: (context, state) {
        if (state is FullTestCompleted) {
          Navigator.of(context).pushReplacementNamed(
            AppRouter.fullTestSummary,
            arguments: state.scoreSummary,
          );
        }
        if (state is FullTestInterrupted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(state.message),
              duration: const Duration(seconds: 3),
            ),
          );
          Navigator.of(context).pushReplacementNamed(AppRouter.fullTest);
        }
        if (state is FullTestError) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(state.message),
              backgroundColor: Colors.red,
            ),
          );
        }
      },
      builder: (context, state) {
        if (state is FullTestLoading) {
          return const Scaffold(
            body: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  CircularProgressIndicator(),
                  SizedBox(height: 16),
                  Text('Loading test questions...'),
                ],
              ),
            ),
          );
        }

        if (state is FullTestSubmitting) {
          return const Scaffold(
            body: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  CircularProgressIndicator(),
                  SizedBox(height: 16),
                  Text('Submitting test...'),
                ],
              ),
            ),
          );
        }

        if (state is FullTestActive) {
          return _ActiveTestScaffold(state: state);
        }

        if (state is FullTestError) {
          return Scaffold(
            appBar: AppBar(title: const Text('Full Test')),
            body: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.error_outline, size: 48, color: Colors.red),
                  const SizedBox(height: 16),
                  Text(state.message),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('Go Back'),
                  ),
                ],
              ),
            ),
          );
        }

        return const Scaffold(
          body: Center(child: CircularProgressIndicator()),
        );
      },
    );
  }
}

/// Main scaffold for the active test.
class _ActiveTestScaffold extends StatelessWidget {
  final FullTestActive state;

  const _ActiveTestScaffold({required this.state});

  @override
  Widget build(BuildContext context) {
    final currentQuestion = state.questions[state.currentIndex];
    final selectedAnswer = state.answers[state.currentIndex];

    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: _TimerDisplay(formattedTime: state.formattedTime),
        actions: [
          IconButton(
            icon: const Icon(Icons.grid_view),
            onPressed: () => _showQuestionGrid(context),
            tooltip: 'Question Navigator',
            semanticLabel: 'Open question navigator grid',
          ),
          TextButton(
            onPressed: () => _showSubmitConfirmation(context),
            child: const Text(
              'Submit',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Progress indicator
            _ProgressBar(state: state),
            // Question content
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16.0),
                child: _QuestionContent(
                  question: currentQuestion,
                  selectedAnswer: selectedAnswer,
                  questionIndex: state.currentIndex,
                ),
              ),
            ),
            // Navigation controls
            _NavigationBar(state: state),
          ],
        ),
      ),
    );
  }

  void _showQuestionGrid(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => BlocProvider.value(
        value: context.read<FullTestBloc>(),
        child: _QuestionGridSheet(state: state),
      ),
    );
  }

  void _showSubmitConfirmation(BuildContext context) {
    final unansweredCount = state.totalQuestions - state.answeredCount;

    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Submit Test?'),
        content: Text(
          unansweredCount > 0
              ? 'You have $unansweredCount unanswered question${unansweredCount == 1 ? '' : 's'}. '
                  'Unanswered questions will be marked as skipped.\n\n'
                  'Are you sure you want to submit?'
              : 'Are you sure you want to submit your test?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.of(dialogContext).pop();
              context.read<FullTestBloc>().add(const SubmitTest());
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
            ),
            child: const Text('Submit'),
          ),
        ],
      ),
    );
  }
}

/// Countdown timer display in MM:SS format.
class _TimerDisplay extends StatelessWidget {
  final String formattedTime;

  const _TimerDisplay({required this.formattedTime});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Time remaining: $formattedTime',
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.timer, size: 20),
          const SizedBox(width: 6),
          Text(
            formattedTime,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              fontFeatures: [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}

/// Progress bar showing current position.
class _ProgressBar extends StatelessWidget {
  final FullTestActive state;

  const _ProgressBar({required this.state});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      child: Row(
        children: [
          Text(
            'Question ${state.currentIndex + 1} of ${state.totalQuestions}',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w500,
                ),
          ),
          const Spacer(),
          Text(
            '${state.answeredCount} answered',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Colors.grey[600],
                ),
          ),
        ],
      ),
    );
  }
}

/// Question content with text and answer options.
/// No correctness feedback is shown during the test (Property 27).
class _QuestionContent extends StatelessWidget {
  final Map<String, dynamic> question;
  final String? selectedAnswer;
  final int questionIndex;

  const _QuestionContent({
    required this.question,
    required this.selectedAnswer,
    required this.questionIndex,
  });

  @override
  Widget build(BuildContext context) {
    final questionText = question['questionText'] as String? ?? '';
    final options = question['options'] as List<dynamic>? ?? [];
    final labels = ['A', 'B', 'C', 'D'];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Question text
        Text(
          questionText,
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                height: 1.5,
              ),
        ),
        const SizedBox(height: 24),
        // Answer options — highlight only, no correctness feedback
        ...List.generate(
          options.length.clamp(0, 4),
          (i) {
            final label = labels[i];
            final optionText = options[i] is String
                ? options[i] as String
                : (options[i] as Map<String, dynamic>)['text'] as String? ?? '';
            final isSelected = selectedAnswer == label;

            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: _AnswerOption(
                label: label,
                text: optionText,
                isSelected: isSelected,
                onTap: () {
                  context.read<FullTestBloc>().add(SelectAnswer(
                        questionIndex: questionIndex,
                        answer: label,
                      ));
                },
              ),
            );
          },
        ),
      ],
    );
  }
}

/// A single answer option (A, B, C, or D).
/// Only shows selection highlight — no correct/incorrect indication.
class _AnswerOption extends StatelessWidget {
  final String label;
  final String text;
  final bool isSelected;
  final VoidCallback onTap;

  const _AnswerOption({
    required this.label,
    required this.text,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Semantics(
      label: 'Option $label: $text${isSelected ? ', selected' : ''}',
      button: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: isSelected
                ? colorScheme.primaryContainer
                : colorScheme.surface,
            border: Border.all(
              color: isSelected ? colorScheme.primary : Colors.grey[300]!,
              width: isSelected ? 2 : 1,
            ),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: isSelected
                      ? colorScheme.primary
                      : Colors.grey[200],
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: Text(
                  label,
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: isSelected ? Colors.white : Colors.grey[700],
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  text,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        fontWeight:
                            isSelected ? FontWeight.w600 : FontWeight.normal,
                      ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Navigation bar with forward/backward arrows.
class _NavigationBar extends StatelessWidget {
  final FullTestActive state;

  const _NavigationBar({required this.state});

  @override
  Widget build(BuildContext context) {
    final isFirst = state.currentIndex == 0;
    final isLast = state.currentIndex == state.totalQuestions - 1;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
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
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // Backward button
          IconButton.outlined(
            onPressed: isFirst
                ? null
                : () {
                    context.read<FullTestBloc>().add(
                          NavigateToQuestion(index: state.currentIndex - 1),
                        );
                  },
            icon: const Icon(Icons.arrow_back),
            tooltip: 'Previous question',
          ),
          // Question position text
          Text(
            '${state.currentIndex + 1} / ${state.totalQuestions}',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          // Forward button
          IconButton.outlined(
            onPressed: isLast
                ? null
                : () {
                    context.read<FullTestBloc>().add(
                          NavigateToQuestion(index: state.currentIndex + 1),
                        );
                  },
            icon: const Icon(Icons.arrow_forward),
            tooltip: 'Next question',
          ),
        ],
      ),
    );
  }
}

/// Bottom sheet showing a grid of question numbers.
/// Displays answered/unanswered status for each question.
class _QuestionGridSheet extends StatelessWidget {
  final FullTestActive state;

  const _QuestionGridSheet({required this.state});

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.5,
      minChildSize: 0.3,
      maxChildSize: 0.8,
      expand: false,
      builder: (context, scrollController) {
        return Column(
          children: [
            // Handle bar
            Container(
              margin: const EdgeInsets.only(top: 12, bottom: 8),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey[300],
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            // Title
            Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: [
                  Text(
                    'Question Navigator',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                  ),
                  const Spacer(),
                  _LegendDot(
                    color: Theme.of(context).colorScheme.primary,
                    label: 'Answered',
                  ),
                  const SizedBox(width: 12),
                  _LegendDot(
                    color: Colors.grey[300]!,
                    label: 'Unanswered',
                  ),
                ],
              ),
            ),
            const Divider(),
            // Grid
            Expanded(
              child: GridView.builder(
                controller: scrollController,
                padding: const EdgeInsets.all(16),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 6,
                  mainAxisSpacing: 8,
                  crossAxisSpacing: 8,
                ),
                itemCount: state.totalQuestions,
                itemBuilder: (context, index) {
                  final isAnswered = state.isAnswered(index);
                  final isCurrent = index == state.currentIndex;

                  return _QuestionGridItem(
                    number: index + 1,
                    isAnswered: isAnswered,
                    isCurrent: isCurrent,
                    onTap: () {
                      context
                          .read<FullTestBloc>()
                          .add(NavigateToQuestion(index: index));
                      Navigator.of(context).pop();
                    },
                  );
                },
              ),
            ),
          ],
        );
      },
    );
  }
}

/// Individual question number in the grid.
class _QuestionGridItem extends StatelessWidget {
  final int number;
  final bool isAnswered;
  final bool isCurrent;
  final VoidCallback onTap;

  const _QuestionGridItem({
    required this.number,
    required this.isAnswered,
    required this.isCurrent,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    Color backgroundColor;
    Color textColor;
    Border? border;

    if (isCurrent) {
      backgroundColor = colorScheme.primary;
      textColor = Colors.white;
      border = null;
    } else if (isAnswered) {
      backgroundColor = colorScheme.primaryContainer;
      textColor = colorScheme.onPrimaryContainer;
      border = null;
    } else {
      backgroundColor = Colors.grey[100]!;
      textColor = Colors.grey[700]!;
      border = Border.all(color: Colors.grey[300]!);
    }

    return Semantics(
      label: 'Question $number, ${isAnswered ? 'answered' : 'unanswered'}'
          '${isCurrent ? ', current' : ''}',
      button: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(6),
        child: Container(
          decoration: BoxDecoration(
            color: backgroundColor,
            border: border,
            borderRadius: BorderRadius.circular(6),
          ),
          alignment: Alignment.center,
          child: Text(
            '$number',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: textColor,
            ),
          ),
        ),
      ),
    );
  }
}

/// Legend dot with label for the question grid.
class _LegendDot extends StatelessWidget {
  final Color color;
  final String label;

  const _LegendDot({required this.color, required this.label});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 4),
        Text(label, style: Theme.of(context).textTheme.bodySmall),
      ],
    );
  }
}
