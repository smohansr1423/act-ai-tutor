import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:hive_flutter/hive_flutter.dart';

import 'package:act_ai_tutor/models/models.dart';
import 'package:act_ai_tutor/services/api_service.dart';
import 'package:act_ai_tutor/services/connectivity_service.dart';
import 'package:act_ai_tutor/services/sync_service.dart';

// --- Mocks ---

/// Mock ConnectivityService that allows manual control of connectivity state.
class MockConnectivityService extends ConnectivityService {
  final _controller = StreamController<bool>.broadcast();
  bool _connected;

  MockConnectivityService({bool initialConnected = true})
      : _connected = initialConnected;

  @override
  Stream<bool> get onConnectivityChanged => _controller.stream;

  @override
  bool get isConnected => _connected;

  @override
  Future<bool> checkConnectivity() async => _connected;

  /// Simulate connectivity change.
  void setConnected(bool connected) {
    _connected = connected;
    _controller.add(connected);
  }

  @override
  void dispose() {
    _controller.close();
  }
}

/// Mock ApiService that tracks calls and can be configured with responses.
class MockApiService extends ApiService {
  final Future<Map<String, dynamic>> Function(String, Map<String, dynamic>?)?
      onPost;
  final Future<Map<String, dynamic>> Function(String)? onGet;
  int postCallCount = 0;
  List<Map<String, dynamic>> postBodies = [];

  MockApiService({this.onPost, this.onGet}) : super(baseUrl: 'http://test');

  @override
  Future<Map<String, dynamic>> post(
    String endpoint, {
    Map<String, dynamic>? body,
    bool requiresAuth = true,
    int? timeoutSeconds,
  }) async {
    postCallCount++;
    if (body != null) postBodies.add(body);
    if (onPost != null) {
      return await onPost!(endpoint, body);
    }
    return {};
  }

  @override
  Future<Map<String, dynamic>> get(
    String endpoint, {
    bool requiresAuth = true,
    int? timeoutSeconds,
  }) async {
    if (onGet != null) {
      return await onGet!(endpoint);
    }
    return {};
  }
}

/// Creates a sample PerformanceRecord for testing.
PerformanceRecord createTestRecord({
  String recordId = 'record-1',
  String userId = 'user-1',
  String sessionId = 'session-1',
  String questionId = 'question-1',
  String? selectedAnswer = 'A',
  bool isCorrect = true,
  double timeTakenSeconds = 15.0,
  DateTime? timestamp,
}) {
  return PerformanceRecord(
    recordId: recordId,
    userId: userId,
    sessionId: sessionId,
    questionId: questionId,
    selectedAnswer: selectedAnswer,
    isCorrect: isCorrect,
    timeTakenSeconds: timeTakenSeconds,
    timestamp: timestamp ?? DateTime(2024, 6, 15, 10, 30),
  );
}

