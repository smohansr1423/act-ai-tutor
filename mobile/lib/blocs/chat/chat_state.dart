import 'package:equatable/equatable.dart';

import '../../models/chat_message.dart';

/// States for the ChatBloc.
abstract class ChatState extends Equatable {
  const ChatState();

  @override
  List<Object?> get props => [];
}

/// Initial state with no messages loaded.
class ChatInitial extends ChatState {
  const ChatInitial();
}

/// Chat is loading history.
class ChatLoadingHistory extends ChatState {
  const ChatLoadingHistory();
}

/// Active chat state with messages and optional loading/error indicators.
class ChatActive extends ChatState {
  final List<ChatMessage> messages;
  final bool isAiResponding;
  final String? errorMessage;
  final bool isImageError;

  const ChatActive({
    required this.messages,
    this.isAiResponding = false,
    this.errorMessage,
    this.isImageError = false,
  });

  ChatActive copyWith({
    List<ChatMessage>? messages,
    bool? isAiResponding,
    String? errorMessage,
    bool? isImageError,
    bool clearError = false,
  }) {
    return ChatActive(
      messages: messages ?? this.messages,
      isAiResponding: isAiResponding ?? this.isAiResponding,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      isImageError: clearError ? false : (isImageError ?? this.isImageError),
    );
  }

  @override
  List<Object?> get props => [messages, isAiResponding, errorMessage, isImageError];
}

/// Failed to load chat history.
class ChatError extends ChatState {
  final String message;

  const ChatError({required this.message});

  @override
  List<Object?> get props => [message];
}
