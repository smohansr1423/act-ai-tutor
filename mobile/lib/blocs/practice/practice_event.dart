import 'package:equatable/equatable.dart';
import '../../models/enums.dart';

/// Events for the PracticeBloc.
abstract class PracticeEvent extends Equatable {
  const PracticeEvent();

  @override
  List<Object?> get props => [];
}

/// Start a practice session for a given section.
class StartPracticeSession extends PracticeEvent {
  final SessionSection section;

  const StartPracticeSession({required this.section});

  @override
  List<Object?> get props => [section];
}

/// Submit the selected answer option (A, B, C, or D).
class SubmitAnswer extends PracticeEvent {
  final String selectedOption;

  const SubmitAnswer({required this.selectedOption});

  @override
  List<Object?> get props => [selectedOption];
}

/// Select an answer option (before submission, for visual highlight).
class SelectOption extends PracticeEvent {
  final String selectedOption;

  const SelectOption({required this.selectedOption});

  @override
  List<Object?> get props => [selectedOption];
}

/// Request a hint for the current question.
class RequestHint extends PracticeEvent {
  const RequestHint();
}

/// Request an explanation for the current question (after submission).
class RequestExplanation extends PracticeEvent {
  const RequestExplanation();
}

/// Move to the next question in the session.
class NextQuestion extends PracticeEvent {
  const NextQuestion();
}

/// End the current practice session.
class EndSession extends PracticeEvent {
  const EndSession();
}

/// Timer tick event (fired every second).
class TimerTicked extends PracticeEvent {
  const TimerTicked();
}
