import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';

import '../../services/api_service.dart';
import '../../services/session_storage_service.dart';
import 'fulltest_event.dart';
import 'fulltest_state.dart';

export 'fulltest_event.dart';
export 'fulltest_state.dart';

/// BLoC managing full test session state including countdown timer,
/// question navigation, answer selection, and submission.
///
/// Handles session interruption (exit/connectivity loss) by persisting progress
/// locally and providing resume capability within 24 hours.
///
/// Requirements: 4.9 - Preserve answers on exit/connectivity loss
/// Requirements: 4.10 - Resume within 24 hours, discard expired sessions
class FullTestBloc extends Bloc<FullTestEvent, FullTestState> {
  final ApiService apiService;
  final SessionStorageService sessionStorageService;

  Timer? _timer;

  FullTestBloc({
    required this.apiService,
    SessionStorageService? sessionStorageService,
  })  : sessionStorageService = sessionStorageService ?? SessionStorageService(),
        super(const FullTestInitial()) {
    on<StartFullTest>(_onStartFullTest);
    on<ResumeTest>(_onResumeTest);
    on<SelectAnswer>(_onSelectAnswer);
    on<NavigateToQuestion>(_onNavigateToQuestion);
    on<SubmitTest>(_onSubmitTest);
    on<SaveProgress>(_onSaveProgress);
    on<TimerTicked>(_onTimerTick);
    on<ConnectivityLost>(_onConnectivityLost);
    on<AppLifecycleInterrupted>(_onAppLifecycleInterrupted);
    on<LoadInterruptedSessions>(_onLoadInterruptedSessions);
    on<DismissInterruptedSession>(_onDismissInterruptedSession);
  }

  /// Start a full test session for the given section.
  Future<void> _onStartFullTest(
    StartFullTest event,
    Emitter<FullTestState> emit,
  ) async {
    emit(const FullTestLoading());

    try {
      final response = await apiService.post(
        '/sessions/fulltest/start',
        body: {'section': event.section},
      );

      final sessionId = response['sessionId'] as String;
      final questions =
          (response['questions'] as List).cast<Map<String, dynamic>>();
      final timeLimit = response['timeLimit'] as int; // seconds

      emit(FullTestActive(
        questions: questions,
        answers: const {},
        currentIndex: 0,
        timeRemainingSeconds: timeLimit,
        section: event.section,
        sessionId: sessionId,
      ));

      _startTimer();
    } on ApiException catch (e) {
      emit(FullTestError(message: e.message));
    } catch (e) {
      emit(FullTestError(message: 'Failed to start test. Please try again.'));
    }
  }

  /// Resume an interrupted test session.
  Future<void> _onResumeTest(
    ResumeTest event,
    Emitter<FullTestState> emit,
  ) async {
    emit(const FullTestLoading());

    try {
      // First try resuming from the server
      final response = await apiService.post(
        '/sessions/fulltest/resume',
        body: {'sessionId': event.sessionId},
      );

      final questions =
          (response['questions'] as List).cast<Map<String, dynamic>>();
      final timeRemaining = response['timeRemaining'] as int;
      final currentIndex = response['currentIndex'] as int? ?? 0;
      final section = response['section'] as String? ?? 'english';

      // Restore saved answers from the response.
      final answersRaw = response['answers'] as List<dynamic>? ?? [];
      final answers = <int, String>{};
      for (final entry in answersRaw) {
        if (entry is Map<String, dynamic>) {
          final idx = entry['questionIndex'] as int?;
          final ans = entry['selectedAnswer'] as String?;
          if (idx != null && ans != null) {
            answers[idx] = ans;
          }
        }
      }

      // Successfully resumed — remove from local interrupted sessions
      await sessionStorageService.removeInterruptedSession(event.sessionId);

      emit(FullTestActive(
        questions: questions,
        answers: answers,
        currentIndex: currentIndex,
        timeRemainingSeconds: timeRemaining,
        section: section,
        sessionId: event.sessionId,
      ));

      _startTimer();
    } on ApiException catch (e) {
      // Server resume failed — try restoring from local storage
      final localSession = await _getLocalSession(event.sessionId);
      if (localSession != null && localSession.isResumable) {
        await sessionStorageService
            .removeInterruptedSession(event.sessionId);

        emit(FullTestActive(
          questions: localSession.questions,
          answers: localSession.answers,
          currentIndex: localSession.currentIndex,
          timeRemainingSeconds: localSession.timeRemainingSeconds,
          section: localSession.section,
          sessionId: event.sessionId,
        ));

        _startTimer();
      } else {
        emit(FullTestError(message: e.message));
      }
    } catch (e) {
      // Network or other error — try local fallback
      final localSession = await _getLocalSession(event.sessionId);
      if (localSession != null && localSession.isResumable) {
        await sessionStorageService
            .removeInterruptedSession(event.sessionId);

        emit(FullTestActive(
          questions: localSession.questions,
          answers: localSession.answers,
          currentIndex: localSession.currentIndex,
          timeRemainingSeconds: localSession.timeRemainingSeconds,
          section: localSession.section,
          sessionId: event.sessionId,
        ));

        _startTimer();
      } else {
        emit(FullTestError(
            message: 'Failed to resume test. Please try again.'));
      }
    }
  }

