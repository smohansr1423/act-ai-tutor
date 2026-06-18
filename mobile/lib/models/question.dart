import 'package:equatable/equatable.dart';
import 'enums.dart';

/// A generated or curated ACT-style question.
/// Supports both full questions (from question bank) and delivered questions
/// (from practice sessions, which omit answer/explanation fields).
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

  Question({
    required this.questionId,
    required this.section,
    required this.questionText,
    this.passage,
    required this.options,
    this.correctAnswer = '',
    this.explanation = '',
    this.incorrectReasoning = const {},
    required this.skillTag,
    required this.difficulty,
    this.strategyTip = '',
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  /// Parse from JSON, supporting both snake_case and camelCase keys,
  /// and both full questions and delivered questions (partial fields).
  factory Question.fromJson(Map<String, dynamic> json) {
    // Support both camelCase (API delivery) and snake_case (full question) keys
    final questionId = (json['questionId'] ?? json['question_id'] ?? '') as String;
    final sectionStr = (json['section'] ?? '') as String;
    final questionText = (json['questionText'] ?? json['question_text'] ?? '') as String;
    final passage = json['passage'] as String?;
    final skillTag = (json['skillTag'] ?? json['skill_tag'] ?? '') as String;
    final difficultyStr = (json['difficulty'] ?? 'medium') as String;

    // Parse options: handle array, object {"A":"...","B":"..."}, or null
    List<String> options;
    final rawOptions = json['options'];
    if (rawOptions is List) {
      options = List<String>.from(rawOptions);
    } else if (rawOptions is Map) {
      options = rawOptions.entries
          .map((e) => '${e.key}) ${e.value}')
          .toList()
          .cast<String>();
    } else {
      options = [];
    }

    // Optional fields (not present in practice delivery)
    final correctAnswer = (json['correctAnswer'] ?? json['correct_answer'] ?? '') as String;
    final explanation = (json['explanation'] ?? '') as String;
    final strategyTip = (json['strategyTip'] ?? json['strategy_tip'] ?? '') as String;

    Map<String, String> incorrectReasoning = {};
    final rawReasoning = json['incorrectReasoning'] ?? json['incorrect_reasoning'];
    if (rawReasoning is Map) {
      incorrectReasoning = Map<String, String>.from(rawReasoning);
    }

    DateTime createdAt = DateTime.now();
    final rawDate = json['createdAt'] ?? json['created_at'];
    if (rawDate is String && rawDate.isNotEmpty) {
      createdAt = DateTime.tryParse(rawDate) ?? DateTime.now();
    }

    return Question(
      questionId: questionId,
      section: Section.fromString(sectionStr),
      questionText: questionText,
      passage: passage,
      options: options,
      correctAnswer: correctAnswer,
      explanation: explanation,
      incorrectReasoning: incorrectReasoning,
      skillTag: skillTag,
      difficulty: DifficultyLevel.fromString(difficultyStr),
      strategyTip: strategyTip,
      createdAt: createdAt,
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
