import 'package:equatable/equatable.dart';
import 'enums.dart';

/// Daily practice target within a study plan.
class DailyTarget extends Equatable {
  final String skillTag;
  final Section section;
  final int questionCount;

  const DailyTarget({
    required this.skillTag,
    required this.section,
    required this.questionCount,
  });

  factory DailyTarget.fromJson(Map<String, dynamic> json) {
    return DailyTarget(
      skillTag: json['skill_tag'] as String,
      section: Section.fromString(json['section'] as String),
      questionCount: json['question_count'] as int,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'skill_tag': skillTag,
      'section': section.value,
      'question_count': questionCount,
    };
  }

  @override
  List<Object?> get props => [skillTag, section, questionCount];
}

/// Weekly goal within a study plan.
class WeeklyGoal extends Equatable {
  final String skillTag;
  final double targetAccuracy;

  const WeeklyGoal({
    required this.skillTag,
    required this.targetAccuracy,
  });

  factory WeeklyGoal.fromJson(Map<String, dynamic> json) {
    return WeeklyGoal(
      skillTag: json['skill_tag'] as String,
      targetAccuracy: (json['target_accuracy'] as num).toDouble(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'skill_tag': skillTag,
      'target_accuracy': targetAccuracy,
    };
  }

  @override
  List<Object?> get props => [skillTag, targetAccuracy];
}

/// Projected score range.
class ScoreRange extends Equatable {
  final int lower;
  final int upper;

  const ScoreRange({
    required this.lower,
    required this.upper,
  });

  factory ScoreRange.fromJson(Map<String, dynamic> json) {
    return ScoreRange(
      lower: json['lower'] as int,
      upper: json['upper'] as int,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'lower': lower,
      'upper': upper,
    };
  }

  @override
  List<Object?> get props => [lower, upper];
}

/// A personalized study plan for a student.
class StudyPlan extends Equatable {
  final String planId;
  final String userId;
  final List<DailyTarget> dailyTargets;
  final List<WeeklyGoal> weeklyGoals;
  final ScoreRange projectedScoreRange;
  final DateTime createdAt;
  final DateTime validUntil;

  const StudyPlan({
    required this.planId,
    required this.userId,
    required this.dailyTargets,
    required this.weeklyGoals,
    required this.projectedScoreRange,
    required this.createdAt,
    required this.validUntil,
  });

  factory StudyPlan.fromJson(Map<String, dynamic> json) {
    return StudyPlan(
      planId: json['plan_id'] as String,
      userId: json['user_id'] as String,
      dailyTargets: (json['daily_targets'] as List)
          .map((e) => DailyTarget.fromJson(e as Map<String, dynamic>))
          .toList(),
      weeklyGoals: (json['weekly_goals'] as List)
          .map((e) => WeeklyGoal.fromJson(e as Map<String, dynamic>))
          .toList(),
      projectedScoreRange: ScoreRange.fromJson(
        json['projected_score_range'] as Map<String, dynamic>,
      ),
      createdAt: DateTime.parse(json['created_at'] as String),
      validUntil: DateTime.parse(json['valid_until'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'plan_id': planId,
      'user_id': userId,
      'daily_targets': dailyTargets.map((e) => e.toJson()).toList(),
      'weekly_goals': weeklyGoals.map((e) => e.toJson()).toList(),
      'projected_score_range': projectedScoreRange.toJson(),
      'created_at': createdAt.toIso8601String(),
      'valid_until': validUntil.toIso8601String(),
    };
  }

  @override
  List<Object?> get props => [planId, userId, createdAt];
}
