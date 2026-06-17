import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';

import '../../models/enums.dart';
import '../../models/question.dart';
import '../../services/api_service.dart';
import 'practice_event.dart';
import 'practice_state.dart';

export 'practice_event.dart';
export 'practice_state.dart';

/// BLoC managing practice session state, including:
/// - Starting/ending sessions
/// - Submitting answers and getting feedback
/// - Elapsed time tracking
/// - Hint requests
class PracticeBloc extends Bloc<PracticeEvent, PracticeState> {
  final ApiService apiService;

  Timer? _timer;
  int _elapsedSeconds = 0;
  String? _sessionId;
  SessionSection? _currentSection;
  Question? _currentQuestion;

  // Session tracking for summary
  int _totalQuestions = 0;
  int _correctAnswers = 0;
  final List<double> _timeTakenPerQuestion = [];

  PracticeBloc({required this.apiService}) : super(const PracticeInitial()) {
    on<StartPracticeSession>(_onStartSession);
    on<SelectOption>(_onSelectOption);
    on<SubmitAnswer>(_onSubmitAnswer);
    on<RequestHint>(_onRequestHint);
    on<RequestExplanation>(_onRequestExplanation);
    on<NextQuestion>(_onNextQuestion);
    on<EndSession>(_onEndSession);
    on<TimerTicked>(_onTimerTicked);
  }

  /// Start a new practice session for the given section.
  Future<void> _onStartSession(
    StartPracticeSession event,
    Emitter<PracticeState> emit,
  ) async {
    emit(const PracticeLoading());
    _resetSessionTracking();
    _currentSection = event.section;

    try {
      final response = await apiService.post(
        '/sessions/practice/start',
        body: {
          'section': event.section.value,
          'mode': 'practice',
        },
      );

      _sessionId = response['sessionId'] as String?;
      final questionJson = response['firstQuestion'] as Map<String, dynamic>?;

      if (questionJson != null) {
        _currentQuestion = Question.fromJson(questionJson);
        _startTimer();
        emit(PracticeQuestion(
          question: _currentQuestion!,
          elapsedSeconds: 0,
        ));
      } else {
        emit(const PracticeError(
          message: 'No questions available for this section.',
        ));
      }
    } on ApiException catch (e) {
      emit(PracticeError(message: e.message));
    } catch (e) {
      emit(const PracticeError(
        message: 'Failed to start practice session. Please try again.',
      ));
    }
  }

  /// Handle option selection (visual highlight before submission).
  void _onSelectOption(
    SelectOption event,
    Emitter<PracticeState> emit,
  ) {
    final currentState = state;
    if (currentState is PracticeQuestion) {
      emit(currentState.copyWith(selectedOption: event.selectedOption));
    }
  }

  /// Submit the selected answer to the backend.
  Future<void> _onSubmitAnswer(
    SubmitAnswer event,
    Emitter<PracticeState> emit,
  ) async {
    final currentState = state;
    if (currentState is! PracticeQuestion || _currentQuestion == null) return;

    _stopTimer();
    final timeTaken = _elapsedSeconds.toDouble();
    _timeTakenPerQuestion.add(timeTaken);
    _totalQuestions++;

    try {
      final response = await apiService.post(
        '/sessions/practice/submit',
        body: {
          'sessionId': _sessionId,
          'questionId': _currentQuestion!.questionId,
          'selectedAnswer': event.selectedOption,
          'timeTaken': timeTaken,
        },
      );

      final isCorrect = response['isCorrect'] as bool? ?? false;
      if (isCorrect) _correctAnswers++;

      final explanation = response['explanation'] as String? ??
          _currentQuestion!.explanation;

      emit(PracticeResult(
        isCorrect: isCorrect,
        explanation: explanation,
        correctAnswer: _currentQuestion!.correctAnswer,
        selectedAnswer: event.selectedOption,
        strategyTip: _currentQuestion!.strategyTip,
        question: _currentQuestion!,
      ));
    } on ApiException catch (e) {
      // Fallback: compute locally if API fails
      final isCorrect =
          event.selectedOption == _currentQuestion!.correctAnswer;
      if (isCorrect) _correctAnswers++;

      emit(PracticeResult(
        isCorrect: isCorrect,
        explanation: _currentQuestion!.explanation,
        correctAnswer: _currentQuestion!.correctAnswer,
        selectedAnswer: event.selectedOption,
        strategyTip: _currentQuestion!.strategyTip,
        question: _currentQuestion!,
      ));
    } catch (e) {
      // Fallback: compute locally
      final isCorrect =
          event.selectedOption == _currentQuestion!.correctAnswer;
      if (isCorrect) _correctAnswers++;

      emit(PracticeResult(
        isCorrect: isCorrect,
        explanation: _currentQuestion!.explanation,
        correctAnswer: _currentQuestion!.correctAnswer,
        selectedAnswer: event.selectedOption,
        strategyTip: _currentQuestion!.strategyTip,
        question: _currentQuestion!,
      ));
    }
  }

