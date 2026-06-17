import 'dart:async';
import 'dart:convert';

import 'package:hive_flutter/hive_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/models.dart';
import '../utils/constants.dart';
import 'api_service.dart';
import 'connectivity_service.dart';

/// The current sync status indicating whether there is pending data to sync.
enum SyncStatus {
  /// All data is synced with the server.
  synced,

  /// There is pending data waiting to be synced.
  pending,

  /// Currently syncing data to the server.
  syncing,

  /// Sync failed after all retry attempts.
  failed,
}

/// A locally cached answer submission awaiting sync.
class CachedSubmission {
  final String recordId;
  final String userId;
  final String sessionId;
  final String questionId;
  final String? selectedAnswer;
  final bool isCorrect;
  final double timeTakenSeconds;
  final String? errorClassification;
  final DateTime timestamp;

  const CachedSubmission({
    required this.recordId,
    required this.userId,
    required this.sessionId,
    required this.questionId,
    this.selectedAnswer,
    required this.isCorrect,
    required this.timeTakenSeconds,
    this.errorClassification,
    required this.timestamp,
  });

  factory CachedSubmission.fromJson(Map<String, dynamic> json) {
    return CachedSubmission(
      recordId: json['record_id'] as String,
      userId: json['user_id'] as String,
      sessionId: json['session_id'] as String,
      questionId: json['question_id'] as String,
      selectedAnswer: json['selected_answer'] as String?,
      isCorrect: json['is_correct'] as bool,
      timeTakenSeconds: (json['time_taken_seconds'] as num).toDouble(),
      errorClassification: json['error_classification'] as String?,
      timestamp: DateTime.parse(json['timestamp'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'record_id': recordId,
      'user_id': userId,
      'session_id': sessionId,
      'question_id': questionId,
      'selected_answer': selectedAnswer,
      'is_correct': isCorrect,
      'time_taken_seconds': timeTakenSeconds,
      'error_classification': errorClassification,
      'timestamp': timestamp.toIso8601String(),
    };
  }

  /// Create a CachedSubmission from a PerformanceRecord.
  factory CachedSubmission.fromPerformanceRecord(PerformanceRecord record) {
    return CachedSubmission(
      recordId: record.recordId,
      userId: record.userId,
      sessionId: record.sessionId,
      questionId: record.questionId,
      selectedAnswer: record.selectedAnswer,
      isCorrect: record.isCorrect,
      timeTakenSeconds: record.timeTakenSeconds,
      errorClassification: record.errorClassification?.value,
      timestamp: record.timestamp,
    );
  }
}

/// Service for local caching and synchronization of data when offline.
///
/// Responsibilities:
/// - Cache answer submissions locally when offline (Requirement 10.3)
/// - Detect connectivity restoration and sync within 30 seconds (Requirement 10.3)
/// - Resolve conflicts using last-write-wins (most recent timestamp per question) (Requirement 10.3)
/// - Retry sync up to 3 times at 10-second intervals on failure (Requirement 10.4)
/// - Provide sync status stream for UI sync pending indicator (Requirement 10.4)
/// - Sync all data on new device login within 10 seconds (Requirement 10.2)
class SyncService {
  static const String _boxName = 'sync_cache';
  static const String _pendingSubmissionsKey = 'pending_submissions';
  static const String _lastSyncTimestampKey = 'last_sync_timestamp';

  final ApiService _apiService;
  final ConnectivityService _connectivityService;

  final _statusController = StreamController<SyncStatus>.broadcast();
  StreamSubscription<bool>? _connectivitySubscription;
  Timer? _syncTimer;
  Timer? _retryTimer;

  SyncStatus _currentStatus = SyncStatus.synced;
  int _retryCount = 0;
  bool _isSyncing = false;

  /// Stream of sync status changes for UI to observe.
  Stream<SyncStatus> get statusStream => _statusController.stream;

  /// Current sync status.
  SyncStatus get currentStatus => _currentStatus;

  /// Whether there are pending submissions to sync.
  Future<bool> get hasPendingData async {
    final submissions = await getPendingSubmissions();
    return submissions.isNotEmpty;
  }

  SyncService({
    required ApiService apiService,
    required ConnectivityService connectivityService,
  })  : _apiService = apiService,
        _connectivityService = connectivityService;

  /// Initialize the sync service and begin monitoring connectivity.
  void initialize() {
    _connectivitySubscription =
        _connectivityService.onConnectivityChanged.listen(_onConnectivityChanged);
    // Check for pending data on startup
    _checkPendingAndUpdateStatus();
  }

  /// Handle connectivity changes. When connectivity is restored,
  /// trigger sync within 30 seconds (per Requirement 10.3).
  void _onConnectivityChanged(bool isConnected) {
    if (isConnected) {
      // Cancel any existing retry timer
      _retryTimer?.cancel();
      _retryCount = 0;

      // Sync within 30 seconds of connectivity restoration
      // We trigger immediately to minimize delay, well within 30s.
      _triggerSync();
    }
  }

  /// Cache an answer submission locally when offline.
  /// Uses last-write-wins conflict resolution: if a submission for the same
  /// questionId already exists, the newer timestamp wins.
  Future<void> cacheSubmission(PerformanceRecord record) async {
    final submission = CachedSubmission.fromPerformanceRecord(record);
    final box = Hive.box(_boxName);

    final submissions = await getPendingSubmissions();

    // Conflict resolution: last-write-wins per question
    // Remove any existing submission for the same questionId if the new one is more recent
    final existingIndex = submissions.indexWhere(
      (s) => s.questionId == submission.questionId && s.userId == submission.userId,
    );

    if (existingIndex >= 0) {
      final existing = submissions[existingIndex];
      if (submission.timestamp.isAfter(existing.timestamp)) {
        // New submission is more recent - replace
        submissions[existingIndex] = submission;
      }
      // Otherwise keep the existing (it's more recent)
    } else {
      submissions.add(submission);
    }

    // Persist to Hive
    final jsonList = submissions.map((s) => s.toJson()).toList();
    await box.put(_pendingSubmissionsKey, jsonEncode(jsonList));

    _updateStatus(SyncStatus.pending);
  }

  /// Get all pending submissions from local cache.
  Future<List<CachedSubmission>> getPendingSubmissions() async {
    final box = Hive.box(_boxName);
    final raw = box.get(_pendingSubmissionsKey);

    if (raw == null || (raw is String && raw.isEmpty)) return [];

    try {
      final List<dynamic> jsonList = jsonDecode(raw as String);
      return jsonList
          .map((e) => CachedSubmission.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (_) {
      return [];
    }
  }

  /// Trigger synchronization of cached data to server.
  /// Retries up to 3 times at 10-second intervals on failure (Requirement 10.4).
  Future<bool> _triggerSync() async {
    if (_isSyncing) return false;

    final submissions = await getPendingSubmissions();
    if (submissions.isEmpty) {
      _updateStatus(SyncStatus.synced);
      return true;
    }

    _isSyncing = true;
    _updateStatus(SyncStatus.syncing);

    try {
      await _syncSubmissions(submissions);
      // Clear pending on success
      await _clearPendingSubmissions();
      _updateStatus(SyncStatus.synced);
      _retryCount = 0;
      _isSyncing = false;
      return true;
    } catch (_) {
      _isSyncing = false;
      _retryCount++;

      if (_retryCount < AppConstants.syncRetryAttempts) {
        _updateStatus(SyncStatus.pending);
        // Schedule retry at 10-second interval
        _retryTimer?.cancel();
        _retryTimer = Timer(
          Duration(seconds: AppConstants.syncRetryIntervalSeconds),
          () => _triggerSync(),
        );
      } else {
        _updateStatus(SyncStatus.failed);
        _retryCount = 0;
      }
      return false;
    }
  }

  /// Sync submissions to the server via API.
  Future<void> _syncSubmissions(List<CachedSubmission> submissions) async {
    final payload = submissions.map((s) => s.toJson()).toList();
    await _apiService.post(
      '/sync/submissions',
      body: {'submissions': payload},
      timeoutSeconds: 30,
    );
  }

  /// Clear all pending submissions from local cache.
  Future<void> _clearPendingSubmissions() async {
    final box = Hive.box(_boxName);
    await box.put(_pendingSubmissionsKey, jsonEncode([]));
  }

  /// Sync all user data on new device login within 10 seconds (Requirement 10.2).
  /// Fetches Performance_Records, Weakness_Profile, and Study_Plan from server.
  Future<SyncResult> syncOnLogin() async {
    try {
      final response = await _apiService.get(
        '/sync/full',
        timeoutSeconds: 10,
      );

      final performanceRecords = (response['performance_records'] as List?)
              ?.map((e) => PerformanceRecord.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [];

      final weaknessProfiles = (response['weakness_profiles'] as List?)
              ?.map((e) => WeaknessProfile.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [];

      final studyPlan = response['study_plan'] != null
          ? StudyPlan.fromJson(response['study_plan'] as Map<String, dynamic>)
          : null;

      // Also sync any pending local data up
      final pendingSubmissions = await getPendingSubmissions();
      if (pendingSubmissions.isNotEmpty && _connectivityService.isConnected) {
        await _triggerSync();
      }

      // Store last sync timestamp
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        _lastSyncTimestampKey,
        DateTime.now().toIso8601String(),
      );

      return SyncResult(
        performanceRecords: performanceRecords,
        weaknessProfiles: weaknessProfiles,
        studyPlan: studyPlan,
        success: true,
      );
    } catch (e) {
      return SyncResult(
        performanceRecords: [],
        weaknessProfiles: [],
        studyPlan: null,
        success: false,
        error: e.toString(),
      );
    }
  }

  /// Manually trigger a sync attempt. Useful for user-initiated retry.
  Future<bool> manualSync() async {
    if (!_connectivityService.isConnected) return false;
    _retryCount = 0;
    return _triggerSync();
  }

  /// Check pending data and update status accordingly.
  Future<void> _checkPendingAndUpdateStatus() async {
    final submissions = await getPendingSubmissions();
    if (submissions.isNotEmpty) {
      _updateStatus(SyncStatus.pending);
      // If we have connectivity, attempt sync immediately
      if (_connectivityService.isConnected) {
        _triggerSync();
      }
    }
  }

  /// Update sync status and notify listeners.
  void _updateStatus(SyncStatus status) {
    if (_currentStatus != status) {
      _currentStatus = status;
      _statusController.add(status);
    }
  }

  /// Get the last successful sync timestamp.
  Future<DateTime?> getLastSyncTimestamp() async {
    final prefs = await SharedPreferences.getInstance();
    final value = prefs.getString(_lastSyncTimestampKey);
    if (value == null) return null;
    return DateTime.tryParse(value);
  }

  /// Dispose of the service and clean up resources.
  void dispose() {
    _connectivitySubscription?.cancel();
    _syncTimer?.cancel();
    _retryTimer?.cancel();
    _statusController.close();
  }
}

/// Result of a full data sync operation on login.
class SyncResult {
  final List<PerformanceRecord> performanceRecords;
  final List<WeaknessProfile> weaknessProfiles;
  final StudyPlan? studyPlan;
  final bool success;
  final String? error;

  const SyncResult({
    required this.performanceRecords,
    required this.weaknessProfiles,
    this.studyPlan,
    required this.success,
    this.error,
  });
}
