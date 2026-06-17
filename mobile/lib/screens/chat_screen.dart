import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:image_picker/image_picker.dart';

import '../blocs/chat/chat_bloc.dart';
import '../models/chat_message.dart';
import '../services/api_service.dart';
import '../utils/constants.dart';

/// AI Tutor chat screen providing:
/// - Text input with 1000-character limit enforcement (Req 6.1, 6.8)
/// - Image upload button for JPEG, PNG, GIF up to 10 MB (Req 6.2)
/// - Chat message list with Student/AI messages (Req 6.4, 6.5, 6.6, 6.7)
/// - Loading indicators during AI response (Req 6.1)
/// - Error messages for failed image processing (Req 6.3)
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final TextEditingController _textController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final FocusNode _textFocusNode = FocusNode();
  final ImagePicker _imagePicker = ImagePicker();

  late ChatBloc _chatBloc;
  bool _isBlocProvided = false;

  @override
  void initState() {
    super.initState();
    _textController.addListener(_onTextChanged);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Try to read a ChatBloc that's already provided above this widget
    try {
      _chatBloc = context.read<ChatBloc>();
      _isBlocProvided = true;
    } catch (_) {
      // If no ChatBloc is provided above, we create one using the ApiService
      _isBlocProvided = false;
    }
  }

  @override
  void dispose() {
    _textController.removeListener(_onTextChanged);
    _textController.dispose();
    _scrollController.dispose();
    _textFocusNode.dispose();
    super.dispose();
  }

  void _onTextChanged() {
    // Trigger rebuild to update character count and send button state
    setState(() {});
  }

  int get _characterCount => _textController.text.length;
  bool get _isOverLimit =>
      _characterCount > AppConstants.maxChatMessageLength;
  bool get _canSend =>
      _textController.text.trim().isNotEmpty && !_isOverLimit;

  void _sendMessage() {
    final text = _textController.text.trim();
    if (text.isEmpty || _isOverLimit) return;

    _chatBloc.add(ChatSendMessage(text: text));
    _textController.clear();
    _scrollToBottom();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _pickImage() async {
    try {
      final pickedFile = await _imagePicker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 2048,
        maxHeight: 2048,
      );

      if (pickedFile == null) return;

      final file = File(pickedFile.path);
      final fileSize = await file.length();

      // Validate file size (max 10 MB)
      if (fileSize > AppConstants.maxImageSizeBytes) {
        if (!mounted) return;
        _showErrorSnackBar(
          'Image is too large. Maximum size is 10 MB.',
        );
        return;
      }

      // Validate file type (JPEG, PNG, GIF)
      final extension = pickedFile.path.split('.').last.toLowerCase();
      final allowedExtensions = ['jpg', 'jpeg', 'png', 'gif'];
      if (!allowedExtensions.contains(extension)) {
        if (!mounted) return;
        _showErrorSnackBar(
          'Unsupported image format. Please use JPEG, PNG, or GIF.',
        );
        return;
      }

      _chatBloc.add(ChatSendImage(image: file));
      _scrollToBottom();
    } on PlatformException catch (_) {
      if (!mounted) return;
      _showErrorSnackBar(
        'Could not access photos. Please check permissions.',
      );
    }
  }

  void _showErrorSnackBar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Theme.of(context).colorScheme.error,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // If the BLoC was not provided above, create one with BlocProvider
    if (!_isBlocProvided) {
      final apiService = context.read<ApiService>();
      return BlocProvider(
        create: (_) => ChatBloc(
          apiService: apiService,
          userId: '', // In a real scenario, obtain from AuthBloc
        ),
        child: Builder(
          builder: (innerContext) {
            _chatBloc = innerContext.read<ChatBloc>();
            _isBlocProvided = true;
            return _buildScaffold(innerContext);
          },
        ),
      );
    }

    return _buildScaffold(context);
  }

  Widget _buildScaffold(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('AI Tutor'),
        centerTitle: true,
        elevation: 0,
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(child: _buildMessageList()),
            _buildInputArea(),
          ],
        ),
      ),
    );
  }

  /// Builds the scrollable message list with loading indicator.
  Widget _buildMessageList() {
    return BlocConsumer<ChatBloc, ChatState>(
      listener: (context, state) {
        if (state is ChatActive) {
          // Show error snackbar for image processing failures
          if (state.errorMessage != null && state.isImageError) {
            _showErrorSnackBar(state.errorMessage!);
            _chatBloc.add(const ChatClearError());
          }
          _scrollToBottom();
        }
      },
      builder: (context, state) {
        if (state is ChatInitial) {
          return const _EmptyChatView();
        }

        if (state is ChatLoadingHistory) {
          return const Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                CircularProgressIndicator(),
                SizedBox(height: 16),
                Text('Loading chat history...'),
              ],
            ),
          );
        }

        if (state is ChatError) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.error_outline,
                    size: 48,
                    color: Theme.of(context).colorScheme.error,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    state.message,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyLarge,
                  ),
                ],
              ),
            ),
          );
        }

        if (state is ChatActive) {
          return _buildActiveChat(state);
        }

        return const SizedBox.shrink();
      },
    );
  }

  /// Builds the active chat message list with optional typing indicator.
  Widget _buildActiveChat(ChatActive state) {
    final messages = state.messages;

    if (messages.isEmpty && !state.isAiResponding) {
      return const _EmptyChatView();
    }

    return ListView.builder(
      controller: _scrollController,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      itemCount: messages.length + (state.isAiResponding ? 1 : 0),
      itemBuilder: (context, index) {
        if (index == messages.length && state.isAiResponding) {
          return const _TypingIndicator();
        }
        return _ChatBubble(message: messages[index]);
      },
    );
  }

  /// Builds the input area with text field, image button, and send button.
  Widget _buildInputArea() {
    return BlocBuilder<ChatBloc, ChatState>(
      builder: (context, state) {
        final isResponding =
            state is ChatActive && state.isAiResponding;
        // Show non-image errors inline below the input
        final errorMessage = state is ChatActive &&
                state.errorMessage != null &&
                !state.isImageError
            ? state.errorMessage
            : null;

        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Error message banner for non-image errors
            if (errorMessage != null)
              _ErrorBanner(
                message: errorMessage,
                onDismiss: () {
                  _chatBloc.add(const ChatClearError());
                },
              ),
            // Input area
            Container(
              padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surface,
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.05),
                    blurRadius: 8,
                    offset: const Offset(0, -2),
                  ),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      // Image upload button
                      Semantics(
                        label: 'Upload image',
                        child: IconButton(
                          onPressed: isResponding ? null : _pickImage,
                          icon: const Icon(Icons.image_outlined),
                          tooltip: 'Upload image (JPEG, PNG, GIF)',
                          color:
                              Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),
                      // Text input field
                      Expanded(
                        child: TextField(
                          controller: _textController,
                          focusNode: _textFocusNode,
                          enabled: !isResponding,
                          maxLines: 4,
                          minLines: 1,
                          maxLength: AppConstants.maxChatMessageLength,
                          maxLengthEnforcement:
                              MaxLengthEnforcement.none,
                          textInputAction: TextInputAction.newline,
                          decoration: InputDecoration(
                            hintText: 'Ask me anything...',
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(24),
                              borderSide: BorderSide.none,
                            ),
                            filled: true,
                            fillColor: Theme.of(context)
                                .colorScheme
                                .surfaceVariant
                                .withOpacity(0.5),
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 10,
                            ),
                            counterText: '',
                            errorText: _isOverLimit
                                ? 'Message exceeds ${AppConstants.maxChatMessageLength} character limit'
                                : null,
                          ),
                        ),
                      ),
                      const SizedBox(width: 4),
                      // Send button
                      Semantics(
                        label: 'Send message',
                        child: IconButton.filled(
                          onPressed:
                              (_canSend && !isResponding) ? _sendMessage : null,
                          icon: const Icon(Icons.send_rounded),
                          tooltip: 'Send',
                        ),
                      ),
                    ],
                  ),
                  // Character count indicator
                  if (_characterCount > 0)
                    Padding(
                      padding: const EdgeInsets.only(top: 4, right: 52),
                      child: Align(
                        alignment: Alignment.centerRight,
                        child: Text(
                          '$_characterCount/${AppConstants.maxChatMessageLength}',
                          style:
                              Theme.of(context).textTheme.bodySmall?.copyWith(
                                    color: _isOverLimit
                                        ? Theme.of(context).colorScheme.error
                                        : Theme.of(context)
                                            .colorScheme
                                            .onSurfaceVariant,
                                  ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

/// Empty state displayed when no messages exist yet.
class _EmptyChatView extends StatelessWidget {
  const _EmptyChatView();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.school_outlined,
              size: 64,
              color: Theme.of(context).colorScheme.primary.withOpacity(0.5),
            ),
            const SizedBox(height: 16),
            Text(
              'Hi! I\'m your AI Tutor',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
            ),
            const SizedBox(height: 8),
            Text(
              'Ask me anything about your ACT prep.\n'
              'You can type a question or upload an image\n'
              'of a problem you need help with.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                    height: 1.5,
                  ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Individual chat message bubble.
class _ChatBubble extends StatelessWidget {
  final ChatMessage message;

  const _ChatBubble({required this.message});

  @override
  Widget build(BuildContext context) {
    final isStudent = message.isStudent;
    final colorScheme = Theme.of(context).colorScheme;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment:
            isStudent ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!isStudent) ...[
            // AI avatar
            CircleAvatar(
              radius: 16,
              backgroundColor: colorScheme.primaryContainer,
              child: Icon(
                Icons.school_rounded,
                size: 18,
                color: colorScheme.onPrimaryContainer,
              ),
            ),
            const SizedBox(width: 8),
          ],
          Flexible(
            child: Container(
              padding: const EdgeInsets.symmetric(
                horizontal: 14,
                vertical: 10,
              ),
              decoration: BoxDecoration(
                color: isStudent
                    ? colorScheme.primary
                    : colorScheme.surfaceVariant,
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(16),
                  topRight: const Radius.circular(16),
                  bottomLeft:
                      isStudent ? const Radius.circular(16) : Radius.zero,
                  bottomRight:
                      isStudent ? Radius.zero : const Radius.circular(16),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (!isStudent)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Text(
                        'AI Tutor',
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                              color: colorScheme.onSurfaceVariant,
                              fontWeight: FontWeight.w600,
                            ),
                      ),
                    ),
                  Text(
                    message.content,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: isStudent
                              ? colorScheme.onPrimary
                              : colorScheme.onSurfaceVariant,
                          height: 1.4,
                        ),
                  ),
                ],
              ),
            ),
          ),
          if (isStudent) ...[
            const SizedBox(width: 8),
            // Student avatar
            CircleAvatar(
              radius: 16,
              backgroundColor: colorScheme.tertiaryContainer,
              child: Icon(
                Icons.person_rounded,
                size: 18,
                color: colorScheme.onTertiaryContainer,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Typing indicator shown while AI is generating a response.
class _TypingIndicator extends StatelessWidget {
  const _TypingIndicator();

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 16,
            backgroundColor: colorScheme.primaryContainer,
            child: Icon(
              Icons.school_rounded,
              size: 18,
              color: colorScheme.onPrimaryContainer,
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: colorScheme.surfaceVariant,
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(16),
                topRight: Radius.circular(16),
                bottomRight: Radius.circular(16),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                _AnimatedDot(delay: 0),
                const SizedBox(width: 4),
                _AnimatedDot(delay: 1),
                const SizedBox(width: 4),
                _AnimatedDot(delay: 2),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Animated dot used in the typing indicator.
class _AnimatedDot extends StatefulWidget {
  final int delay;

  const _AnimatedDot({required this.delay});

  @override
  State<_AnimatedDot> createState() => _AnimatedDotState();
}

class _AnimatedDotState extends State<_AnimatedDot>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );
    _animation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );
    Future.delayed(Duration(milliseconds: widget.delay * 200), () {
      if (mounted) {
        _controller.repeat(reverse: true);
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _animation,
      builder: (context, _) {
        return Transform.translate(
          offset: Offset(0, -4 * _animation.value),
          child: Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: Theme.of(context)
                  .colorScheme
                  .onSurfaceVariant
                  .withOpacity(0.5),
              shape: BoxShape.circle,
            ),
          ),
        );
      },
    );
  }
}

/// Error banner shown above the input area for non-image errors.
class _ErrorBanner extends StatelessWidget {
  final String message;
  final VoidCallback onDismiss;

  const _ErrorBanner({
    required this.message,
    required this.onDismiss,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      color: colorScheme.errorContainer,
      child: Row(
        children: [
          Icon(
            Icons.error_outline,
            size: 18,
            color: colorScheme.onErrorContainer,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: colorScheme.onErrorContainer,
                  ),
            ),
          ),
          IconButton(
            onPressed: onDismiss,
            icon: Icon(
              Icons.close,
              size: 18,
              color: colorScheme.onErrorContainer,
            ),
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(),
          ),
        ],
      ),
    );
  }
}
