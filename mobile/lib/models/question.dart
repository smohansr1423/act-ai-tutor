import 'package:equatable/equatable.dart';
import 'enums.dart';

/// A generated or curated ACT-style question.
class Question extends Equatable {
  final String questionId;
  final Section section;
  final String questionText;
  final String? passage;
  final List<String> options;
  final String correctAnswer;
  final String explanation;
  final Map<String, String> incorrectReasoning;
  final String skillTag;
  final DifficultyLevel difficulty;
  final String strategyTip;
  final DateTime createdAt;

  const Question({
    required this.questionId,
    required this.section,
    required this.questionText,
    this.passage,
    required this.options,
    required this.correctAnswer,
    required this.explanation,
    required this.incorrectReasoning,
    required this.skillTag,
    required this.difficulty,
    required this.strategyTip,
    required this.createdAt,
  });

  factory Question.fromJson(Map<String, dynamic> json) {
    return Question(
      questionId: json['question_id'] as String,
      section: Section.fromString(json['section'] as String),
      questionText: json['question_text'] as String,
      passage: json['passage'] as String?,
      options: List<String>.from(json['options'] as List),
      correctAnswer: json['correct_answer'] as String,
      explanation: json['explanation'] as String,
      incorrectReasoning: Map<String, String>.from(
        json['incorrect_reasoning'] as Map,
      ),
      skillTag: json['skill_tag'] as String,
      difficulty: DifficultyLevel.fromString(json['difficulty'] as String),
      strategyTip: json['strategy_tip'] as String,
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'question_id': questionId,
      'section': section.value,
      'question_text': questionText,
      'passage': passage,
      'options': options,
      'correct_answer': correctAnswer,
      'explanation': explanation,
      'incorrect_reasoning': incorrectReasoning,
      'skill_tag': skillTag,
      'difficulty': difficulty.value,
      'strategy_tip': strategyTip,
      'created_at': createdAt.toIso8601String(),
    };
  }

  @override
  List<Object?> get props => [questionId, section, skillTag, difficulty];
}
