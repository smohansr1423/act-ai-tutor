import 'package:equatable/equatable.dart';
import '../../models/question.dart';

/// States for the PracticeBloc.
abstract class PracticeState extends Equatable {
  const PracticeState();

  @override
  List<Object?> get props => [];
}

/// Initial state before any session starts.
class PracticeInitial extends PracticeState {
  const PracticeInitial();
}

/// Loading state while starting session or fetching question.
class PracticeLoading extends PracticeState {
  const PracticeLoading();
}

/// Displaying a question to the student.
class PracticeQuestion extends PracticeState {
  final Question question;
  final int elapsedSeconds;
  final String? hintText;
  final String? selectedOption;
  final bool isHintLoading;

  const PracticeQuestion({
    required this.question,
    required this.elapsedSeconds,
    this.hintText,
    this.selectedOption,
    this.isHintLoading = false,
  });

  PracticeQuestion copyWith({
    Question? question,
    int? elapsedSeconds,
    String? hintText,
    String? selectedOption,
    bool? isHintLoading,
  }) {
    return PracticeQuestion(
      question: question ?? this.question,
      elapsedSeconds: elapsedSeconds ?? this.elapsedSeconds,
      hintText: hintText ?? this.hintText,
      selectedOption: selectedOption ?? this.selectedOption,
      isHintLoading: isHintLoading ?? this.isHintLoading,
    );
  }

  @override
  List<Object?> get props => [
        question,
        elapsedSeconds,
        hintText,
        selectedOption,
        isHintLoading,
      ];
}

/// Result state after submitting an answer.
class PracticeResult extends PracticeState {
  final bool isCorrect;
  final String explanation;
  final String correctAnswer;
  final String selectedAnswer;
  final String? strategyTip;
  final Question question;

  const PracticeResult({
    required this.isCorrect,
    required this.explanation,
    required this.correctAnswer,
    required this.selectedAnswer,
    this.strategyTip,
    required this.question,
  });

  @override
  List<Object?> get props => [
        isCorrect,
        explanation,
        correctAnswer,
        selectedAnswer,
        strategyTip,
        question,
      ];
}

/// Session ended state with summary.
class PracticeSessionEnded extends PracticeState {
  final int totalQuestions;
  final int correctAnswers;
  final double averageTimeSeconds;

  const PracticeSessionEnded({
    required this.totalQuestions,
    required this.correctAnswers,
    required this.averageTimeSeconds,
  });

  double get accuracy =>
      totalQuestions > 0 ? correctAnswers / totalQuestions : 0.0;

  @override
  List<Object?> get props => [totalQuestions, correctAnswers, averageTimeSeconds];
}

/// Error state.
class PracticeError extends PracticeState {
  final String message;

  const PracticeError({required this.message});

  @override
  List<Object?> get props => [message];
}