  /// Retrieve a specific session from local storage by ID.
  Future<InterruptedSession?> _getLocalSession(String sessionId) async {
    final sessions = await sessionStorageService.getInterruptedSessions();
    try {
      return sessions.firstWhere((s) => s.sessionId == sessionId);
    } catch (_) {
      return null;
    }
  }

  /// Record a selected answer for the given question index.
  void _onSelectAnswer(
    SelectAnswer event,
    Emitter<FullTestState> emit,
  ) {
    final currentState = state;
    if (currentState is! FullTestActive) return;

    final updatedAnswers = Map<int, String>.from(currentState.answers);
    updatedAnswers[event.questionIndex] = event.answer;

    emit(currentState.copyWith(answers: updatedAnswers));
  }

  /// Navigate to a specific question index.
  void _onNavigateToQuestion(
    NavigateToQuestion event,
    Emitter<FullTestState> emit,
  ) {
    final currentState = state;
    if (currentState is! FullTestActive) return;

    // Clamp index to valid range.
    final clampedIndex =
        event.index.clamp(0, currentState.questions.length - 1);
    emit(currentState.copyWith(currentIndex: clampedIndex));
  }

  /// Submit the test (either manually or on timer expiry).
  Future<void> _onSubmitTest(
    SubmitTest event,
    Emitter<FullTestState> emit,
  ) async {
    final currentState = state;
    if (currentState is! FullTestActive) return;

    _cancelTimer();
    emit(const FullTestSubmitting());

    try {
      // Build answers list for submission.
      final answersList = <Map<String, dynamic>>[];
      for (int i = 0; i < currentState.questions.length; i++) {
        answersList.add({
          'questionIndex': i,
          'selectedAnswer': currentState.answers[i], // null if unanswered
        });
      }

      final response = await apiService.post(
        '/sessions/fulltest/submit',
        body: {
          'sessionId': currentState.sessionId,
          'answers': answersList,
        },
      );

      emit(FullTestCompleted(scoreSummary: response));
    } on ApiException catch (e) {
      emit(FullTestError(message: e.message));
    } catch (e) {
      emit(FullTestError(
          message: 'Failed to submit test. Please try again.'));
    }
  }

  /// Save progress for interrupted sessions.
  Future<void> _onSaveProgress(
    SaveProgress event,
    Emitter<FullTestState> emit,
  ) async {
    final currentState = state;
    if (currentState is! FullTestActive) return;

    try {
      final answersList = <Map<String, dynamic>>[];
      for (final entry in currentState.answers.entries) {
        answersList.add({
          'questionIndex': entry.key,
          'selectedAnswer': entry.value,
        });
      }

      await apiService.post(
        '/sessions/fulltest/save-progress',
        body: {
          'sessionId': currentState.sessionId,
          'answers': answersList,
          'currentIndex': currentState.currentIndex,
        },
      );
    } catch (_) {
      // Silently fail on progress save — non-critical operation.
    }
  }

