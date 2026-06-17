import 'package:equatable/equatable.dart';

/// Events for the ParentDashboardBloc.
abstract class ParentDashboardEvent extends Equatable {
  const ParentDashboardEvent();

  @override
  List<Object?> get props => [];
}

/// Load the parent dashboard data.
/// If [studentId] is null, the backend returns student selection or
/// the single linked student's data automatically.
class LoadParentDashboard extends ParentDashboardEvent {
  final String parentId;
  final String? studentId;

  const LoadParentDashboard({required this.parentId, this.studentId});

  @override
  List<Object?> get props => [parentId, studentId];
}

/// Select a specific linked student to view their data.
class SelectStudent extends ParentDashboardEvent {
  final String parentId;
  final String studentId;

  const SelectStudent({required this.parentId, required this.studentId});

  @override
  List<Object?> get props => [parentId, studentId];
}
