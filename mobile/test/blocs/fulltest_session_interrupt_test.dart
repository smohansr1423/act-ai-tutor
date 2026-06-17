import 'package:flutter_test/flutter_test.dart';

import 'package:act_ai_tutor/blocs/fulltest/fulltest_bloc.dart';
import 'package:act_ai_tutor/services/api_service.dart';
import 'package:act_ai_tutor/services/session_storage_service.dart';

/// In-memory mock of SessionStorageService for testing without Hive.
class MockSessionStorageService extends SessionStorageService {
  final List<InterruptedSession> _sessions = [];

  @override
  Future<void> saveInterruptedSession({
    required String sessionId,
    required String section,
    required List<Map<String, dynamic>> questions,
    required Map<int, String> answers,
    required int currentIndex,
    required int timeRemainingSeconds,
  }) async {
    _sessions.removeWhere((s) => s.sessionId == sessionId);
    final now = DateTime.now();
    _sessions.add(InterruptedSession(
      sessionId: sessionId,
      section: section,
      questions: questions,
      answers: answers,
      currentIndex: currentIndex,
      timeRemainingSeconds: timeRemainingSeconds,
      interruptedAt: now,
      expiresAt: now.add(const Duration(hours: 24)),
    ));
  }

  @override
  Future<List<InterruptedSession>> getInterruptedSessions() async {
    return _sessions.where((s) => s.isResumable).toList();
  }

  @override
  Future<void> removeInterruptedSession(String sessionId) async {
    _sessions.removeWhere((s) => s.sessionId == sessionId);
  }

  @override
  Future<void> cleanExpiredSessions() async {
    _sessions.removeWhere((s) => !s.isResumable);
  }

  @override
  Future<bool> hasInterruptedSessions() async {
    return _sessions.any((s) => s.isResumable);
  }

  /// Test helper: add an expired session for testing auto-expiry.
  void addExpiredSession(InterruptedSession session) {
    _sessions.add(session);
  }

  /// Test helper: get all sessions (including expired, for verification).
  List<InterruptedSession> get allSessions => List.from(_sessions);
}

/// Mock API service that can be configured with response handlers.
class MockApiService extends ApiService {
  final Map<String, dynamic> Function(String, Map<String, dynamic>?)? onPost;

  MockApiService({this.onPost}) : super(baseUrl: 'http://test');

  @override
  Future<Map<String, dynamic>> post(
    String endpoint, {
    Map<String, dynamic>? body,
    bool requiresAuth = true,
    int? timeoutSeconds,
  }) async {
    if (onPost != null) {
      return onPost!(endpoint, body);
    }
    throw ApiException(statusCode: 500, message: 'Mock not configured');
  }
}

/// Creates a MockApiService that returns a valid test start response.
MockApiService createStartableApi({
  String sessionId = 'session-123',
  String section = 'math',
  int timeLimit = 3600,
}) {
  return MockApiService(
    onPost: (endpoint, body) {
      if (endpoint == '/sessions/fulltest/start') {
        return {
          'sessionId': sessionId,
          'questions': [
            {'questionText': 'Q1', 'options': ['A', 'B', 'C', 'D']},
            {'questionText': 'Q2', 'options': ['A', 'B', 'C', 'D']},
            {'questionText': 'Q3', 'options': ['A', 'B', 'C', 'D']},
          ],
          'timeLimit': timeLimit,
        };
      }
      if (endpoint == '/sessions/fulltest/save-progress') {
        return {'status': 'ok'};
      }
      throw ApiException(statusCode: 404, message: 'Not found');
    },
  );
}