  /// Handle timer tick — decrement time remaining and auto-submit at zero.
  void _onTimerTick(
    TimerTicked event,
    Emitter<FullTestState> emit,
  ) {
    final currentState = state;
    if (currentState is! FullTestActive) return;

    final newTime = currentState.timeRemainingSeconds - 1;

    if (newTime <= 0) {
      // Timer expired — auto-submit.
      _cancelTimer();
      add(const SubmitTest());
    } else {
      emit(currentState.copyWith(timeRemainingSeconds: newTime));
    }
  }

  /// Start the countdown timer that fires every second.
  void _startTimer() {
    _cancelTimer();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      add(const TimerTicked());
    });
  }

  /// Cancel the countdown timer.
  void _cancelTimer() {
    _timer?.cancel();
    _timer = null;
  }

  /// Handle connectivity loss during a test — save progress locally.
  ///
  /// Requirements: 4.9 - Preserve all answers on connectivity loss
  Future<void> _onConnectivityLost(
    ConnectivityLost event,
    Emitter<FullTestState> emit,
  ) async {
    final currentState = state;
    if (currentState is! FullTestActive) return;

    _cancelTimer();

    // Persist session state locally for resume
    await sessionStorageService.saveInterruptedSession(
      sessionId: currentState.sessionId,
      section: currentState.section,
      questions: currentState.questions,
      answers: currentState.answers,
      currentIndex: currentState.currentIndex,
      timeRemainingSeconds: currentState.timeRemainingSeconds,
    );

    emit(FullTestInterrupted(
      sessionId: currentState.sessionId,
      message:
          'Connection lost. Your progress has been saved. You can resume within 24 hours.',
    ));
  }

  /// Handle app lifecycle interruption (backgrounding or exit).
  ///
  /// Requirements: 4.9 - Preserve all answers on exit
  Future<void> _onAppLifecycleInterrupted(
    AppLifecycleInterrupted event,
    Emitter<FullTestState> emit,
  ) async {
    final currentState = state;
    if (currentState is! FullTestActive) return;

    _cancelTimer();

    // Persist session state locally for resume
    await sessionStorageService.saveInterruptedSession(
      sessionId: currentState.sessionId,
      section: currentState.section,
      questions: currentState.questions,
      answers: currentState.answers,
      currentIndex: currentState.currentIndex,
      timeRemainingSeconds: currentState.timeRemainingSeconds,
    );

    // Also attempt to save progress on the server (fire and forget)
    try {
      final answersList = <Map<String, dynamic>>[];
      for (final entry in currentState.answers.entries) {
        answersList.add({
          'questionIndex': entry.key,
          'selectedAnswer': entry.value,
        });
      }

      await apiService.post(
        '/sessions/fulltest/save-progress',
        body: {
          'sessionId': currentState.sessionId,
          'answers': answersList,
          'currentIndex': currentState.currentIndex,
        },
      );
    } catch (_) {
      // Server save is best-effort; local save is the reliable path
    }

    emit(FullTestInterrupted(
      sessionId: currentState.sessionId,
      message:
          'Your session has been saved. You can resume within 24 hours.',
    ));
  }

  /// Load all interrupted sessions that are still within the 24-hour
  /// resume window. Expired sessions are automatically cleaned up.
  ///
  /// Requirements: 4.10 - Mark sessions as incomplete after 24 hours
  Future<void> _onLoadInterruptedSessions(
    LoadInterruptedSessions event,
    Emitter<FullTestState> emit,
  ) async {
    // Clean up expired sessions first
    await sessionStorageService.cleanExpiredSessions();

    // Load remaining valid sessions
    final sessions = await sessionStorageService.getInterruptedSessions();

    emit(InterruptedSessionsLoaded(sessions: sessions));
  }

  /// Dismiss/discard an interrupted session by removing it from local storage.
  Future<void> _onDismissInterruptedSession(
    DismissInterruptedSession event,
    Emitter<FullTestState> emit,
  ) async {
    await sessionStorageService.removeInterruptedSession(event.sessionId);

    // Reload sessions list
    final sessions = await sessionStorageService.getInterruptedSessions();
    emit(InterruptedSessionsLoaded(sessions: sessions));
  }

  @override
  Future<void> close() {
    _cancelTimer();
    return super.close();
  }
}
