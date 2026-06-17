import 'package:equatable/equatable.dart';
import 'enums.dart';

/// A record of a student's response to a single question.
class PerformanceRecord extends Equatable {
  final String recordId;
  final String userId;
  final String sessionId;
  final String questionId;
  final String? selectedAnswer;
  final bool isCorrect;
  final double timeTakenSeconds;
  final ErrorClassification? errorClassification;
  final DateTime timestamp;

  const PerformanceRecord({
    required this.recordId,
    required this.userId,
    required this.sessionId,
    required this.questionId,
    this.selectedAnswer,
    required this.isCorrect,
    required this.timeTakenSeconds,
    this.errorClassification,
    required this.timestamp,
  });

  factory PerformanceRecord.fromJson(Map<String, dynamic> json) {
    return PerformanceRecord(
      recordId: json['record_id'] as String,
      userId: json['user_id'] as String,
      sessionId: json['session_id'] as String,
      questionId: json['question_id'] as String,
      selectedAnswer: json['selected_answer'] as String?,
      isCorrect: json['is_correct'] as bool,
      timeTakenSeconds: (json['time_taken_seconds'] as num).toDouble(),
      errorClassification: json['error_classification'] != null
          ? ErrorClassification.fromString(
              json['error_classification'] as String,
            )
          : null,
      timestamp: DateTime.parse(json['timestamp'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'record_id': recordId,
      'user_id': userId,
      'session_id': sessionId,
      'question_id': questionId,
      'selected_answer': selectedAnswer,
      'is_correct': isCorrect,
      'time_taken_seconds': timeTakenSeconds,
      'error_classification': errorClassification?.value,
      'timestamp': timestamp.toIso8601String(),
    };
  }

  @override
  List<Object?> get props => [recordId, userId, sessionId, questionId];
}
