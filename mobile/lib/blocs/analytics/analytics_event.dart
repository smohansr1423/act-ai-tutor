import 'package:equatable/equatable.dart';

/// Events for the AnalyticsBloc.
abstract class AnalyticsEvent extends Equatable {
  const AnalyticsEvent();

  @override
  List<Object?> get props => [];
}

/// Request to load the analytics dashboard data.
class AnalyticsLoadRequested extends AnalyticsEvent {
  final String userId;

  const AnalyticsLoadRequested({required this.userId});

  @override
  List<Object?> get props => [userId];
}
