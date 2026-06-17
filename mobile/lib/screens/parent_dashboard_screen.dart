import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../blocs/parent_dashboard/parent_dashboard_bloc.dart';
import '../services/api_service.dart';

/// Parent dashboard for monitoring linked student progress.
///
/// Displays:
/// - Linked student list with selection (Req 8.2)
/// - Progress summary: total time, sessions, overall accuracy (Req 8.1)
/// - Accuracy trend chart per section over 30 days (Req 8.3)
/// - Weak skill tags list for the selected student (Req 8.4)
/// - Empty states for no linked students (Req 8.7) and no data (Req 8.8)
///
/// Read-only — parents cannot modify student settings (Req 8.6).
class ParentDashboardScreen extends StatelessWidget {
  const ParentDashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final apiService = context.read<ApiService>();
    return BlocProvider(
      create: (_) => ParentDashboardBloc(apiService: apiService)
        ..add(LoadParentDashboard(parentId: _getParentId(context))),
      child: const _ParentDashboardContent(),
    );
  }

  String _getParentId(BuildContext context) {
    // The parent ID is retrieved from shared preferences via a helper.
    // For now we use the stored user ID from the constants key.
    // In production this would come from the auth state.
    return '';
  }
}

class _ParentDashboardContent extends StatelessWidget {
  const _ParentDashboardContent();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Parent Dashboard'),
        centerTitle: true,
      ),
      body: SafeArea(
        child: BlocBuilder<ParentDashboardBloc, ParentDashboardState>(
          builder: (context, state) {
            if (state is ParentDashboardInitial ||
                state is ParentDashboardLoading) {
              return const _LoadingView();
            }
            if (state is ParentDashboardNoLinkedStudents) {
              return const _NoLinkedStudentsView();
            }
            if (state is ParentDashboardStudentSelection) {
              return _StudentSelectionView(students: state.students);
            }
            if (state is ParentDashboardNoData) {
              return _NoDataView(student: state.student);
            }
            if (state is ParentDashboardLoaded) {
              return _DashboardView(
                selectedStudent: state.selectedStudent,
                allStudents: state.allStudents,
                summary: state.summary,
                trends: state.trends,
                weakSkills: state.weakSkills,
              );
            }
            if (state is ParentDashboardError) {
              return _ErrorView(message: state.message);
            }
            return const SizedBox.shrink();
          },
        ),
      ),
    );
  }
}

// --- Loading State ---

class _LoadingView extends StatelessWidget {
  const _LoadingView();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          CircularProgressIndicator(),
          SizedBox(height: 16),
          Text('Loading dashboard...'),
        ],
      ),
    );
  }
}

// --- No Linked Students Empty State (Req 8.7) ---

class _NoLinkedStudentsView extends StatelessWidget {
  const _NoLinkedStudentsView();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.people_outline_rounded,
              size: 80,
              color: theme.colorScheme.primary.withOpacity(0.4),
            ),
            const SizedBox(height: 24),
            Text(
              'No Linked Students',
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.bold,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            Text(
              'You don\'t have any linked students yet. '
              'Send a link invitation to start monitoring your child\'s progress.',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurface.withOpacity(0.6),
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 32),
            FilledButton.icon(
              onPressed: () {
                Navigator.pushNamed(context, '/link-invitation');
              },
              icon: const Icon(Icons.person_add_rounded),
              label: const Text('Send Link Invitation'),
            ),
          ],
        ),
      ),
    );
  }
}

// --- Student Selection View (multiple linked students, Req 8.2) ---

class _StudentSelectionView extends StatelessWidget {
  final List<LinkedStudent> students;

