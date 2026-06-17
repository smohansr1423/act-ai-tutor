import 'package:equatable/equatable.dart';

/// A linked student summary for selection.
class LinkedStudent extends Equatable {
  final String studentId;
  final String name;
  final String email;

  const LinkedStudent({
    required this.studentId,
    required this.name,
    required this.email,
  });

  factory LinkedStudent.fromJson(Map<String, dynamic> json) {
    return LinkedStudent(
      studentId: json['student_id'] as String,
      name: json['name'] as String,
      email: json['email'] as String,
    );
  }

  @override
  List<Object?> get props => [studentId, name, email];
}

/// A single data point for accuracy trend over time.
class AccuracyDataPoint extends Equatable {
  final DateTime date;
  final double accuracy;

  const AccuracyDataPoint({required this.date, required this.accuracy});

  factory AccuracyDataPoint.fromJson(Map<String, dynamic> json) {
    return AccuracyDataPoint(
      date: DateTime.parse(json['date'] as String),
      accuracy: (json['accuracy'] as num).toDouble(),
    );
  }

  @override
  List<Object?> get props => [date, accuracy];
}

/// Accuracy trend data per section.
class SectionTrend extends Equatable {
  final String section;
  final List<AccuracyDataPoint> dataPoints;

  const SectionTrend({required this.section, required this.dataPoints});

  factory SectionTrend.fromJson(Map<String, dynamic> json) {
    final points = (json['data_points'] as List<dynamic>)
        .map((p) => AccuracyDataPoint.fromJson(p as Map<String, dynamic>))
        .toList();
    return SectionTrend(
      section: json['section'] as String,
      dataPoints: points,
    );
  }

  @override
  List<Object?> get props => [section, dataPoints];
}

/// A weak skill entry for the student.
class WeakSkill extends Equatable {
  final String skillTag;
  final String section;
  final double accuracy;
  final int attemptCount;

  const WeakSkill({
    required this.skillTag,
    required this.section,
    required this.accuracy,
    required this.attemptCount,
  });

  factory WeakSkill.fromJson(Map<String, dynamic> json) {
    return WeakSkill(
      skillTag: json['skill_tag'] as String,
      section: json['section'] as String,
      accuracy: (json['accuracy'] as num).toDouble(),
      attemptCount: json['attempt_count'] as int,
    );
  }

  @override
  List<Object?> get props => [skillTag, section, accuracy, attemptCount];
}

/// Progress summary for a linked student.
class ProgressSummary extends Equatable {
  final double totalTimeMinutes;
  final int sessionsCompleted;
  final double overallAccuracy;

  const ProgressSummary({
    required this.totalTimeMinutes,
    required this.sessionsCompleted,
    required this.overallAccuracy,
  });

  factory ProgressSummary.fromJson(Map<String, dynamic> json) {
    return ProgressSummary(
      totalTimeMinutes: (json['total_time_minutes'] as num).toDouble(),
      sessionsCompleted: json['sessions_completed'] as int,
      overallAccuracy: (json['overall_accuracy'] as num).toDouble(),
    );
  }

  @override
  List<Object?> get props =>
      [totalTimeMinutes, sessionsCompleted, overallAccuracy];
}

/// States for the ParentDashboardBloc.
abstract class ParentDashboardState extends Equatable {
  const ParentDashboardState();

  @override
  List<Object?> get props => [];
}

/// Initial state before data is loaded.
class ParentDashboardInitial extends ParentDashboardState {
  const ParentDashboardInitial();
}

/// Loading state while fetching dashboard data.
class ParentDashboardLoading extends ParentDashboardState {
  const ParentDashboardLoading();
}

/// State when the parent has multiple linked students and needs to select one.
class ParentDashboardStudentSelection extends ParentDashboardState {
  final List<LinkedStudent> students;

  const ParentDashboardStudentSelection({required this.students});

  @override
  List<Object?> get props => [students];
}

/// State when the parent has no linked students.
class ParentDashboardNoLinkedStudents extends ParentDashboardState {
  const ParentDashboardNoLinkedStudents();
}

/// State when a selected student has no performance data yet.
class ParentDashboardNoData extends ParentDashboardState {
  final LinkedStudent student;

  const ParentDashboardNoData({required this.student});

  @override
  List<Object?> get props => [student];
}

/// State with full dashboard data for a selected student.
class ParentDashboardLoaded extends ParentDashboardState {
  final LinkedStudent selectedStudent;
  final List<LinkedStudent> allStudents;
  final ProgressSummary summary;
  final List<SectionTrend> trends;
  final List<WeakSkill> weakSkills;

  const ParentDashboardLoaded({
    required this.selectedStudent,
    required this.allStudents,
    required this.summary,
    required this.trends,
    required this.weakSkills,
  });

  @override
  List<Object?> get props =>
      [selectedStudent, allStudents, summary, trends, weakSkills];
}

/// Error state for dashboard operations.
class ParentDashboardError extends ParentDashboardState {
  final String message;

  const ParentDashboardError({required this.message});

  @override
  List<Object?> get props => [message];
}
