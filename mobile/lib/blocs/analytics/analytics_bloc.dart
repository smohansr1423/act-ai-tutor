import 'package:flutter_bloc/flutter_bloc.dart';

import '../../services/api_service.dart';
import 'analytics_event.dart';
import 'analytics_state.dart';

export 'analytics_event.dart';
export 'analytics_state.dart';

/// BLoC managing the student analytics dashboard.
///
/// Fetches analytics data from GET /api/analytics/dashboard/:userId
/// and maps the response into [AnalyticsDashboardData].
class AnalyticsBloc extends Bloc<AnalyticsEvent, AnalyticsState> {
  final ApiService apiService;

  AnalyticsBloc({required this.apiService}) : super(const AnalyticsInitial()) {
    on<AnalyticsLoadRequested>(_onLoadRequested);
  }

  Future<void> _onLoadRequested(
    AnalyticsLoadRequested event,
    Emitter<AnalyticsState> emit,
  ) async {
    emit(const AnalyticsLoading());
    try {
      final response = await apiService.get(
        '/analytics/dashboard/${event.userId}',
      );

      final data = _parseResponse(response);
      emit(AnalyticsLoaded(data: data));
    } on ApiException catch (e) {
      emit(AnalyticsError(message: e.message));
    } catch (e) {
      emit(const AnalyticsError(
        message: 'Failed to load analytics data.',
      ));
    }
  }

  AnalyticsDashboardData _parseResponse(Map<String, dynamic> response) {
    // Parse score trends
    final trendsJson = response['scoreTrends'] as List<dynamic>? ?? [];
    final scoreTrends = trendsJson.map((t) {
      final sectionData = t as Map<String, dynamic>;
      final dataPointsJson = sectionData['dataPoints'] as List<dynamic>? ?? [];
      final dataPoints = dataPointsJson.map((dp) {
        final point = dp as Map<String, dynamic>;
        return ScoreTrendPoint(
          date: DateTime.parse(point['date'] as String),
          accuracy: (point['accuracy'] as num).toDouble(),
        );
      }).toList();
      return SectionScoreTrend(
        section: sectionData['section'] as String,
        dataPoints: dataPoints,
      );
    }).toList();

    // Parse weak skills
    final weakSkillsJson = response['weakSkills'] as List<dynamic>? ?? [];
    final weakSkills = weakSkillsJson.map((w) {
      final skill = w as Map<String, dynamic>;
      return WeakSkill(
        skillTag: skill['skillTag'] as String,
        accuracy: (skill['accuracy'] as num).toDouble(),
        attemptCount: skill['attemptCount'] as int,
      );
    }).toList();

    // Parse accuracy per section
    final accuracyJson =
        response['accuracyPerSection'] as List<dynamic>? ?? [];
    final accuracyPerSection = accuracyJson.map((a) {
      final section = a as Map<String, dynamic>;
      return SectionAccuracy(
        section: section['section'] as String,
        accuracy: (section['accuracy'] as num).toDouble(),
        insufficientData: section['insufficientData'] as bool? ?? false,
      );
    }).toList();

    // Parse average time per section
    final avgTimeJson =
        response['avgTimePerSection'] as List<dynamic>? ?? [];
    final avgTimePerSection = avgTimeJson.map((t) {
      final section = t as Map<String, dynamic>;
      return SectionAvgTime(
        section: section['section'] as String,
        avgTimeSeconds: (section['avgTimeSeconds'] as num).toDouble(),
        insufficientData: section['insufficientData'] as bool? ?? false,
      );
    }).toList();

    return AnalyticsDashboardData(
      scoreTrends: scoreTrends,
      weakSkills: weakSkills,
      accuracyPerSection: accuracyPerSection,
      avgTimePerSection: avgTimePerSection,
    );
  }
}