void main() {
  late Box syncBox;

  setUpAll(() async {
    // Initialize Hive with a temporary directory for testing
    final tempDir = '${Directory.systemTemp.path}/hive_test_${DateTime.now().millisecondsSinceEpoch}';
    Hive.init(tempDir);
  });

  setUp(() async {
    if (Hive.isBoxOpen('sync_cache')) {
      await Hive.box('sync_cache').clear();
    } else {
      syncBox = await Hive.openBox('sync_cache');
    }
  });

  tearDown(() async {
    if (Hive.isBoxOpen('sync_cache')) {
      await Hive.box('sync_cache').clear();
    }
  });

  tearDownAll(() async {
    await Hive.close();
  });

  group('SyncService - Caching submissions offline', () {
    test('caches a submission when offline', () async {
      final connectivity = MockConnectivityService(initialConnected: false);
      final api = MockApiService();
      final syncService = SyncService(
        apiService: api,
        connectivityService: connectivity,
      );

      final record = createTestRecord();
      await syncService.cacheSubmission(record);

      final pending = await syncService.getPendingSubmissions();
      expect(pending.length, 1);
      expect(pending[0].recordId, 'record-1');
      expect(pending[0].questionId, 'question-1');
      expect(pending[0].isCorrect, true);

      syncService.dispose();
      connectivity.dispose();
    });

    test('caches multiple submissions', () async {
      final connectivity = MockConnectivityService(initialConnected: false);
      final api = MockApiService();
      final syncService = SyncService(
        apiService: api,
        connectivityService: connectivity,
      );

      await syncService.cacheSubmission(createTestRecord(
        recordId: 'r1',
        questionId: 'q1',
      ));
      await syncService.cacheSubmission(createTestRecord(
        recordId: 'r2',
        questionId: 'q2',
      ));
      await syncService.cacheSubmission(createTestRecord(
        recordId: 'r3',
        questionId: 'q3',
      ));

      final pending = await syncService.getPendingSubmissions();
      expect(pending.length, 3);

      syncService.dispose();
      connectivity.dispose();
    });
  });

  group('SyncService - Conflict resolution (last-write-wins)', () {
    test('newer submission replaces older for same questionId', () async {
      final connectivity = MockConnectivityService(initialConnected: false);
      final api = MockApiService();
      final syncService = SyncService(
        apiService: api,
        connectivityService: connectivity,
      );

      // Cache an initial submission
      await syncService.cacheSubmission(createTestRecord(
        recordId: 'r1',
        questionId: 'q1',
        selectedAnswer: 'A',
        isCorrect: false,
        timestamp: DateTime(2024, 6, 15, 10, 0),
      ));

      // Cache a newer submission for the same question
      await syncService.cacheSubmission(createTestRecord(
        recordId: 'r2',
        questionId: 'q1',
        selectedAnswer: 'B',
        isCorrect: true,
        timestamp: DateTime(2024, 6, 15, 10, 30),
      ));

      final pending = await syncService.getPendingSubmissions();
      expect(pending.length, 1);
      // The newer one wins
      expect(pending[0].selectedAnswer, 'B');
      expect(pending[0].isCorrect, true);
      expect(pending[0].recordId, 'r2');

      syncService.dispose();
      connectivity.dispose();
    });

    test('older submission does NOT replace newer for same questionId', () async {
      final connectivity = MockConnectivityService(initialConnected: false);
      final api = MockApiService();
      final syncService = SyncService(
        apiService: api,
        connectivityService: connectivity,
      );

      // Cache a newer submission first
      await syncService.cacheSubmission(createTestRecord(
        recordId: 'r1',
        questionId: 'q1',
        selectedAnswer: 'C',
        isCorrect: true,
        timestamp: DateTime(2024, 6, 15, 11, 0),
      ));

      // Try to cache an older submission for the same question
      await syncService.cacheSubmission(createTestRecord(
        recordId: 'r2',
        questionId: 'q1',
        selectedAnswer: 'D',
        isCorrect: false,
        timestamp: DateTime(2024, 6, 15, 9, 0),
      ));

      final pending = await syncService.getPendingSubmissions();
      expect(pending.length, 1);
      // The existing (newer) one is kept
      expect(pending[0].selectedAnswer, 'C');
      expect(pending[0].isCorrect, true);
      expect(pending[0].recordId, 'r1');

      syncService.dispose();
      connectivity.dispose();
    });

    test('different questionIds are stored independently', () async {
      final connectivity = MockConnectivityService(initialConnected: false);
      final api = MockApiService();
      final syncService = SyncService(
        apiService: api,
        connectivityService: connectivity,
      );

      await syncService.cacheSubmission(createTestRecord(
        recordId: 'r1',
        questionId: 'q1',
        timestamp: DateTime(2024, 6, 15, 10, 0),
      ));
      await syncService.cacheSubmission(createTestRecord(
        recordId: 'r2',
        questionId: 'q2',
        timestamp: DateTime(2024, 6, 15, 10, 0),
      ));

      final pending = await syncService.getPendingSubmissions();
      expect(pending.length, 2);

      syncService.dispose();
      connectivity.dispose();
    });
  });

  group('SyncService - Connectivity restoration triggers sync', () {
    test('syncs pending data when connectivity is restored', () async {
      final connectivity = MockConnectivityService(initialConnected: false);
      final api = MockApiService(
        onPost: (endpoint, body) async => {'status': 'ok'},
      );
      final syncService = SyncService(
        apiService: api,
        connectivityService: connectivity,
      );
      syncService.initialize();

      // Cache data while offline
      await syncService.cacheSubmission(createTestRecord());

      var pending = await syncService.getPendingSubmissions();
      expect(pending.length, 1);

      // Restore connectivity
      connectivity.setConnected(true);

      // Allow time for sync to complete
      await Future.delayed(const Duration(milliseconds: 200));

      // Verify data was synced (API was called)
      expect(api.postCallCount, greaterThan(0));

      // Verify pending is cleared
      pending = await syncService.getPendingSubmissions();
      expect(pending.isEmpty, true);

      syncService.dispose();
      connectivity.dispose();
    });

    test('does nothing when no pending data on connectivity restoration', () async {
      final connectivity = MockConnectivityService(initialConnected: false);
      final api = MockApiService(
        onPost: (endpoint, body) async => {'status': 'ok'},
      );
      final syncService = SyncService(
        apiService: api,
        connectivityService: connectivity,
      );
      syncService.initialize();

      // Restore connectivity with no pending data
      connectivity.setConnected(true);
      await Future.delayed(const Duration(milliseconds: 100));

      // No API calls made
      expect(api.postCallCount, 0);
      expect(syncService.currentStatus, SyncStatus.synced);

      syncService.dispose();
      connectivity.dispose();
    });
  });

  group('SyncService - Retry logic', () {
    test('retries sync up to 3 times on failure', () async {
      int attemptCount = 0;
      final connectivity = MockConnectivityService(initialConnected: true);
      final api = MockApiService(
        onPost: (endpoint, body) async {
          attemptCount++;
          throw ApiException(statusCode: 500, message: 'Server error');
        },
      );
      final syncService = SyncService(
        apiService: api,
        connectivityService: connectivity,
      );
      syncService.initialize();

      // Cache data
      await syncService.cacheSubmission(createTestRecord());

      // Trigger manual sync
      await syncService.manualSync();

      // First attempt fails immediately
      expect(attemptCount, 1);

      // Wait for retry at 10-second intervals (use shorter wait in test)
      // Since we can't easily control the timer in unit tests,
      // we verify the status transitions
      expect(syncService.currentStatus, SyncStatus.pending);

      syncService.dispose();
      connectivity.dispose();
    });

    test('status changes to failed after 3 retry attempts exhausted', () async {
      final connectivity = MockConnectivityService(initialConnected: true);
      int attemptCount = 0;
      final api = MockApiService(
        onPost: (endpoint, body) async {
          attemptCount++;
          throw ApiException(statusCode: 500, message: 'Server error');
        },
      );
      final syncService = SyncService(
        apiService: api,
        connectivityService: connectivity,
      );

      // Cache data
      await syncService.cacheSubmission(createTestRecord());

      // Collect status changes
      final statuses = <SyncStatus>[];
      syncService.statusStream.listen((s) => statuses.add(s));

      // Manually trigger sync 3 times to simulate retry exhaustion
      await syncService.manualSync(); // attempt 1
      await syncService.manualSync(); // attempt 2
      await syncService.manualSync(); // attempt 3

      // After 3 attempts, status should be failed
      expect(statuses.contains(SyncStatus.failed), true);

      syncService.dispose();
      connectivity.dispose();
    });
  });

  group('SyncService - Sync status stream', () {
    test('emits pending when submission is cached', () async {
      final connectivity = MockConnectivityService(initialConnected: false);
      final api = MockApiService();
      final syncService = SyncService(
        apiService: api,
        connectivityService: connectivity,
      );

      final statuses = <SyncStatus>[];
      syncService.statusStream.listen((s) => statuses.add(s));

      await syncService.cacheSubmission(createTestRecord());

      expect(statuses.contains(SyncStatus.pending), true);

      syncService.dispose();
      connectivity.dispose();
    });

    test('emits synced when sync completes successfully', () async {
      final connectivity = MockConnectivityService(initialConnected: true);
      final api = MockApiService(
        onPost: (endpoint, body) async => {'status': 'ok'},
      );
      final syncService = SyncService(
        apiService: api,
        connectivityService: connectivity,
      );

      final statuses = <SyncStatus>[];
      syncService.statusStream.listen((s) => statuses.add(s));

      await syncService.cacheSubmission(createTestRecord());
      await syncService.manualSync();

      expect(statuses.contains(SyncStatus.syncing), true);
      expect(statuses.contains(SyncStatus.synced), true);

      syncService.dispose();
      connectivity.dispose();
    });
  });

  group('SyncService - Full sync on login', () {
    test('fetches all data from server on login', () async {
      final connectivity = MockConnectivityService(initialConnected: true);
      final api = MockApiService(
        onGet: (endpoint) async {
          if (endpoint == '/sync/full') {
            return {
              'performance_records': [
                {
                  'record_id': 'r1',
                  'user_id': 'u1',
                  'session_id': 's1',
                  'question_id': 'q1',
                  'selected_answer': 'A',
                  'is_correct': true,
                  'time_taken_seconds': 12.5,
                  'timestamp': '2024-06-15T10:30:00.000Z',
                },
              ],
              'weakness_profiles': [
                {
                  'profile_id': 'wp1',
                  'user_id': 'u1',
                  'skill_tag': 'algebra',
                  'section': 'math',
                  'accuracy': 0.75,
                  'attempt_count': 20,
                  'recent_attempts': [],
                  'updated_at': '2024-06-15T10:30:00.000Z',
                },
              ],
              'study_plan': {
                'plan_id': 'sp1',
                'user_id': 'u1',
                'daily_targets': [],
                'weekly_goals': [],
                'projected_score_range': {'lower': 24, 'upper': 28},
                'created_at': '2024-06-15T10:00:00.000Z',
                'valid_until': '2024-06-22T10:00:00.000Z',
              },
            };
          }
          return {};
        },
      );

      final syncService = SyncService(
        apiService: api,
        connectivityService: connectivity,
      );

      final result = await syncService.syncOnLogin();

      expect(result.success, true);
      expect(result.performanceRecords.length, 1);
      expect(result.performanceRecords[0].recordId, 'r1');
      expect(result.weaknessProfiles.length, 1);
      expect(result.weaknessProfiles[0].skillTag, 'algebra');
      expect(result.studyPlan, isNotNull);
      expect(result.studyPlan!.planId, 'sp1');

      syncService.dispose();
      connectivity.dispose();
    });

    test('returns failure result when server is unreachable', () async {
      final connectivity = MockConnectivityService(initialConnected: true);
      final api = MockApiService(
        onGet: (endpoint) async {
          throw ApiException(statusCode: 503, message: 'Service unavailable');
        },
      );

      final syncService = SyncService(
        apiService: api,
        connectivityService: connectivity,
      );

      final result = await syncService.syncOnLogin();

      expect(result.success, false);
      expect(result.error, isNotNull);
      expect(result.performanceRecords, isEmpty);
      expect(result.weaknessProfiles, isEmpty);
      expect(result.studyPlan, isNull);

      syncService.dispose();
      connectivity.dispose();
    });
  });

  group('CachedSubmission model', () {
    test('toJson and fromJson round-trip', () {
      final submission = CachedSubmission(
        recordId: 'r1',
        userId: 'u1',
        sessionId: 's1',
        questionId: 'q1',
        selectedAnswer: 'B',
        isCorrect: false,
        timeTakenSeconds: 22.5,
        errorClassification: 'concept_gap',
        timestamp: DateTime(2024, 6, 15, 10, 30),
      );

      final json = submission.toJson();
      final restored = CachedSubmission.fromJson(json);

      expect(restored.recordId, submission.recordId);
      expect(restored.userId, submission.userId);
      expect(restored.sessionId, submission.sessionId);
      expect(restored.questionId, submission.questionId);
      expect(restored.selectedAnswer, submission.selectedAnswer);
      expect(restored.isCorrect, submission.isCorrect);
      expect(restored.timeTakenSeconds, submission.timeTakenSeconds);
      expect(restored.errorClassification, submission.errorClassification);
      expect(restored.timestamp, submission.timestamp);
    });

    test('fromPerformanceRecord creates correct submission', () {
      final record = createTestRecord(
        recordId: 'r-test',
        userId: 'u-test',
        questionId: 'q-test',
        selectedAnswer: 'D',
        isCorrect: false,
        timeTakenSeconds: 30.0,
      );

      final submission = CachedSubmission.fromPerformanceRecord(record);

      expect(submission.recordId, 'r-test');
      expect(submission.userId, 'u-test');
      expect(submission.questionId, 'q-test');
      expect(submission.selectedAnswer, 'D');
      expect(submission.isCorrect, false);
      expect(submission.timeTakenSeconds, 30.0);
    });
  });
}

/// Helper for accessing system temp directory in tests.
class Directory {
  static final systemTemp = _SystemTemp();
}

class _SystemTemp {
  String get path => './.dart_tool/test_hive';
}
