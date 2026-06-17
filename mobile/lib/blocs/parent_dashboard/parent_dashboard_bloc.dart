import 'package:flutter_bloc/flutter_bloc.dart';

import '../../services/api_service.dart';
import 'parent_dashboard_event.dart';
import 'parent_dashboard_state.dart';

export 'parent_dashboard_event.dart';
export 'parent_dashboard_state.dart';

/// BLoC managing the parent dashboard.
///
/// Fetches analytics data for linked students from
/// GET /api/analytics/parent/:parentId/:studentId?
///
/// The backend response includes a `type` field indicating the view:
/// - "student_selection": Parent has multiple students, show selection list
/// - "no_linked_students": Parent has no accepted links
/// - "no_performance_data": Selected student has no data yet
/// - "dashboard": Full dashboard data available
class ParentDashboardBloc
    extends Bloc<ParentDashboardEvent, ParentDashboardState> {
  final ApiService apiService;

  ParentDashboardBloc({required this.apiService})
      : super(const ParentDashboardInitial()) {
    on<LoadParentDashboard>(_onLoadParentDashboard);
    on<SelectStudent>(_onSelectStudent);
  }

  Future<void> _onLoadParentDashboard(
    LoadParentDashboard event,
    Emitter<ParentDashboardState> emit,
  ) async {
    emit(const ParentDashboardLoading());
    try {
      final endpoint = event.studentId != null
          ? '/analytics/parent/${event.parentId}/${event.studentId}'
          : '/analytics/parent/${event.parentId}';
      final response = await apiService.get(endpoint);
      _handleResponse(response, emit);
    } on ApiException catch (e) {
      emit(ParentDashboardError(message: e.message));
    } catch (e) {
      emit(const ParentDashboardError(
        message: 'Failed to load parent dashboard.',
      ));
    }
  }

  Future<void> _onSelectStudent(
    SelectStudent event,
    Emitter<ParentDashboardState> emit,
  ) async {
    emit(const ParentDashboardLoading());
    try {
      final endpoint =
          '/analytics/parent/${event.parentId}/${event.studentId}';
      final response = await apiService.get(endpoint);
      _handleResponse(response, emit);
    } on ApiException catch (e) {
      emit(ParentDashboardError(message: e.message));
    } catch (e) {
      emit(const ParentDashboardError(
        message: 'Failed to load student data.',
      ));
    }
  }

  void _handleResponse(
    Map<String, dynamic> response,
    Emitter<ParentDashboardState> emit,
  ) {
    final type = response['type'] as String;

    switch (type) {
      case 'student_selection':
        final studentsJson = response['students'] as List<dynamic>;
        final students = studentsJson
            .map((s) => LinkedStudent.fromJson(s as Map<String, dynamic>))
            .toList();
        emit(ParentDashboardStudentSelection(students: students));
        break;

      case 'no_linked_students':
        emit(const ParentDashboardNoLinkedStudents());
        break;

      case 'no_performance_data':
        final studentJson = response['student'] as Map<String, dynamic>;
        final student = LinkedStudent.fromJson(studentJson);
        emit(ParentDashboardNoData(student: student));
        break;

      case 'dashboard':
        final studentJson = response['student'] as Map<String, dynamic>;
        final selectedStudent = LinkedStudent.fromJson(studentJson);

        final allStudentsJson =
            (response['all_students'] as List<dynamic>?) ?? [studentJson];
        final allStudents = allStudentsJson
            .map((s) => LinkedStudent.fromJson(s as Map<String, dynamic>))
            .toList();

        final summaryJson = response['summary'] as Map<String, dynamic>;
        final summary = ProgressSummary.fromJson(summaryJson);

        final trendsJson = response['trends'] as List<dynamic>;
        final trends = trendsJson
            .map((t) => SectionTrend.fromJson(t as Map<String, dynamic>))
            .toList();

        final weakSkillsJson = response['weak_skills'] as List<dynamic>;
        final weakSkills = weakSkillsJson
            .map((w) => WeakSkill.fromJson(w as Map<String, dynamic>))
            .toList();

        emit(ParentDashboardLoaded(
          selectedStudent: selectedStudent,
          allStudents: allStudents,
          summary: summary,
          trends: trends,
          weakSkills: weakSkills,
        ));
        break;

      default:
        emit(const ParentDashboardError(
          message: 'Unexpected response from server.',
        ));
    }
  }
}
