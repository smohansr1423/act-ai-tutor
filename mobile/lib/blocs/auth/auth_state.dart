import 'package:equatable/equatable.dart';
import '../../models/user.dart';

/// States for the AuthBloc.
abstract class AuthState extends Equatable {
  const AuthState();

  @override
  List<Object?> get props => [];
}

/// Initial unauthenticated state.
class AuthInitial extends AuthState {
  const AuthInitial();
}

/// Loading state while processing auth request.
class AuthLoading extends AuthState {
  const AuthLoading();
}

/// Successfully authenticated state.
class AuthAuthenticated extends AuthState {
  final User user;
  final String token;

  const AuthAuthenticated({required this.user, required this.token});

  @override
  List<Object?> get props => [user, token];
}

/// Unauthenticated state (after logout or failed auth check).
class AuthUnauthenticated extends AuthState {
  const AuthUnauthenticated();
}

/// Auth error state.
class AuthError extends AuthState {
  final String message;

  const AuthError({required this.message});

  @override
  List<Object?> get props => [message];
}
