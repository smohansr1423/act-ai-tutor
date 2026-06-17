import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:act_ai_tutor/screens/full_test_summary_screen.dart';
import 'package:act_ai_tutor/utils/app_router.dart';

void main() {
  group('FullTestSummaryScreen', () {
    /// Helper to build the screen with given score summary data.
    Widget buildTestWidget(Map<String, dynamic> scoreSummary) {
      return MaterialApp(
        onGenerateRoute: AppRouter.generateRoute,
        home: Builder(
          builder: (context) {
            return Scaffold(
              body: Navigator(
                onGenerateRoute: (settings) {
                  return MaterialPageRoute(
                    settings: RouteSettings(
                      name: AppRouter.fullTestSummary,
                      arguments: scoreSummary,
                    ),
                    builder: (_) => const FullTestSummaryScreen(),
                  );
                },
              ),
            );
          },
        ),
      );
    }

    testWidgets('displays score as correct out of total',
        (WidgetTester tester) async {
      final scoreSummary = {
        'score': {'correct': 32, 'total': 40},
        'details': <Map<String, dynamic>>[],
      };

      await tester.pumpWidget(buildTestWidget(scoreSummary));
      await tester.pumpAndSettle();

      // Verify score display shows "32 / 40 correct"
      expect(find.text('32 / 40 correct'), findsOneWidget);
      // Verify percentage is displayed (80%)
      expect(find.text('80%'), findsOneWidget);
    });

    testWidgets('displays performance badge based on percentage',
        (WidgetTester tester) async {
      // 80%+ should show "Excellent"
      final scoreSummary = {
        'score': {'correct': 35, 'total': 40},
        'details': <Map<String, dynamic>>[],
      };

      await tester.pumpWidget(buildTestWidget(scoreSummary));
      await tester.pumpAndSettle();

      expect(find.text('Excellent'), findsOneWidget);
    });

    testWidgets('displays "Good" badge for 60-79% score',
        (WidgetTester tester) async {
      final scoreSummary = {
        'score': {'correct': 28, 'total': 40},
        'details': <Map<String, dynamic>>[],
      };

      await tester.pumpWidget(buildTestWidget(scoreSummary));
      await tester.pumpAndSettle();

      expect(find.text('Good'), findsOneWidget);
    });

    testWidgets('displays "Needs Work" badge for below 60%',
        (WidgetTester tester) async {
      final scoreSummary = {
        'score': {'correct': 20, 'total': 40},
        'details': <Map<String, dynamic>>[],
      };

      await tester.pumpWidget(buildTestWidget(scoreSummary));
      await tester.pumpAndSettle();

      expect(find.text('Needs Work'), findsOneWidget);
    });

    testWidgets('displays per-question review list with question tiles',
        (WidgetTester tester) async {
      final scoreSummary = {
        'score': {'correct': 2, 'total': 3},
        'details': [
          {
            'questionId': 'q1',
            'questionText': 'What is 2+2?',
            'selectedAnswer': 'A',
            'correctAnswer': 'A',
            'isCorrect': true,
            'explanation': 'Basic addition: 2+2=4',
          },
          {
            'questionId': 'q2',
            'questionText': 'What is the capital of France?',
            'selectedAnswer': 'B',
            'correctAnswer': 'C',
            'isCorrect': false,
            'explanation': 'The capital of France is Paris.',
          },
          {
            'questionId': 'q3',
            'questionText': 'Which element has atomic number 1?',
            'selectedAnswer': null,
            'correctAnswer': 'A',
            'isCorrect': false,
            'explanation': 'Hydrogen has atomic number 1.',
          },
        ],
      };

      await tester.pumpWidget(buildTestWidget(scoreSummary));
      await tester.pumpAndSettle();

      // Verify question tiles are rendered
      expect(find.text('Q1'), findsOneWidget);
      expect(find.text('Q2'), findsOneWidget);
      expect(find.text('Q3'), findsOneWidget);
    });

    testWidgets(
        'shows student answer, correct answer, and explanation on expand',
        (WidgetTester tester) async {
      final scoreSummary = {
        'score': {'correct': 0, 'total': 1},
        'details': [
          {
            'questionId': 'q1',
            'questionText': 'What is 2+2?',
            'selectedAnswer': 'B',
            'correctAnswer': 'A',
            'isCorrect': false,
            'explanation': 'Two plus two equals four.',
          },
        ],
      };

      await tester.pumpWidget(buildTestWidget(scoreSummary));
      await tester.pumpAndSettle();

      // Expand the question tile
      await tester.tap(find.text('Q1'));
      await tester.pumpAndSettle();

      // Verify student's answer is shown
      expect(find.text('Your answer:'), findsOneWidget);
      expect(find.text('B'), findsWidgets);

      // Verify correct answer is shown
      expect(find.text('Correct answer:'), findsOneWidget);
      expect(find.text('A'), findsWidgets);

      // Verify explanation is shown
      expect(find.text('Explanation'), findsOneWidget);
      expect(find.text('Two plus two equals four.'), findsOneWidget);
    });

    testWidgets('shows skipped status for unanswered questions',
        (WidgetTester tester) async {
      final scoreSummary = {
        'score': {'correct': 0, 'total': 1},
        'details': [
          {
            'questionId': 'q1',
            'questionText': 'Skipped question',
            'selectedAnswer': null,
            'correctAnswer': 'C',
            'isCorrect': false,
            'explanation': 'The correct answer was C.',
          },
        ],
      };

      await tester.pumpWidget(buildTestWidget(scoreSummary));
      await tester.pumpAndSettle();

      // Expand the question tile
      await tester.tap(find.text('Q1'));
      await tester.pumpAndSettle();

      // Verify skipped status is shown
      expect(find.text('Skipped'), findsWidgets);
    });

    testWidgets('shows empty state when no details available',
        (WidgetTester tester) async {
      final scoreSummary = {
        'score': {'correct': 0, 'total': 0},
        'details': <Map<String, dynamic>>[],
      };

      await tester.pumpWidget(buildTestWidget(scoreSummary));
      await tester.pumpAndSettle();

      expect(find.text('No question details available.'), findsOneWidget);
    });

    testWidgets('has Practice Again and Go Home buttons',
        (WidgetTester tester) async {
      final scoreSummary = {
        'score': {'correct': 5, 'total': 10},
        'details': <Map<String, dynamic>>[],
      };

      await tester.pumpWidget(buildTestWidget(scoreSummary));
      await tester.pumpAndSettle();

      expect(find.text('Practice Again'), findsOneWidget);
      expect(find.text('Go Home'), findsOneWidget);
    });

    testWidgets('handles zero total gracefully (no division by zero)',
        (WidgetTester tester) async {
      final scoreSummary = {
        'score': {'correct': 0, 'total': 0},
        'details': <Map<String, dynamic>>[],
      };

      await tester.pumpWidget(buildTestWidget(scoreSummary));
      await tester.pumpAndSettle();

      // Should show 0% without crashing
      expect(find.text('0%'), findsOneWidget);
      expect(find.text('0 / 0 correct'), findsOneWidget);
    });
  });
}
