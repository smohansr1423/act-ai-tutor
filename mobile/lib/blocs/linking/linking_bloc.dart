import 'package:flutter_bloc/flutter_bloc.dart';

import '../../models/invitation.dart';
import '../../services/api_service.dart';
import 'linking_event.dart';
import 'linking_state.dart';

export 'linking_event.dart';
export 'linking_state.dart';

/// BLoC managing parent-student link invitations.
///
/// Handles sending invitations (parent), accepting/rejecting invitations
/// (student), and loading all invitations for the current user.
class LinkingBloc extends Bloc<LinkingEvent, LinkingState> {
  final ApiService apiService;

  LinkingBloc({required this.apiService}) : super(const LinkingInitial()) {
    on<LoadInvitations>(_onLoadInvitations);
    on<SendInvitation>(_onSendInvitation);
    on<AcceptInvitation>(_onAcceptInvitation);
    on<RejectInvitation>(_onRejectInvitation);
  }

  Future<void> _onLoadInvitations(
    LoadInvitations event,
    Emitter<LinkingState> emit,
  ) async {
    emit(const LinkingLoading());
    try {
      final response = await apiService.get('/auth/invitations');
      final invitationsJson = response['invitations'] as List<dynamic>;
      final invitations = invitationsJson
          .map((json) => Invitation.fromJson(json as Map<String, dynamic>))
          .toList();
      emit(InvitationsLoaded(invitations: invitations));
    } on ApiException catch (e) {
      emit(LinkingError(message: e.message));
    } catch (e) {
      emit(const LinkingError(message: 'Failed to load invitations.'));
    }
  }

  Future<void> _onSendInvitation(
    SendInvitation event,
    Emitter<LinkingState> emit,
  ) async {
    emit(const LinkingLoading());
    try {
      await apiService.post(
        '/auth/link-student',
        body: {'studentEmail': event.email},
      );
      emit(const InvitationSent());
      // Reload invitations to show updated list.
      add(const LoadInvitations());
    } on ApiException catch (e) {
      emit(LinkingError(message: e.message));
    } catch (e) {
      emit(const LinkingError(message: 'Failed to send invitation.'));
    }
  }

  Future<void> _onAcceptInvitation(
    AcceptInvitation event,
    Emitter<LinkingState> emit,
  ) async {
    emit(const LinkingLoading());
    try {
      await apiService.post(
        '/auth/accept-link',
        body: {'invitationId': event.invitationId},
      );
      // Reload invitations to reflect the change.
      add(const LoadInvitations());
    } on ApiException catch (e) {
      emit(LinkingError(message: e.message));
    } catch (e) {
      emit(const LinkingError(message: 'Failed to accept invitation.'));
    }
  }

  Future<void> _onRejectInvitation(
    RejectInvitation event,
    Emitter<LinkingState> emit,
  ) async {
    emit(const LinkingLoading());
    try {
      await apiService.post(
        '/auth/reject-link',
        body: {'invitationId': event.invitationId},
      );
      // Reload invitations to reflect the change.
      add(const LoadInvitations());
    } on ApiException catch (e) {
      emit(LinkingError(message: e.message));
    } catch (e) {
      emit(const LinkingError(message: 'Failed to reject invitation.'));
    }
  }
}
