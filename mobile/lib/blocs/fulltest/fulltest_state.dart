import 'package:equatable/equatable.dart';

import '../../services/session_storage_service.dart';

/// States for the FullTestBloc.
abstract class FullTestState extends Equatable {
  const FullTestState();

  @override
  List<Object?> get props => [];
}

/// Initial state before any test is started.
class FullTestInitial extends FullTestState {
  const FullTestInitial();
}

/// Loading state while fetching questions from the API.
class FullTestLoading extends FullTestState {
  const FullTestLoading();
}

/// Active test state with questions, answers, and timer.
class FullTestActive extends FullTestState {
  /// List of question data maps from the API.
  final List<Map<String, dynamic>> questions;

  /// Map of questionIndex -> selected answer (A, B, C, or D).
  /// Null entries mean the question is unanswered.
  final Map<int, String> answers;

  /// Currently displayed question index (0-based).
  final int currentIndex;

  /// Time remaining in seconds for the countdown timer.
  final int timeRemainingSeconds;

  /// The section being tested.
  final String section;

  /// The session ID from the backend.
  final String sessionId;

  const FullTestActive({
    required this.questions,
    required this.answers,
    required this.currentIndex,
    required this.timeRemainingSeconds,
    required this.section,
    required this.sessionId,
  });

  /// Formatted time remaining as MM:SS.
  String get formattedTime {
    final minutes = timeRemainingSeconds ~/ 60;
    final seconds = timeRemainingSeconds % 60;
    return '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }

  /// Number of answered questions.
  int get answeredCount => answers.length;

  /// Total number of questions.
  int get totalQuestions => questions.length;

  /// Whether a specific question has been answered.
  bool isAnswered(int index) => answers.containsKey(index);

  @override
  List<Object?> get props => [
        questions,
        answers,
        currentIndex,
        timeRemainingSeconds,
        section,
        sessionId,
      ];

  /// Create a copy with updated fields.
  FullTestActive copyWith({
    List<Map<String, dynamic>>? questions,
    Map<int, String>? answers,
    int? currentIndex,
    int? timeRemainingSeconds,
    String? section,
    String? sessionId,
  }) {
    return FullTestActive(
      questions: questions ?? this.questions,
      answers: answers ?? this.answers,
      currentIndex: currentIndex ?? this.currentIndex,
      timeRemainingSeconds: timeRemainingSeconds ?? this.timeRemainingSeconds,
      section: section ?? this.section,
      sessionId: sessionId ?? this.sessionId,
    );
  }
}

/// State while submitting the test to the backend.
class FullTestSubmitting extends FullTestState {
  const FullTestSubmitting();
}

/// State after test is submitted and scored.
class FullTestCompleted extends FullTestState {
  /// Score summary returned from the backend.
  final Map<String, dynamic> scoreSummary;

  const FullTestCompleted({required this.scoreSummary});

  @override
  List<Object?> get props => [scoreSummary];
}

/// Error state.
class FullTestError extends FullTestState {
  final String message;

  const FullTestError({required this.message});

  @override
  List<Object?> get props => [message];
}

/// State representing that the session was interrupted and saved locally.
class FullTestInterrupted extends FullTestState {
  final String sessionId;
  final String message;

  const FullTestInterrupted({
    required this.sessionId,
    this.message = 'Your session has been saved. You can resume within 24 hours.',
  });

  @override
  List<Object?> get props => [sessionId, message];
}

/// State showing a list of interrupted sessions available for resume.
class InterruptedSessionsLoaded extends FullTestState {
  final List<InterruptedSession> sessions;

  const InterruptedSessionsLoaded({required this.sessions});

  @override
  List<Object?> get props => [sessions];
}
