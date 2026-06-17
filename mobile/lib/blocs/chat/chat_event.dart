import 'dart:io';

import 'package:equatable/equatable.dart';

/// Events for the ChatBloc.
abstract class ChatEvent extends Equatable {
  const ChatEvent();

  @override
  List<Object?> get props => [];
}

/// Send a text message to the AI tutor.
class ChatSendMessage extends ChatEvent {
  final String text;

  const ChatSendMessage({required this.text});

  @override
  List<Object?> get props => [text];
}

/// Send an image to the AI tutor for processing.
class ChatSendImage extends ChatEvent {
  final File image;

  const ChatSendImage({required this.image});

  @override
  List<Object?> get props => [image];
}

/// Load chat history for the current session.
class ChatLoadHistory extends ChatEvent {
  final String sessionId;

  const ChatLoadHistory({required this.sessionId});

  @override
  List<Object?> get props => [sessionId];
}

/// Clear the current chat error state.
class ChatClearError extends ChatEvent {
  const ChatClearError();
}