void main() {
  group('FullTestBloc - Session Interruption and Resume', () {
    late MockSessionStorageService mockStorage;

    setUp(() {
      mockStorage = MockSessionStorageService();
    });

    group('ConnectivityLost', () {
      test('saves session locally and emits FullTestInterrupted', () async {
        final mockApi = createStartableApi();
        final bloc = FullTestBloc(
          apiService: mockApi,
          sessionStorageService: mockStorage,
        );

        // Start a test to get into active state
        bloc.add(const StartFullTest(section: 'math'));
        await Future.delayed(const Duration(milliseconds: 100));
        expect(bloc.state, isA<FullTestActive>());

        // Select an answer
        bloc.add(const SelectAnswer(questionIndex: 0, answer: 'A'));
        await Future.delayed(const Duration(milliseconds: 50));

        // Simulate connectivity loss
        bloc.add(const ConnectivityLost());
        await Future.delayed(const Duration(milliseconds: 100));

        // Verify session was saved locally
        final sessions = await mockStorage.getInterruptedSessions();
        expect(sessions.length, 1);
        expect(sessions[0].sessionId, 'session-123');
        expect(sessions[0].answers, {0: 'A'});
        expect(sessions[0].section, 'math');

        // Verify state is FullTestInterrupted
        expect(bloc.state, isA<FullTestInterrupted>());
        final state = bloc.state as FullTestInterrupted;
        expect(state.sessionId, 'session-123');
        expect(state.message, contains('Connection lost'));

        await bloc.close();
      });

      test('does nothing when not in active state', () async {
        final bloc = FullTestBloc(
          apiService: createStartableApi(),
          sessionStorageService: mockStorage,
        );

        // Bloc is in initial state, connectivity loss should be a no-op
        bloc.add(const ConnectivityLost());
        await Future.delayed(const Duration(milliseconds: 50));

        expect(bloc.state, isA<FullTestInitial>());
        final sessions = await mockStorage.getInterruptedSessions();
        expect(sessions.isEmpty, isTrue);

        await bloc.close();
      });
    });

    group('AppLifecycleInterrupted', () {
      test('saves session locally and attempts server save', () async {
        bool serverSaveCalled = false;
        final mockApi = MockApiService(
          onPost: (endpoint, body) {
            if (endpoint == '/sessions/fulltest/start') {
              return {
                'sessionId': 'session-456',
                'questions': [
                  {'questionText': 'Q1', 'options': ['A', 'B', 'C', 'D']},
                ],
                'timeLimit': 2700,
              };
            }
            if (endpoint == '/sessions/fulltest/save-progress') {
              serverSaveCalled = true;
              return {'status': 'ok'};
            }
            throw ApiException(statusCode: 404, message: 'Not found');
          },
        );

        final bloc = FullTestBloc(
          apiService: mockApi,
          sessionStorageService: mockStorage,
        );

        // Start test
        bloc.add(const StartFullTest(section: 'english'));
        await Future.delayed(const Duration(milliseconds: 100));

        // Select an answer
        bloc.add(const SelectAnswer(questionIndex: 0, answer: 'B'));
        await Future.delayed(const Duration(milliseconds: 50));

        // Simulate app backgrounding
        bloc.add(const AppLifecycleInterrupted());
        await Future.delayed(const Duration(milliseconds: 200));

        // Verify local save
        final sessions = await mockStorage.getInterruptedSessions();
        expect(sessions.length, 1);
        expect(sessions[0].sessionId, 'session-456');
        expect(sessions[0].answers, {0: 'B'});

        // Verify server save was attempted
        expect(serverSaveCalled, isTrue);

        // Verify state
        expect(bloc.state, isA<FullTestInterrupted>());

        await bloc.close();
      });

      test('still saves locally even if server save fails', () async {
        final mockApi = MockApiService(
          onPost: (endpoint, body) {
            if (endpoint == '/sessions/fulltest/start') {
              return {
                'sessionId': 'session-789',
                'questions': [
                  {'questionText': 'Q1', 'options': ['A', 'B', 'C', 'D']},
                ],
                'timeLimit': 2100,
              };
            }
            if (endpoint == '/sessions/fulltest/save-progress') {
              throw ApiException(
                  statusCode: 500, message: 'Server down');
            }
            throw ApiException(statusCode: 404, message: 'Not found');
          },
        );

        final bloc = FullTestBloc(
          apiService: mockApi,
          sessionStorageService: mockStorage,
        );

        bloc.add(const StartFullTest(section: 'reading'));
        await Future.delayed(const Duration(milliseconds: 100));

        bloc.add(const AppLifecycleInterrupted());
        await Future.delayed(const Duration(milliseconds: 200));

        // Local save should still succeed
        final sessions = await mockStorage.getInterruptedSessions();
        expect(sessions.length, 1);
        expect(sessions[0].sessionId, 'session-789');

        expect(bloc.state, isA<FullTestInterrupted>());

        await bloc.close();
      });
    });

    group('LoadInterruptedSessions', () {
      test('returns only non-expired sessions', () async {
        final bloc = FullTestBloc(
          apiService: createStartableApi(),
          sessionStorageService: mockStorage,
        );

        // Add a valid session
        await mockStorage.saveInterruptedSession(
          sessionId: 'valid-session',
          section: 'reading',
          questions: [
            {'questionText': 'Q1', 'options': ['A', 'B', 'C', 'D']}
          ],
          answers: {0: 'C'},
          currentIndex: 0,
          timeRemainingSeconds: 1800,
        );

        // Add an expired session
        mockStorage.addExpiredSession(InterruptedSession(
          sessionId: 'expired-session',
          section: 'science',
          questions: [
            {'questionText': 'Q2', 'options': ['A', 'B', 'C', 'D']}
          ],
          answers: {},
          currentIndex: 0,
          timeRemainingSeconds: 1000,
          interruptedAt: DateTime.now().subtract(const Duration(hours: 25)),
          expiresAt: DateTime.now().subtract(const Duration(hours: 1)),
        ));

        bloc.add(const LoadInterruptedSessions());
        await Future.delayed(const Duration(milliseconds: 100));

        expect(bloc.state, isA<InterruptedSessionsLoaded>());
        final state = bloc.state as InterruptedSessionsLoaded;
        expect(state.sessions.length, 1);
        expect(state.sessions[0].sessionId, 'valid-session');

        await bloc.close();
      });

      test('returns empty list when no sessions exist', () async {
        final bloc = FullTestBloc(
          apiService: createStartableApi(),
          sessionStorageService: mockStorage,
        );

        bloc.add(const LoadInterruptedSessions());
        await Future.delayed(const Duration(milliseconds: 100));

        expect(bloc.state, isA<InterruptedSessionsLoaded>());
        final state = bloc.state as InterruptedSessionsLoaded;
        expect(state.sessions.isEmpty, isTrue);

        await bloc.close();
      });
    });

    group('DismissInterruptedSession', () {
      test('removes session from storage and reloads list', () async {
        final bloc = FullTestBloc(
          apiService: createStartableApi(),
          sessionStorageService: mockStorage,
        );

        // Add two sessions
        await mockStorage.saveInterruptedSession(
          sessionId: 'session-a',
          section: 'english',
          questions: [
            {'questionText': 'Q1', 'options': ['A', 'B', 'C', 'D']}
          ],
          answers: {},
          currentIndex: 0,
          timeRemainingSeconds: 2700,
        );
        await mockStorage.saveInterruptedSession(
          sessionId: 'session-b',
          section: 'math',
          questions: [
            {'questionText': 'Q2', 'options': ['A', 'B', 'C', 'D']}
          ],
          answers: {0: 'D'},
          currentIndex: 0,
          timeRemainingSeconds: 3600,
        );

        bloc.add(const DismissInterruptedSession(sessionId: 'session-a'));
        await Future.delayed(const Duration(milliseconds: 100));

        expect(bloc.state, isA<InterruptedSessionsLoaded>());
        final state = bloc.state as InterruptedSessionsLoaded;
        expect(state.sessions.length, 1);
        expect(state.sessions[0].sessionId, 'session-b');

        await bloc.close();
      });
    });

    group('ResumeTest', () {
      test('restores session from server and removes local copy', () async {
        final mockApi = MockApiService(
          onPost: (endpoint, body) {
            if (endpoint == '/sessions/fulltest/resume') {
              return {
                'questions': [
                  {'questionText': 'Q1', 'options': ['A', 'B', 'C', 'D']},
                  {'questionText': 'Q2', 'options': ['A', 'B', 'C', 'D']},
                ],
                'timeRemaining': 1500,
                'currentIndex': 1,
                'section': 'math',
                'answers': [
                  {'questionIndex': 0, 'selectedAnswer': 'A'},
                ],
              };
            }
            throw ApiException(statusCode: 404, message: 'Not found');
          },
        );

        final bloc = FullTestBloc(
          apiService: mockApi,
          sessionStorageService: mockStorage,
        );

        // Pre-populate local storage
        await mockStorage.saveInterruptedSession(
          sessionId: 'resume-session',
          section: 'math',
          questions: [
            {'questionText': 'Q1', 'options': ['A', 'B', 'C', 'D']},
            {'questionText': 'Q2', 'options': ['A', 'B', 'C', 'D']},
          ],
          answers: {0: 'A'},
          currentIndex: 1,
          timeRemainingSeconds: 1500,
        );

        bloc.add(const ResumeTest(sessionId: 'resume-session'));
        await Future.delayed(const Duration(milliseconds: 200));

        // Verify state is active with restored data
        expect(bloc.state, isA<FullTestActive>());
        final activeState = bloc.state as FullTestActive;
        expect(activeState.sessionId, 'resume-session');
        expect(activeState.answers, {0: 'A'});
        expect(activeState.currentIndex, 1);
        expect(activeState.timeRemainingSeconds, 1500);
        expect(activeState.section, 'math');

        // Verify local copy was removed
        final sessions = await mockStorage.getInterruptedSessions();
        expect(sessions.isEmpty, isTrue);

        await bloc.close();
      });

      test('falls back to local storage when server fails', () async {
        final mockApi = MockApiService(
          onPost: (endpoint, body) {
            throw ApiException(
                statusCode: 500, message: 'Server unavailable');
          },
        );

        final bloc = FullTestBloc(
          apiService: mockApi,
          sessionStorageService: mockStorage,
        );

        // Pre-populate local storage
        await mockStorage.saveInterruptedSession(
          sessionId: 'local-resume',
          section: 'science',
          questions: [
            {'questionText': 'Q1', 'options': ['A', 'B', 'C', 'D']},
          ],
          answers: {0: 'D'},
          currentIndex: 0,
          timeRemainingSeconds: 2000,
        );

        bloc.add(const ResumeTest(sessionId: 'local-resume'));
        await Future.delayed(const Duration(milliseconds: 200));

        // Should fall back to local storage
        expect(bloc.state, isA<FullTestActive>());
        final activeState = bloc.state as FullTestActive;
        expect(activeState.sessionId, 'local-resume');
        expect(activeState.answers, {0: 'D'});
        expect(activeState.section, 'science');
        expect(activeState.timeRemainingSeconds, 2000);

        await bloc.close();
      });

      test('emits error when both server and local storage fail', () async {
        final mockApi = MockApiService(
          onPost: (endpoint, body) {
            throw ApiException(
                statusCode: 500, message: 'Server unavailable');
          },
        );

        final bloc = FullTestBloc(
          apiService: mockApi,
          sessionStorageService: mockStorage,
        );

        // No local session to fall back on
        bloc.add(const ResumeTest(sessionId: 'nonexistent'));
        await Future.delayed(const Duration(milliseconds: 200));

        expect(bloc.state, isA<FullTestError>());

        await bloc.close();
      });
    });

    group('InterruptedSession model', () {
      test('isResumable returns false after 24 hours', () {
        final expired = InterruptedSession(
          sessionId: 'old-session',
          section: 'english',
          questions: [],
          answers: {},
          currentIndex: 0,
          timeRemainingSeconds: 1000,
          interruptedAt: DateTime.now().subtract(const Duration(hours: 25)),
          expiresAt: DateTime.now().subtract(const Duration(hours: 1)),
        );

        expect(expired.isResumable, isFalse);
      });

      test('isResumable returns true within 24 hours', () {
        final valid = InterruptedSession(
          sessionId: 'recent-session',
          section: 'math',
          questions: [],
          answers: {},
          currentIndex: 0,
          timeRemainingSeconds: 2000,
          interruptedAt: DateTime.now().subtract(const Duration(hours: 12)),
          expiresAt: DateTime.now().add(const Duration(hours: 12)),
        );

        expect(valid.isResumable, isTrue);
      });

      test('timeUntilExpiry shows Expired for expired sessions', () {
        final expired = InterruptedSession(
          sessionId: 'exp',
          section: 'math',
          questions: [],
          answers: {},
          currentIndex: 0,
          timeRemainingSeconds: 0,
          interruptedAt: DateTime.now().subtract(const Duration(hours: 25)),
          expiresAt: DateTime.now().subtract(const Duration(hours: 1)),
        );

        expect(expired.timeUntilExpiry, 'Expired');
      });

      test('toJson and fromJson round-trip preserves data', () {
        final original = InterruptedSession(
          sessionId: 'round-trip',
          section: 'science',
          questions: [
            {'questionText': 'Q1', 'options': ['A', 'B', 'C', 'D']},
          ],
          answers: {0: 'B', 2: 'C'},
          currentIndex: 2,
          timeRemainingSeconds: 1500,
          interruptedAt: DateTime(2024, 6, 15, 10, 30),
          expiresAt: DateTime(2024, 6, 16, 10, 30),
        );

        final json = original.toJson();
        final restored = InterruptedSession.fromJson(json);

        expect(restored.sessionId, original.sessionId);
        expect(restored.section, original.section);
        expect(restored.questions.length, original.questions.length);
        expect(restored.answers, original.answers);
        expect(restored.currentIndex, original.currentIndex);
        expect(restored.timeRemainingSeconds, original.timeRemainingSeconds);
        expect(restored.interruptedAt, original.interruptedAt);
        expect(restored.expiresAt, original.expiresAt);
      });
    });
  });
}
