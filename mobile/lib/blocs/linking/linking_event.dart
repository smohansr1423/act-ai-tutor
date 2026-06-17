import 'package:equatable/equatable.dart';

/// Events for the LinkingBloc.
abstract class LinkingEvent extends Equatable {
  const LinkingEvent();

  @override
  List<Object?> get props => [];
}

/// Load all invitations for the current user.
class LoadInvitations extends LinkingEvent {
  const LoadInvitations();
}

/// Send a link invitation to a student by email (parent action).
class SendInvitation extends LinkingEvent {
  final String email;

  const SendInvitation({required this.email});

  @override
  List<Object?> get props => [email];
}

/// Accept a pending invitation (student action).
class AcceptInvitation extends LinkingEvent {
  final String invitationId;

  const AcceptInvitation({required this.invitationId});

  @override
  List<Object?> get props => [invitationId];
}

/// Reject a pending invitation (student action).
class RejectInvitation extends LinkingEvent {
  final String invitationId;

  const RejectInvitation({required this.invitationId});

  @override
  List<Object?> get props => [invitationId];
}
