import 'package:equatable/equatable.dart';
import '../../models/invitation.dart';

/// States for the LinkingBloc.
abstract class LinkingState extends Equatable {
  const LinkingState();

  @override
  List<Object?> get props => [];
}

/// Initial state before any action.
class LinkingInitial extends LinkingState {
  const LinkingInitial();
}

/// Loading state while processing a linking action.
class LinkingLoading extends LinkingState {
  const LinkingLoading();
}

/// State after an invitation was successfully sent.
class InvitationSent extends LinkingState {
  final String message;

  const InvitationSent({this.message = 'Invitation sent successfully.'});

  @override
  List<Object?> get props => [message];
}

/// State when invitations have been loaded.
class InvitationsLoaded extends LinkingState {
  final List<Invitation> invitations;

  const InvitationsLoaded({required this.invitations});

  @override
  List<Object?> get props => [invitations];
}

/// Error state for linking operations.
class LinkingError extends LinkingState {
  final String message;

  const LinkingError({required this.message});

  @override
  List<Object?> get props => [message];
}
