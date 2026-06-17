import 'package:equatable/equatable.dart';

import '../../models/models.dart';
import '../../services/sync_service.dart';

/// States for the SyncBloc.
abstract class SyncState extends Equatable {
  final SyncStatus syncStatus;

  const SyncState({required this.syncStatus});

  @override
  List<Object?> get props => [syncStatus];
}

/// Initial state before sync service is initialized.
class SyncInitial extends SyncState {
  const SyncInitial() : super(syncStatus: SyncStatus.synced);
}

/// Normal operating state with current sync status.
class SyncOperational extends SyncState {
  const SyncOperational({required super.syncStatus});
}

/// State after a full login sync completes.
class SyncLoginComplete extends SyncState {
  final SyncResult result;

  const SyncLoginComplete({
    required this.result,
    required super.syncStatus,
  });

  @override
  List<Object?> get props => [syncStatus, result.success];
}

/// State when login sync fails.
class SyncLoginFailed extends SyncState {
  final String error;

  const SyncLoginFailed({
    required this.error,
  }) : super(syncStatus: SyncStatus.failed);

  @override
  List<Object?> get props => [syncStatus, error];
}
