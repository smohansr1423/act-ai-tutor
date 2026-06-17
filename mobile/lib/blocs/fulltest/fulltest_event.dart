import 'package:equatable/equatable.dart';

/// Events for the FullTestBloc.
abstract class FullTestEvent extends Equatable {
  const FullTestEvent();

  @override
  List<Object?> get props => [];
}

/// Start a full test for the given section.
class StartFullTest extends FullTestEvent {
  final String section;

  const StartFullTest({required this.section});

  @override
  List<Object?> get props => [section];
}

/// Resume an interrupted test session by sessionId.
class ResumeTest extends FullTestEvent {
  final String sessionId;

  const ResumeTest({required this.sessionId});

  @override
  List<Object?> get props => [sessionId];
}

/// Select an answer for a question at the given index.
class SelectAnswer extends FullTestEvent {
  final int questionIndex;
  final String answer;

  const SelectAnswer({required this.questionIndex, required this.answer});

  @override
  List<Object?> get props => [questionIndex, answer];
}

/// Navigate to a specific question by index.
class NavigateToQuestion extends FullTestEvent {
  final int index;

  const NavigateToQuestion({required this.index});

  @override
  List<Object?> get props => [index];
}

/// Submit the test (early submission or auto-submit on timer expiry).
class SubmitTest extends FullTestEvent {
  const SubmitTest();
}

/// Save current progress (for interrupted sessions).
class SaveProgress extends FullTestEvent {
  const SaveProgress();
}

/// Internal event: timer tick (decrements time remaining).
/// This is public so it can be used from the bloc file, but should be treated
/// as internal — not dispatched from UI code.
class TimerTicked extends FullTestEvent {
  const TimerTicked();
}

/// Event triggered when connectivity is lost during a test.
class ConnectivityLost extends FullTestEvent {
  const ConnectivityLost();
}

/// Event triggered when the app is sent to background or is about to exit.
class AppLifecycleInterrupted extends FullTestEvent {
  const AppLifecycleInterrupted();
}

/// Event to load interrupted sessions for the resume screen.
class LoadInterruptedSessions extends FullTestEvent {
  const LoadInterruptedSessions();
}

/// Event to dismiss/discard an interrupted session.
class DismissInterruptedSession extends FullTestEvent {
  final String sessionId;

  const DismissInterruptedSession({required this.sessionId});

  @override
  List<Object?> get props => [sessionId];
}
