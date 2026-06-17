import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';

import '../../services/sync_service.dart';
import 'sync_event.dart';
import 'sync_state.dart';

export 'sync_event.dart';
export 'sync_state.dart';

/// BLoC managing data synchronization state.
///
/// Wraps [SyncService] to expose sync status through the BLoC pattern,
/// enabling the UI to observe sync state and trigger sync actions.
///
/// Responsibilities:
/// - Cache answer submissions locally when offline (Requirement 10.3)
/// - Detect connectivity restoration and sync within 30 seconds (Requirement 10.3)
/// - Resolve conflicts using last-write-wins (Requirement 10.3)
/// - Retry sync up to 3 times at 10-second intervals (Requirement 10.4)
/// - Expose sync status stream for UI sync pending indicator (Requirement 10.4)
/// - Sync all data on new device login within 10 seconds (Requirement 10.2)
class SyncBloc extends Bloc<SyncEvent, SyncState> {
  final SyncService syncService;
  StreamSubscription<SyncStatus>? _statusSubscription;

  SyncBloc({required this.syncService}) : super(const SyncInitial()) {
    on<SyncInitialized>(_onInitialized);
    on<SyncSubmissionCached>(_onSubmissionCached);
    on<SyncManualRetryRequested>(_onManualRetry);
    on<SyncOnLoginRequested>(_onLoginSync);
    on<SyncStatusChanged>(_onStatusChanged);
  }

  Future<void> _onInitialized(
    SyncInitialized event,
    Emitter<SyncState> emit,
  ) async {
    // Listen to sync service status changes
    _statusSubscription = syncService.statusStream.listen((status) {
      add(SyncStatusChanged(status: _mapStatus(status)));
    });

    // Initialize the sync service (starts connectivity monitoring)
    syncService.initialize();

    emit(SyncOperational(syncStatus: syncService.currentStatus));
  }

  Future<void> _onSubmissionCached(
    SyncSubmissionCached event,
    Emitter<SyncState> emit,
  ) async {
    await syncService.cacheSubmission(event.record);
    // Status update will come via the stream listener
  }

  Future<void> _onManualRetry(
    SyncManualRetryRequested event,
    Emitter<SyncState> emit,
  ) async {
    await syncService.manualSync();
    // Status update will come via the stream listener
  }

  Future<void> _onLoginSync(
    SyncOnLoginRequested event,
    Emitter<SyncState> emit,
  ) async {
    emit(SyncOperational(syncStatus: SyncStatus.syncing));

    final result = await syncService.syncOnLogin();

    if (result.success) {
      emit(SyncLoginComplete(
        result: result,
        syncStatus: syncService.currentStatus,
      ));
    } else {
      emit(SyncLoginFailed(
        error: result.error ?? 'Failed to sync data on login.',
      ));
    }
  }

  void _onStatusChanged(
    SyncStatusChanged event,
    Emitter<SyncState> emit,
  ) {
    final status = _reverseMapStatus(event.status);
    emit(SyncOperational(syncStatus: status));
  }

  SyncStatusValue _mapStatus(SyncStatus status) {
    switch (status) {
      case SyncStatus.synced:
        return SyncStatusValue.synced;
      case SyncStatus.pending:
        return SyncStatusValue.pending;
      case SyncStatus.syncing:
        return SyncStatusValue.syncing;
      case SyncStatus.failed:
        return SyncStatusValue.failed;
    }
  }

  SyncStatus _reverseMapStatus(SyncStatusValue value) {
    switch (value) {
      case SyncStatusValue.synced:
        return SyncStatus.synced;
      case SyncStatusValue.pending:
        return SyncStatus.pending;
      case SyncStatusValue.syncing:
        return SyncStatus.syncing;
      case SyncStatusValue.failed:
        return SyncStatus.failed;
    }
  }

  @override
  Future<void> close() {
    _statusSubscription?.cancel();
    syncService.dispose();
    return super.close();
  }
}
