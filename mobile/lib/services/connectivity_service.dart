import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';

/// Service that monitors network connectivity and notifies listeners
/// of connectivity changes. Used for session interruption detection.
///
/// Requirements: 4.9 - Detect connectivity loss during full test mode
class ConnectivityService {
  final Connectivity _connectivity;
  StreamSubscription<ConnectivityResult>? _subscription;

  final _connectivityController = StreamController<bool>.broadcast();

  /// Stream emitting `true` when connected, `false` when disconnected.
  Stream<bool> get onConnectivityChanged => _connectivityController.stream;

  bool _isConnected = true;

  /// Whether the device currently has network connectivity.
  bool get isConnected => _isConnected;

  ConnectivityService({Connectivity? connectivity})
      : _connectivity = connectivity ?? Connectivity();

  /// Start monitoring connectivity changes.
  void startMonitoring() {
    _subscription = _connectivity.onConnectivityChanged.listen(
      (ConnectivityResult result) {
        final connected = result != ConnectivityResult.none;
        if (connected != _isConnected) {
          _isConnected = connected;
          _connectivityController.add(connected);
        }
      },
    );
  }

  /// Check current connectivity status.
  Future<bool> checkConnectivity() async {
    final result = await _connectivity.checkConnectivity();
    _isConnected = result != ConnectivityResult.none;
    return _isConnected;
  }

  /// Stop monitoring and clean up resources.
  void dispose() {
    _subscription?.cancel();
    _connectivityController.close();
  }
}
