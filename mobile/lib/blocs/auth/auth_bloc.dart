import 'package:flutter_bloc/flutter_bloc.dart';

import '../../models/user.dart';
import '../../services/api_service.dart';
import 'auth_event.dart';
import 'auth_state.dart';

export 'auth_event.dart';
export 'auth_state.dart';

/// BLoC managing authentication state.
class AuthBloc extends Bloc<AuthEvent, AuthState> {
  final ApiService apiService;

  AuthBloc({required this.apiService}) : super(const AuthInitial()) {
    on<AuthLoginRequested>(_onLoginRequested);
    on<AuthRegisterRequested>(_onRegisterRequested);
    on<AuthLogoutRequested>(_onLogoutRequested);
    on<AuthCheckRequested>(_onCheckRequested);
  }

  Future<void> _onLoginRequested(
    AuthLoginRequested event,
    Emitter<AuthState> emit,
  ) async {
    emit(const AuthLoading());
    try {
      final response = await apiService.post(
        '/auth/login',
        body: {'email': event.email, 'password': event.password},
        requiresAuth: false,
      );

      final token = response['token'] as String;
      await apiService.saveToken(token);

      final user = User.fromJson(response['user'] as Map<String, dynamic>);
      emit(AuthAuthenticated(user: user, token: token));
    } on ApiException catch (e) {
      emit(AuthError(message: e.message));
    } catch (e) {
      emit(AuthError(message: 'Login failed. Please try again.'));
    }
  }

  Future<void> _onRegisterRequested(
    AuthRegisterRequested event,
    Emitter<AuthState> emit,
  ) async {
    emit(const AuthLoading());
    try {
      final response = await apiService.post(
        '/auth/register',
        body: {
          'name': event.name,
          'email': event.email,
          'password': event.password,
          'role': event.role,
          if (event.grade != null) 'grade': event.grade,
          if (event.targetScore != null) 'targetScore': event.targetScore,
        },
        requiresAuth: false,
      );

      final token = response['token'] as String;
      await apiService.saveToken(token);

      final user = User.fromJson(response['user'] as Map<String, dynamic>);
      emit(AuthAuthenticated(user: user, token: token));
    } on ApiException catch (e) {
      emit(AuthError(message: e.message));
    } catch (e) {
      emit(AuthError(message: 'Registration failed. Please try again.'));
    }
  }

  Future<void> _onLogoutRequested(
    AuthLogoutRequested event,
    Emitter<AuthState> emit,
  ) async {
    await apiService.clearToken();
    emit(const AuthUnauthenticated());
  }

  Future<void> _onCheckRequested(
    AuthCheckRequested event,
    Emitter<AuthState> emit,
  ) async {
    // Check if a valid token exists
    // This will be expanded with token validation later
    emit(const AuthUnauthenticated());
  }
}
