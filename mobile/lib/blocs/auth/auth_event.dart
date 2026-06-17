import 'package:equatable/equatable.dart';

/// Events for the AuthBloc.
abstract class AuthEvent extends Equatable {
  const AuthEvent();

  @override
  List<Object?> get props => [];
}

/// Login request event.
class AuthLoginRequested extends AuthEvent {
  final String email;
  final String password;

  const AuthLoginRequested({required this.email, required this.password});

  @override
  List<Object?> get props => [email, password];
}

/// Registration request event.
class AuthRegisterRequested extends AuthEvent {
  final String name;
  final String email;
  final String password;
  final String role;
  final int? grade;
  final int? targetScore;

  const AuthRegisterRequested({
    required this.name,
    required this.email,
    required this.password,
    required this.role,
    this.grade,
    this.targetScore,
  });

  @override
  List<Object?> get props => [name, email, password, role, grade, targetScore];
}

/// Logout event.
class AuthLogoutRequested extends AuthEvent {
  const AuthLogoutRequested();
}

/// Check if user is already authenticated.
class AuthCheckRequested extends AuthEvent {
  const AuthCheckRequested();
}
