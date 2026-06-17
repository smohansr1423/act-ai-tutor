import 'dart:io';

import 'package:flutter_bloc/flutter_bloc.dart';

import '../../models/chat_message.dart';
import '../../services/api_service.dart';
import '../../utils/constants.dart';
import 'chat_event.dart';
import 'chat_state.dart';

export 'chat_event.dart';
export 'chat_state.dart';

/// BLoC managing AI tutor chat state, including:
/// - Sending text messages (POST /api/chat/message)
/// - Sending images (POST /api/chat/image)
/// - Loading history (GET /api/chat/history/:sessionId)
/// - Managing message list and loading/error states
class ChatBloc extends Bloc<ChatEvent, ChatState> {
  final ApiService apiService;
  final String userId;
  String? _sessionId;

  ChatBloc({
    required this.apiService,
    required this.userId,
    String? sessionId,
  })  : _sessionId = sessionId,
        super(const ChatInitial()) {
    on<ChatLoadHistory>(_onLoadHistory);
    on<ChatSendMessage>(_onSendMessage);
    on<ChatSendImage>(_onSendImage);
    on<ChatClearError>(_onClearError);
  }

  /// Load chat history for a session.
  Future<void> _onLoadHistory(
    ChatLoadHistory event,
    Emitter<ChatState> emit,
  ) async {
    emit(const ChatLoadingHistory());
    _sessionId = event.sessionId;

    try {
      final response = await apiService.get(
        '/chat/history/${event.sessionId}',
      );

      final messagesJson = response['messages'] as List? ?? [];
      final messages = messagesJson
          .map((e) => ChatMessage.fromJson(e as Map<String, dynamic>))
          .toList();

      emit(ChatActive(messages: messages));
    } on ApiException catch (e) {
      emit(ChatError(message: e.message));
    } catch (e) {
      emit(const ChatError(
        message: 'Failed to load chat history. Please try again.',
      ));
    }
  }

  /// Send a text message to the AI tutor.
  Future<void> _onSendMessage(
    ChatSendMessage event,
    Emitter<ChatState> emit,
  ) async {
    // Enforce message length limit
    if (event.text.length > AppConstants.maxChatMessageLength) {
      return;
    }

    final currentMessages = _getCurrentMessages();

    // Add student message to the list immediately
    final studentMessage = ChatMessage(
      role: 'student',
      content: event.text,
      timestamp: DateTime.now().toIso8601String(),
    );

    final updatedMessages = [...currentMessages, studentMessage];
    emit(ChatActive(messages: updatedMessages, isAiResponding: true));

    try {
      final response = await apiService.post(
        '/chat/message',
        body: {
          'userId': userId,
          'sessionId': _sessionId,
          'text': event.text,
        },
        timeoutSeconds: AppConstants.chatTextTimeoutSeconds,
      );

      final reply = response['reply'] as String? ?? '';

      final tutorMessage = ChatMessage(
        role: 'tutor',
        content: reply,
        timestamp: DateTime.now().toIso8601String(),
      );

      final messagesWithReply = [...updatedMessages, tutorMessage];
      emit(ChatActive(messages: messagesWithReply));
    } on ApiException catch (e) {
      emit(ChatActive(
        messages: updatedMessages,
        errorMessage: e.message,
      ));
    } catch (e) {
      emit(ChatActive(
        messages: updatedMessages,
        errorMessage: 'Failed to get a response. Please try again.',
      ));
    }
  }

  /// Send an image to the AI tutor for processing.
  Future<void> _onSendImage(
    ChatSendImage event,
    Emitter<ChatState> emit,
  ) async {
    final currentMessages = _getCurrentMessages();

    // Add a student message indicating image was sent
    final studentMessage = ChatMessage(
      role: 'student',
      content: '[Image uploaded]',
      timestamp: DateTime.now().toIso8601String(),
    );

    final updatedMessages = [...currentMessages, studentMessage];
    emit(ChatActive(messages: updatedMessages, isAiResponding: true));

    try {
      final response = await apiService.uploadImage(
        '/chat/image',
        imageFile: event.image,
        fields: {
          'userId': userId,
          if (_sessionId != null) 'sessionId': _sessionId!,
        },
        timeoutSeconds: AppConstants.chatImageTimeoutSeconds,
      );

      final reply = response['reply'] as String? ?? '';

      final tutorMessage = ChatMessage(
        role: 'tutor',
        content: reply,
        timestamp: DateTime.now().toIso8601String(),
      );

      final messagesWithReply = [...updatedMessages, tutorMessage];
      emit(ChatActive(messages: messagesWithReply));
    } on ApiException catch (e) {
      emit(ChatActive(
        messages: updatedMessages,
        errorMessage: 'Image processing failed: ${e.message}',
        isImageError: true,
      ));
    } catch (e) {
      emit(ChatActive(
        messages: updatedMessages,
        errorMessage:
            'Image processing failed. Please try a clearer image or use text input instead.',
        isImageError: true,
      ));
    }
  }

  /// Clear the error state.
  void _onClearError(
    ChatClearError event,
    Emitter<ChatState> emit,
  ) {
    final currentState = state;
    if (currentState is ChatActive) {
      emit(currentState.copyWith(clearError: true));
    }
  }

  /// Get current messages from state.
  List<ChatMessage> _getCurrentMessages() {
    final currentState = state;
    if (currentState is ChatActive) {
      return currentState.messages;
    }
    return [];
  }
}
