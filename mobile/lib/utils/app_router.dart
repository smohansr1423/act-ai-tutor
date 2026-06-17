import 'package:flutter/material.dart';
import '../screens/login_screen.dart';
import '../screens/register_screen.dart';
import '../screens/home_screen.dart';
import '../screens/practice_screen.dart';
import '../screens/practice_question_screen.dart';
import '../screens/practice_summary_screen.dart';
import '../screens/full_test_screen.dart';
import '../screens/full_test_question_screen.dart';
import '../screens/full_test_summary_screen.dart';
import '../screens/resume_session_screen.dart';
import '../screens/chat_screen.dart';
import '../screens/analytics_screen.dart';
import '../screens/parent_dashboard_screen.dart';
import '../screens/settings_screen.dart';
import '../screens/link_invitation_screen.dart';
import '../screens/invitation_acceptance_screen.dart';

/// Centralized routing configuration for the app.
/// Named routes for all screens per the design spec.
class AppRouter {
  // Route names
  static const String login = '/login';
  static const String register = '/register';
  static const String home = '/home';
  static const String practice = '/practice';
  static const String practiceQuestion = '/practice/question';
  static const String practiceSummary = '/practice/summary';
  static const String fullTest = '/fulltest';
  static const String fullTestQuestion = '/fulltest/question';
  static const String fullTestSummary = '/fulltest/summary';
  static const String resumeSession = '/fulltest/resume';
  static const String chat = '/chat';
  static const String analytics = '/analytics';
  static const String parentDashboard = '/parent-dashboard';
  static const String linkInvitation = '/link-invitation';
  static const String invitationAcceptance = '/invitation-acceptance';
  static const String settings = '/settings';

  /// Generate routes based on route name.
  static Route<dynamic> generateRoute(RouteSettings routeSettings) {
    switch (routeSettings.name) {
      case login:
        return MaterialPageRoute(
          builder: (_) => const LoginScreen(),
          settings: routeSettings,
        );
      case register:
        return MaterialPageRoute(
          builder: (_) => const RegisterScreen(),
          settings: routeSettings,
        );
      case home:
        return MaterialPageRoute(
          builder: (_) => const HomeScreen(),
          settings: routeSettings,
        );
      case practice:
        return MaterialPageRoute(
          builder: (_) => const PracticeScreen(),
          settings: routeSettings,
        );
      case practiceQuestion:
        return MaterialPageRoute(
          builder: (_) => const PracticeQuestionScreen(),
          settings: routeSettings,
        );
      case practiceSummary:
        final summary =
            routeSettings.arguments as PracticeSessionSummary;
        return MaterialPageRoute(
          builder: (_) => PracticeSummaryScreen(summary: summary),
          settings: routeSettings,
        );
      case fullTest:
        return MaterialPageRoute(
          builder: (_) => const FullTestScreen(),
          settings: routeSettings,
        );
      case fullTestQuestion:
        return MaterialPageRoute(
          builder: (_) => const FullTestQuestionScreen(),
          settings: routeSettings,
        );
      case fullTestSummary:
        return MaterialPageRoute(
          builder: (_) => const FullTestSummaryScreen(),
          settings: routeSettings,
        );
      case resumeSession:
        return MaterialPageRoute(
          builder: (_) => const ResumeSessionScreen(),
          settings: routeSettings,
        );
      case chat:
        return MaterialPageRoute(
          builder: (_) => const ChatScreen(),
          settings: routeSettings,
        );
      case analytics:
        return MaterialPageRoute(
          builder: (_) => const AnalyticsScreen(),
          settings: routeSettings,
        );
      case parentDashboard:
        return MaterialPageRoute(
          builder: (_) => const ParentDashboardScreen(),
          settings: routeSettings,
        );
      case linkInvitation:
        return MaterialPageRoute(
          builder: (_) => const LinkInvitationScreen(),
          settings: routeSettings,
        );
      case invitationAcceptance:
        return MaterialPageRoute(
          builder: (_) => const InvitationAcceptanceScreen(),
          settings: routeSettings,
        );
      case settings:
        return MaterialPageRoute(
          builder: (_) => const SettingsScreen(),
          settings: routeSettings,
        );
      default:
        return MaterialPageRoute(
          builder: (_) => const Scaffold(
            body: Center(child: Text('Route not found')),
          ),
          settings: routeSettings,
        );
    }
  }
}
