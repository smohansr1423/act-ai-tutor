import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../blocs/linking/linking_bloc.dart';
import '../models/invitation.dart';
import '../models/enums.dart';

/// Screen for parents to send link invitations to students
/// and view invitation statuses.
class LinkInvitationScreen extends StatefulWidget {
  const LinkInvitationScreen({super.key});

  @override
  State<LinkInvitationScreen> createState() => _LinkInvitationScreenState();
}

class _LinkInvitationScreenState extends State<LinkInvitationScreen> {
  final _emailController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  @override
  void initState() {
    super.initState();
    context.read<LinkingBloc>().add(const LoadInvitations());
  }

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  void _sendInvitation() {
    if (_formKey.currentState?.validate() ?? false) {
      context.read<LinkingBloc>().add(
            SendInvitation(email: _emailController.text.trim()),
          );
      _emailController.clear();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Link a Student'),
      ),
      body: BlocConsumer<LinkingBloc, LinkingState>(
        listener: (context, state) {
          if (state is InvitationSent) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(state.message),
                backgroundColor: Colors.green,
              ),
            );
          } else if (state is LinkingError) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(state.message),
                backgroundColor: Colors.red,
              ),
            );
          }
        },
        builder: (context, state) {
          return Padding(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _buildInvitationForm(state),
                const SizedBox(height: 24),
                const Divider(),
                const SizedBox(height: 16),
                Text(
                  'Invitations',
                  style: Theme.of(context).textTheme.titleMedium,
                  semanticsLabel: 'Invitations list',
                ),
                const SizedBox(height: 12),
                Expanded(child: _buildInvitationsList(state)),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildInvitationForm(LinkingState state) {
    final isLoading = state is LinkingLoading;

    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Send an invitation to link with a student account.',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _emailController,
            keyboardType: TextInputType.emailAddress,
            autocorrect: false,
            decoration: const InputDecoration(
              labelText: 'Student email address',
              hintText: 'Enter student email',
              prefixIcon: Icon(Icons.email_outlined),
              border: OutlineInputBorder(),
            ),
            validator: (value) {
              if (value == null || value.trim().isEmpty) {
                return 'Please enter a student email address.';
              }
              final emailRegex = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');
              if (!emailRegex.hasMatch(value.trim())) {
                return 'Please enter a valid email address.';
              }
              return null;
            },
          ),
          const SizedBox(height: 12),
          ElevatedButton.icon(
            onPressed: isLoading ? null : _sendInvitation,
            icon: isLoading
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.send),
            label: const Text('Send Invitation'),
          ),
        ],
      ),
    );
  }

  Widget _buildInvitationsList(LinkingState state) {
    if (state is LinkingLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (state is InvitationsLoaded) {
      final invitations = state.invitations;

      if (invitations.isEmpty) {
        return Center(
          child: Text(
            'No invitations sent yet.',
            style: Theme.of(context).textTheme.bodyLarge,
          ),
        );
      }

      return ListView.separated(
        itemCount: invitations.length,
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (context, index) {
          final invitation = invitations[index];
          return _InvitationTile(invitation: invitation);
        },
      );
    }

    // Initial or error state with no data
    return const SizedBox.shrink();
  }
}

class _InvitationTile extends StatelessWidget {
  final Invitation invitation;

  const _InvitationTile({required this.invitation});

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: _buildStatusIcon(),
      title: Text(invitation.studentEmail),
      subtitle: Text('Status: ${invitation.status.value}'),
      trailing: _buildStatusChip(),
    );
  }

  Widget _buildStatusIcon() {
    switch (invitation.status) {
      case LinkStatus.pending:
        return const Icon(Icons.hourglass_empty, color: Colors.orange);
      case LinkStatus.accepted:
        return const Icon(Icons.check_circle, color: Colors.green);
      case LinkStatus.rejected:
        return const Icon(Icons.cancel, color: Colors.red);
    }
  }

  Widget _buildStatusChip() {
    Color chipColor;
    switch (invitation.status) {
      case LinkStatus.pending:
        chipColor = Colors.orange;
        break;
      case LinkStatus.accepted:
        chipColor = Colors.green;
        break;
      case LinkStatus.rejected:
        chipColor = Colors.red;
        break;
    }

    return Chip(
      label: Text(
        invitation.status.value.toUpperCase(),
        style: const TextStyle(color: Colors.white, fontSize: 11),
      ),
      backgroundColor: chipColor,
      padding: EdgeInsets.zero,
    );
  }
}