  /// Request a hint for the current question.
  Future<void> _onRequestHint(
    RequestHint event,
    Emitter<PracticeState> emit,
  ) async {
    final currentState = state;
    if (currentState is! PracticeQuestion || _currentQuestion == null) return;

    emit(currentState.copyWith(isHintLoading: true));

    try {
      final response = await apiService.post(
        '/chat/message',
        body: {
          'sessionId': _sessionId,
          'text': 'Give me a hint for this question.',
        },
      );

      final hint = response['reply'] as String? ?? 'Try eliminating options.';
      emit(currentState.copyWith(hintText: hint, isHintLoading: false));
    } catch (e) {
      // Provide a generic hint on failure
      emit(currentState.copyWith(
        hintText: 'Try eliminating clearly wrong answers first.',
        isHintLoading: false,
      ));
    }
  }

  /// Request explanation - only available after submission (handled by UI).
  void _onRequestExplanation(
    RequestExplanation event,
    Emitter<PracticeState> emit,
  ) {
    // Explanation is already shown in PracticeResult state.
    // This event can be used for additional explanation requests.
  }

  /// Load the next question in the session.
  Future<void> _onNextQuestion(
    NextQuestion event,
    Emitter<PracticeState> emit,
  ) async {
    emit(const PracticeLoading());
    _elapsedSeconds = 0;

    try {
      final response = await apiService.post(
        '/questions/generate',
        body: {
          'section': _currentSection?.value ?? 'mixed',
        },
      );

      _currentQuestion = Question.fromJson(response);
      _startTimer();
      emit(PracticeQuestion(
        question: _currentQuestion!,
        elapsedSeconds: 0,
      ));
    } on ApiException catch (e) {
      emit(PracticeError(message: e.message));
    } catch (e) {
      emit(const PracticeError(
        message: 'Failed to load next question. Please try again.',
      ));
    }
  }

  /// End the current practice session.
  Future<void> _onEndSession(
    EndSession event,
    Emitter<PracticeState> emit,
  ) async {
    _stopTimer();

    if (_sessionId != null) {
      try {
        await apiService.post(
          '/sessions/practice/end',
          body: {'sessionId': _sessionId},
        );
      } catch (_) {
        // Continue even if end-session API call fails
      }
    }

    final avgTime = _timeTakenPerQuestion.isNotEmpty
        ? _timeTakenPerQuestion.reduce((a, b) => a + b) /
            _timeTakenPerQuestion.length
        : 0.0;

    emit(PracticeSessionEnded(
      totalQuestions: _totalQuestions,
      correctAnswers: _correctAnswers,
      averageTimeSeconds: avgTime,
    ));
  }

  /// Handle timer tick (increment elapsed seconds).
  void _onTimerTicked(
    TimerTicked event,
    Emitter<PracticeState> emit,
  ) {
    _elapsedSeconds++;
    final currentState = state;
    if (currentState is PracticeQuestion) {
      emit(currentState.copyWith(elapsedSeconds: _elapsedSeconds));
    }
  }

  /// Start the elapsed time timer.
  void _startTimer() {
    _stopTimer();
    _elapsedSeconds = 0;
    _timer = Timer.periodic(
      const Duration(seconds: 1),
      (_) => add(const TimerTicked()),
    );
  }

  /// Stop the elapsed time timer.
  void _stopTimer() {
    _timer?.cancel();
    _timer = null;
  }

  /// Reset session tracking data.
  void _resetSessionTracking() {
    _totalQuestions = 0;
    _correctAnswers = 0;
    _timeTakenPerQuestion.clear();
    _elapsedSeconds = 0;
    _sessionId = null;
    _currentQuestion = null;
  }

  @override
  Future<void> close() {
    _stopTimer();
    return super.close();
  }
}
