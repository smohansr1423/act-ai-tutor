import 'package:equatable/equatable.dart';

/// Data point for a score trend chart.
class ScoreTrendPoint extends Equatable {
  final DateTime date;
  final double accuracy;

  const ScoreTrendPoint({required this.date, required this.accuracy});

  @override
  List<Object?> get props => [date, accuracy];
}

/// Score trend data per section over the last 30 days.
class SectionScoreTrend extends Equatable {
  final String section;
  final List<ScoreTrendPoint> dataPoints;

  const SectionScoreTrend({required this.section, required this.dataPoints});

  @override
  List<Object?> get props => [section, dataPoints];
}

/// A weak skill entry with accuracy and attempt count.
class WeakSkill extends Equatable {
  final String skillTag;
  final double accuracy;
  final int attemptCount;

  const WeakSkill({
    required this.skillTag,
    required this.accuracy,
    required this.attemptCount,
  });

  @override
  List<Object?> get props => [skillTag, accuracy, attemptCount];
}

/// Section accuracy data.
class SectionAccuracy extends Equatable {
  final String section;
  final double accuracy;
  final bool insufficientData;

  const SectionAccuracy({
    required this.section,
    required this.accuracy,
    this.insufficientData = false,
  });

  @override
  List<Object?> get props => [section, accuracy, insufficientData];
}

/// Average time per question per section.
class SectionAvgTime extends Equatable {
  final String section;
  final double avgTimeSeconds;
  final bool insufficientData;

  const SectionAvgTime({
    required this.section,
    required this.avgTimeSeconds,
    this.insufficientData = false,
  });

  @override
  List<Object?> get props => [section, avgTimeSeconds, insufficientData];
}

/// Complete analytics dashboard data.
class AnalyticsDashboardData extends Equatable {
  final List<SectionScoreTrend> scoreTrends;
  final List<WeakSkill> weakSkills;
  final List<SectionAccuracy> accuracyPerSection;
  final List<SectionAvgTime> avgTimePerSection;

  const AnalyticsDashboardData({
    required this.scoreTrends,
    required this.weakSkills,
    required this.accuracyPerSection,
    required this.avgTimePerSection,
  });

  @override
  List<Object?> get props => [
        scoreTrends,
        weakSkills,
        accuracyPerSection,
        avgTimePerSection,
      ];
}

/// States for the AnalyticsBloc.
abstract class AnalyticsState extends Equatable {
  const AnalyticsState();

  @override
  List<Object?> get props => [];
}

/// Initial state before data is loaded.
class AnalyticsInitial extends AnalyticsState {
  const AnalyticsInitial();
}

/// Loading state while fetching analytics data.
class AnalyticsLoading extends AnalyticsState {
  const AnalyticsLoading();
}

/// Successfully loaded analytics data.
class AnalyticsLoaded extends AnalyticsState {
  final AnalyticsDashboardData data;

  const AnalyticsLoaded({required this.data});

  @override
  List<Object?> get props => [data];
}

/// Error state when loading fails.
class AnalyticsError extends AnalyticsState {
  final String message;

  const AnalyticsError({required this.message});

  @override
  List<Object?> get props => [message];
}
