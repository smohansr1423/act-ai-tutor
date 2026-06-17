import 'package:equatable/equatable.dart';
import 'enums.dart';

/// A single attempt entry within the recent_attempts array.
class RecentAttempt extends Equatable {
  final bool isCorrect;
  final String timestamp;

  const RecentAttempt({
    required this.isCorrect,
    required this.timestamp,
  });

  factory RecentAttempt.fromJson(Map<String, dynamic> json) {
    return RecentAttempt(
      isCorrect: json['is_correct'] as bool,
      timestamp: json['timestamp'] as String,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'is_correct': isCorrect,
      'timestamp': timestamp,
    };
  }

  @override
  List<Object?> get props => [isCorrect, timestamp];
}

/// Aggregated weakness data per skill tag for a student.
class WeaknessProfile extends Equatable {
  final String profileId;
  final String userId;
  final String skillTag;
  final Section section;
  final double accuracy;
  final int attemptCount;
  final List<RecentAttempt> recentAttempts;
  final DateTime updatedAt;

  const WeaknessProfile({
    required this.profileId,
    required this.userId,
    required this.skillTag,
    required this.section,
    required this.accuracy,
    required this.attemptCount,
    required this.recentAttempts,
    required this.updatedAt,
  });

  factory WeaknessProfile.fromJson(Map<String, dynamic> json) {
    return WeaknessProfile(
      profileId: json['profile_id'] as String,
      userId: json['user_id'] as String,
      skillTag: json['skill_tag'] as String,
      section: Section.fromString(json['section'] as String),
      accuracy: (json['accuracy'] as num).toDouble(),
      attemptCount: json['attempt_count'] as int,
      recentAttempts: (json['recent_attempts'] as List)
          .map((e) => RecentAttempt.fromJson(e as Map<String, dynamic>))
          .toList(),
      updatedAt: DateTime.parse(json['updated_at'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'profile_id': profileId,
      'user_id': userId,
      'skill_tag': skillTag,
      'section': section.value,
      'accuracy': accuracy,
      'attempt_count': attemptCount,
      'recent_attempts': recentAttempts.map((e) => e.toJson()).toList(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  @override
  List<Object?> get props => [profileId, userId, skillTag, section, accuracy];
}