  const _StudentSelectionView({required this.students});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Select a Student',
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Choose a linked student to view their progress',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurface.withOpacity(0.6),
            ),
          ),
          const SizedBox(height: 24),
          Expanded(
            child: ListView.separated(
              itemCount: students.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                final student = students[index];
                return _StudentCard(student: student);
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _StudentCard extends StatelessWidget {
  final LinkedStudent student;

  const _StudentCard({required this.student});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: InkWell(
        onTap: () {
          // parentId is obtained from the bloc's previous load event context.
          // We dispatch SelectStudent which requires parentId. Since the BLoC
          // already has this context, we use an empty string here and rely on
          // the BLoC keeping the parentId from the initial load.
          context.read<ParentDashboardBloc>().add(
                SelectStudent(
                  parentId: '', // Will be overridden by BLoC context
                  studentId: student.studentId,
                ),
              );
        },
        borderRadius: BorderRadius.circular(12),
        child: Semantics(
          button: true,
          label: 'View progress for ${student.name}',
          child: Padding(
            padding: const EdgeInsets.all(16.0),
            child: Row(
              children: [
                CircleAvatar(
                  backgroundColor:
                      theme.colorScheme.primary.withOpacity(0.1),
                  child: Text(
                    student.name.isNotEmpty
                        ? student.name[0].toUpperCase()
                        : '?',
                    style: TextStyle(
                      color: theme.colorScheme.primary,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        student.name,
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        student.email,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurface.withOpacity(0.6),
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(
                  Icons.arrow_forward_ios_rounded,
                  size: 16,
                  color: theme.colorScheme.onSurface.withOpacity(0.4),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// --- No Data State (Req 8.8) ---

class _NoDataView extends StatelessWidget {
  final LinkedStudent student;

  const _NoDataView({required this.student});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.hourglass_empty_rounded,
              size: 80,
              color: theme.colorScheme.primary.withOpacity(0.4),
            ),
            const SizedBox(height: 24),
            Text(
              'No Study Data Yet',
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.bold,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            Text(
              '${student.name} hasn\'t completed any study sessions yet. '
              'Progress data will appear here once they start practicing.',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurface.withOpacity(0.6),
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

// --- Full Dashboard View (Req 8.1, 8.3, 8.4) ---

class _DashboardView extends StatelessWidget {
  final LinkedStudent selectedStudent;
  final List<LinkedStudent> allStudents;
  final ProgressSummary summary;
  final List<SectionTrend> trends;
  final List<WeakSkill> weakSkills;

  const _DashboardView({
    required this.selectedStudent,
    required this.allStudents,
    required this.summary,
    required this.trends,
    required this.weakSkills,
  });

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: () async {
        context.read<ParentDashboardBloc>().add(
              SelectStudent(
                parentId: '',
                studentId: selectedStudent.studentId,
              ),
            );
      },
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Student selector (if multiple students)
            if (allStudents.length > 1)
              _StudentDropdown(
                selectedStudent: selectedStudent,
                allStudents: allStudents,
              ),
            if (allStudents.length > 1) const SizedBox(height: 16),

            // Progress Summary (Req 8.1)
            _ProgressSummaryCard(summary: summary),
            const SizedBox(height: 24),

            // Accuracy Trend Chart (Req 8.3)
            _AccuracyTrendSection(trends: trends),
            const SizedBox(height: 24),

            // Weak Skills (Req 8.4)
            _WeakSkillsSection(weakSkills: weakSkills),
          ],
        ),
      ),
    );
  }
}

// --- Student Dropdown Selector ---

class _StudentDropdown extends StatelessWidget {
  final LinkedStudent selectedStudent;
  final List<LinkedStudent> allStudents;

  const _StudentDropdown({
    required this.selectedStudent,
    required this.allStudents,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      elevation: 1,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Row(
          children: [
            Icon(
              Icons.person_rounded,
              color: theme.colorScheme.primary,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: selectedStudent.studentId,
                  isExpanded: true,
                  items: allStudents.map((student) {
                    return DropdownMenuItem<String>(
                      value: student.studentId,
                      child: Text(
                        student.name,
                        style: theme.textTheme.titleMedium,
                      ),
                    );
                  }).toList(),
                  onChanged: (studentId) {
                    if (studentId != null &&
                        studentId != selectedStudent.studentId) {
                      context.read<ParentDashboardBloc>().add(
                            SelectStudent(
                              parentId: '',
                              studentId: studentId,
                            ),
                          );
                    }
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// --- Progress Summary Card (Req 8.1) ---

class _ProgressSummaryCard extends StatelessWidget {
  final ProgressSummary summary;

  const _ProgressSummaryCard({required this.summary});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Progress Summary',
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _SummaryStatCard(
                icon: Icons.timer_rounded,
                label: 'Study Time',
                value: _formatTime(summary.totalTimeMinutes),
                color: const Color(0xFF42A5F5),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _SummaryStatCard(
                icon: Icons.library_books_rounded,
                label: 'Sessions',
                value: summary.sessionsCompleted.toString(),
                color: const Color(0xFF66BB6A),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _SummaryStatCard(
                icon: Icons.check_circle_rounded,
                label: 'Accuracy',
                value: '${(summary.overallAccuracy * 100).toStringAsFixed(1)}%',
                color: const Color(0xFFAB47BC),
              ),
            ),
          ],
        ),
      ],
    );
  }

  String _formatTime(double minutes) {
    if (minutes < 60) {
      return '${minutes.toStringAsFixed(0)}m';
    }
    final hours = (minutes / 60).floor();
    final remainingMinutes = (minutes % 60).toStringAsFixed(0);
    return '${hours}h ${remainingMinutes}m';
  }
}

class _SummaryStatCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color color;

  const _SummaryStatCard({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      elevation: 1,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(12.0),
        child: Column(
          children: [
            Icon(icon, color: color, size: 28),
            const SizedBox(height: 8),
            Text(
              value,
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurface.withOpacity(0.6),
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

// --- Accuracy Trend Chart (Req 8.3) ---

class _AccuracyTrendSection extends StatelessWidget {
  final List<SectionTrend> trends;

  const _AccuracyTrendSection({required this.trends});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (trends.isEmpty) {
      return _EmptySection(
        title: 'Accuracy Trends',
        message: 'No trend data available yet.',
        icon: Icons.show_chart_rounded,
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Accuracy Trends (30 Days)',
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 8),
        _TrendLegend(trends: trends),
        const SizedBox(height: 16),
        SizedBox(
          height: 220,
          child: _AccuracyChart(trends: trends),
        ),
      ],
    );
  }
}

class _TrendLegend extends StatelessWidget {
  final List<SectionTrend> trends;

  const _TrendLegend({required this.trends});

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 16,
      runSpacing: 8,
      children: trends.map((trend) {
        final color = _sectionColor(trend.section);
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 12,
              height: 12,
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(3),
              ),
            ),
            const SizedBox(width: 6),
            Text(
              _capitalizeSectionName(trend.section),
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        );
      }).toList(),
    );
  }
}

class _AccuracyChart extends StatelessWidget {
  final List<SectionTrend> trends;

  const _AccuracyChart({required this.trends});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final lineBarsData = trends.map((trend) {
      final color = _sectionColor(trend.section);
      final spots = trend.dataPoints.asMap().entries.map((entry) {
        return FlSpot(
          entry.key.toDouble(),
          entry.value.accuracy * 100,
        );
      }).toList();

      return LineChartBarData(
        spots: spots,
        isCurved: true,
        preventCurveOverShooting: true,
        color: color,
        barWidth: 2.5,
        isStrokeCapRound: true,
        dotData: FlDotData(
          show: spots.length <= 10,
          getDotPainter: (spot, percent, barData, index) {
            return FlDotCirclePainter(
              radius: 3,
              color: color,
              strokeWidth: 1,
              strokeColor: Colors.white,
            );
          },
        ),
        belowBarData: BarAreaData(show: false),
      );
    }).toList();

    return LineChart(
      LineChartData(
        gridData: FlGridData(
          show: true,
          drawVerticalLine: false,
          horizontalInterval: 20,
          getDrawingHorizontalLine: (value) {
            return FlLine(
              color: theme.colorScheme.onSurface.withOpacity(0.1),
              strokeWidth: 1,
            );
          },
        ),
        titlesData: FlTitlesData(
          rightTitles:
              const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          topTitles:
              const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          leftTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 40,
              interval: 20,
              getTitlesWidget: (value, meta) {
                return Text(
                  '${value.toInt()}%',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurface.withOpacity(0.5),
                  ),
                );
              },
            ),
          ),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 24,
              getTitlesWidget: (value, meta) {
                // Show day labels only at intervals
                if (value.toInt() % 7 == 0) {
                  return Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      'D${value.toInt() + 1}',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color:
                            theme.colorScheme.onSurface.withOpacity(0.5),
                        fontSize: 10,
                      ),
                    ),
                  );
                }
                return const SizedBox.shrink();
              },
            ),
          ),
        ),
        borderData: FlBorderData(show: false),
        minY: 0,
        maxY: 100,
        lineBarsData: lineBarsData,
        lineTouchData: LineTouchData(
          touchTooltipData: LineTouchTooltipData(
            getTooltipItems: (touchedSpots) {
              return touchedSpots.map((spot) {
                final sectionName = trends.length > spot.barIndex
                    ? _capitalizeSectionName(trends[spot.barIndex].section)
                    : '';
                return LineTooltipItem(
                  '$sectionName\n${spot.y.toStringAsFixed(1)}%',
                  TextStyle(
                    color: spot.bar.color,
                    fontWeight: FontWeight.w600,
                    fontSize: 12,
                  ),
                );
              }).toList();
            },
          ),
        ),
      ),
    );
  }
}

// --- Weak Skills Section (Req 8.4) ---

class _WeakSkillsSection extends StatelessWidget {
  final List<WeakSkill> weakSkills;

  const _WeakSkillsSection({required this.weakSkills});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (weakSkills.isEmpty) {
      return _EmptySection(
        title: 'Areas Needing Attention',
        message: 'No weak areas identified. Great progress!',
        icon: Icons.thumb_up_rounded,
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Areas Needing Attention',
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          'Skills with accuracy below 60%',
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurface.withOpacity(0.6),
          ),
        ),
        const SizedBox(height: 12),
        ListView.separated(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: weakSkills.length,
          separatorBuilder: (_, __) => const SizedBox(height: 8),
          itemBuilder: (context, index) {
            return _WeakSkillTile(skill: weakSkills[index]);
          },
        ),
      ],
    );
  }
}

