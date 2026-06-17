import 'package:equatable/equatable.dart';

/// A single message within a chat session.
class ChatMessage extends Equatable {
  final String role; // 'student' or 'tutor'
  final String content;
  final String timestamp;

  const ChatMessage({
    required this.role,
    required this.content,
    required this.timestamp,
  });

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    return ChatMessage(
      role: json['role'] as String,
      content: json['content'] as String,
      timestamp: json['timestamp'] as String,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'role': role,
      'content': content,
      'timestamp': timestamp,
    };
  }

  bool get isStudent => role == 'student';
  bool get isTutor => role == 'tutor';

  @override
  List<Object?> get props => [role, content, timestamp];
}

/// A chat session between student and AI tutor.
class ChatSession extends Equatable {
  final String chatSessionId;
  final String userId;
  final List<ChatMessage> messages;
  final DateTime createdAt;
  final DateTime updatedAt;

  const ChatSession({
    required this.chatSessionId,
    required this.userId,
    required this.messages,
    required this.createdAt,
    required this.updatedAt,
  });

  factory ChatSession.fromJson(Map<String, dynamic> json) {
    return ChatSession(
      chatSessionId: json['chat_session_id'] as String,
      userId: json['user_id'] as String,
      messages: (json['messages'] as List)
          .map((e) => ChatMessage.fromJson(e as Map<String, dynamic>))
          .toList(),
      createdAt: DateTime.parse(json['created_at'] as String),
      updatedAt: DateTime.parse(json['updated_at'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'chat_session_id': chatSessionId,
      'user_id': userId,
      'messages': messages.map((e) => e.toJson()).toList(),
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  @override
  List<Object?> get props => [chatSessionId, userId];
}
