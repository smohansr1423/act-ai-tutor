import 'package:equatable/equatable.dart';
import 'enums.dart';

/// A practice or full test session.
class Session extends Equatable {
  final String sessionId;
  final String userId;
  final SessionType sessionType;
  final SessionSection section;
  final SessionStatus status;
  final DateTime startedAt;
  final DateTime? completedAt;
  final int? timeLimitSeconds;
  final int? timeRemainingSeconds;
  final DateTime? expiresAt;

  const Session({
    required this.sessionId,
    required this.userId,
    required this.sessionType,
    required this.section,
    required this.status,
    required this.startedAt,
    this.completedAt,
    this.timeLimitSeconds,
    this.timeRemainingSeconds,
    this.expiresAt,
  });

  factory Session.fromJson(Map<String, dynamic> json) {
    return Session(
      sessionId: json['session_id'] as String,
      userId: json['user_id'] as String,
      sessionType: SessionType.fromString(json['session_type'] as String),
      section: SessionSection.fromString(json['section'] as String),
      status: SessionStatus.fromString(json['status'] as String),
      startedAt: DateTime.parse(json['started_at'] as String),
      completedAt: json['completed_at'] != null
          ? DateTime.parse(json['completed_at'] as String)
          : null,
      timeLimitSeconds: json['time_limit_seconds'] as int?,
      timeRemainingSeconds: json['time_remaining_seconds'] as int?,
      expiresAt: json['expires_at'] != null
          ? DateTime.parse(json['expires_at'] as String)
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'session_id': sessionId,
      'user_id': userId,
      'session_type': sessionType.value,
      'section': section.value,
      'status': status.value,
      'started_at': startedAt.toIso8601String(),
      'completed_at': completedAt?.toIso8601String(),
      'time_limit_seconds': timeLimitSeconds,
      'time_remaining_seconds': timeRemainingSeconds,
      'expires_at': expiresAt?.toIso8601String(),
    };
  }

  @override
  List<Object?> get props => [sessionId, userId, sessionType, section, status];
}
