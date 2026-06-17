import 'package:hive_flutter/hive_flutter.dart';

/// Represents a locally stored interrupted session for resume capability.
class InterruptedSession {
  final String sessionId;
  final String section;
  final List<Map<String, dynamic>> questions;
  final Map<int, String> answers;
  final int currentIndex;
  final int timeRemainingSeconds;
  final DateTime interruptedAt;
  final DateTime expiresAt;

  const InterruptedSession({
    required this.sessionId,
    required this.section,
    required this.questions,
    required this.answers,
    required this.currentIndex,
    required this.timeRemainingSeconds,
    required this.interruptedAt,
    required this.expiresAt,
  });

  /// Whether this interrupted session is still within the 24-hour resume window.
  bool get isResumable => DateTime.now().isBefore(expiresAt);

  /// Time remaining until expiry as a human-readable string.
  String get timeUntilExpiry {
    final remaining = expiresAt.difference(DateTime.now());
    if (remaining.isNegative) return 'Expired';
    final hours = remaining.inHours;
    final minutes = remaining.inMinutes % 60;
    if (hours > 0) return '${hours}h ${minutes}m remaining';
    return '${minutes}m remaining';
  }

  Map<String, dynamic> toJson() {
    return {
      'sessionId': sessionId,
      'section': section,
      'questions': questions,
      'answers': answers.map((k, v) => MapEntry(k.toString(), v)),
      'currentIndex': currentIndex,
      'timeRemainingSeconds': timeRemainingSeconds,
      'interruptedAt': interruptedAt.toIso8601String(),
      'expiresAt': expiresAt.toIso8601String(),
    };
  }

  factory InterruptedSession.fromJson(Map<String, dynamic> json) {
    final answersRaw = json['answers'] as Map<String, dynamic>? ?? {};
    final answers = answersRaw.map(
      (k, v) => MapEntry(int.parse(k), v as String),
    );

    return InterruptedSession(
      sessionId: json['sessionId'] as String,
      section: json['section'] as String,
      questions: (json['questions'] as List<dynamic>)
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList(),
      answers: answers,
      currentIndex: json['currentIndex'] as int,
      timeRemainingSeconds: json['timeRemainingSeconds'] as int,
      interruptedAt: DateTime.parse(json['interruptedAt'] as String),
      expiresAt: DateTime.parse(json['expiresAt'] as String),
    );
  }
}


/// Service for locally persisting interrupted full test sessions.
/// Uses Hive for local storage to enable resume within 24 hours.
///
/// Requirements: 4.9 - Preserve answers on exit/connectivity loss
/// Requirements: 4.10 - Allow resume within 24 hours, discard after expiry
class SessionStorageService {
  static const String _boxName = 'session_cache';
  static const String _interruptedKey = 'interrupted_sessions';
  static const Duration _resumeWindow = Duration(hours: 24);

  /// Save a session locally when interrupted (exit or connectivity loss).
  Future<void> saveInterruptedSession({
    required String sessionId,
    required String section,
    required List<Map<String, dynamic>> questions,
    required Map<int, String> answers,
    required int currentIndex,
    required int timeRemainingSeconds,
  }) async {
    final box = Hive.box(_boxName);
    final now = DateTime.now();

    final session = InterruptedSession(
      sessionId: sessionId,
      section: section,
      questions: questions,
      answers: answers,
      currentIndex: currentIndex,
      timeRemainingSeconds: timeRemainingSeconds,
      interruptedAt: now,
      expiresAt: now.add(_resumeWindow),
    );

    // Load existing interrupted sessions
    final sessions = await getInterruptedSessions();

    // Remove any existing entry for this session (update scenario)
    sessions.removeWhere((s) => s.sessionId == sessionId);

    // Add the new interrupted session
    sessions.add(session);

    // Persist to Hive
    final jsonList = sessions.map((s) => s.toJson()).toList();
    await box.put(_interruptedKey, jsonList);
  }

  /// Retrieve all interrupted sessions that are still within the 24-hour
  /// resume window (not expired).
  Future<List<InterruptedSession>> getInterruptedSessions() async {
    final box = Hive.box(_boxName);
    final raw = box.get(_interruptedKey);

    if (raw == null) return [];

    final List<dynamic> jsonList = raw is List ? raw : [];
    final sessions = <InterruptedSession>[];

    for (final item in jsonList) {
      try {
        final map = Map<String, dynamic>.from(item as Map);
        final session = InterruptedSession.fromJson(map);
        if (session.isResumable) {
          sessions.add(session);
        }
      } catch (_) {
        // Skip corrupted entries
      }
    }

    return sessions;
  }

  /// Remove a specific interrupted session (after successful resume or expiry).
  Future<void> removeInterruptedSession(String sessionId) async {
    final box = Hive.box(_boxName);
    final sessions = await getInterruptedSessions();
    sessions.removeWhere((s) => s.sessionId == sessionId);

    final jsonList = sessions.map((s) => s.toJson()).toList();
    await box.put(_interruptedKey, jsonList);
  }

  /// Remove all expired sessions from storage.
  Future<void> cleanExpiredSessions() async {
    final box = Hive.box(_boxName);
    final sessions = await getInterruptedSessions();
    // getInterruptedSessions already filters out expired ones
    final jsonList = sessions.map((s) => s.toJson()).toList();
    await box.put(_interruptedKey, jsonList);
  }

  /// Check if there are any resumable interrupted sessions.
  Future<bool> hasInterruptedSessions() async {
    final sessions = await getInterruptedSessions();
    return sessions.isNotEmpty;
  }
}
