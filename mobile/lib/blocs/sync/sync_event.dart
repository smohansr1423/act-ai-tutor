import 'package:equatable/equatable.dart';

import '../../models/models.dart';

/// Events for the SyncBloc.
abstract class SyncEvent extends Equatable {
  const SyncEvent();

  @override
  List<Object?> get props => [];
}

/// Initialize the sync service and begin monitoring connectivity.
class SyncInitialized extends SyncEvent {
  const SyncInitialized();
}

/// Cache a performance record submission locally when offline.
class SyncSubmissionCached extends SyncEvent {
  final PerformanceRecord record;

  const SyncSubmissionCached({required this.record});

  @override
  List<Object?> get props => [record];
}

/// Manually trigger a sync attempt (user-initiated retry).
class SyncManualRetryRequested extends SyncEvent {
  const SyncManualRetryRequested();
}

/// Sync all data on new device login within 10 seconds.
class SyncOnLoginRequested extends SyncEvent {
  const SyncOnLoginRequested();
}

/// Internal event: sync status changed from the service.
class SyncStatusChanged extends SyncEvent {
  final SyncStatusValue status;

  const SyncStatusChanged({required this.status});

  @override
  List<Object?> get props => [status];
}

/// Represents sync status values matching SyncService.SyncStatus.
enum SyncStatusValue {
  synced,
  pending,
  syncing,
  failed,
}