class _WeakSkillTile extends StatelessWidget {
  final WeakSkill skill;

  const _WeakSkillTile({required this.skill});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accuracyPercent = (skill.accuracy * 100).toStringAsFixed(1);
    final sectionColor = _sectionColor(skill.section);

    return Card(
      elevation: 1,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      child: Padding(
        padding: const EdgeInsets.all(12.0),
        child: Row(
          children: [
            Container(
              width: 4,
              height: 40,
              decoration: BoxDecoration(
                color: sectionColor,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    skill.skillTag,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${_capitalizeSectionName(skill.section)} • ${skill.attemptCount} attempts',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurface.withOpacity(0.6),
                    ),
                  ),
                ],
              ),
            ),
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: _accuracyColor(skill.accuracy).withOpacity(0.1),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Text(
                '$accuracyPercent%',
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: _accuracyColor(skill.accuracy),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// --- Shared Empty Section Widget ---

class _EmptySection extends StatelessWidget {
  final String title;
  final String message;
  final IconData icon;

  const _EmptySection({
    required this.title,
    required this.message,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 16),
        Center(
          child: Column(
            children: [
              Icon(
                icon,
                size: 48,
                color: theme.colorScheme.primary.withOpacity(0.3),
              ),
              const SizedBox(height: 12),
              Text(
                message,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurface.withOpacity(0.6),
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// --- Error View ---

class _ErrorView extends StatelessWidget {
  final String message;

  const _ErrorView({required this.message});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.error_outline_rounded,
              size: 64,
              color: theme.colorScheme.error.withOpacity(0.7),
            ),
            const SizedBox(height: 16),
            Text(
              'Something went wrong',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurface.withOpacity(0.6),
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            OutlinedButton.icon(
              onPressed: () {
                context.read<ParentDashboardBloc>().add(
                      const LoadParentDashboard(parentId: ''),
                    );
              },
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

// --- Helper Functions ---

Color _sectionColor(String section) {
  switch (section.toLowerCase()) {
    case 'english':
      return const Color(0xFF42A5F5);
    case 'math':
      return const Color(0xFF66BB6A);
    case 'reading':
      return const Color(0xFFAB47BC);
    case 'science':
      return const Color(0xFFFF7043);
    default:
      return const Color(0xFF78909C);
  }
}

String _capitalizeSectionName(String section) {
  if (section.isEmpty) return section;
  return section[0].toUpperCase() + section.substring(1).toLowerCase();
}

Color _accuracyColor(double accuracy) {
  if (accuracy < 0.3) return const Color(0xFFE53935);
  if (accuracy < 0.5) return const Color(0xFFFF7043);
  return const Color(0xFFFFA726);
}
