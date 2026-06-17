import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../blocs/analytics/analytics_bloc.dart';

/// Student analytics dashboard screen.
///
/// Displays:
/// - Score trend chart (accuracy over 30 days per section) [Req 7.1]
/// - Weak skills list (up to 10, ranked by accuracy) [Req 7.2]
/// - Average time per question per section [Req 7.3]
/// - Accuracy per section [Req 7.4]
/// - Insufficient data messaging [Req 7.6]
/// - No weak areas messaging [Req 7.7]
class AnalyticsScreen extends StatelessWidget {
  const AnalyticsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Analytics'),
      ),
      body: BlocBuilder<AnalyticsBloc, AnalyticsState>(
        builder: (context, state) {
          if (state is AnalyticsInitial) {
            return const Center(
              child: Text('Tap refresh to load analytics.'),
            );
          }
          if (state is AnalyticsLoading) {
            return const Center(child: CircularProgressIndicator());
          }
          if (state is AnalyticsError) {
            return _ErrorView(message: state.message);
          }
          if (state is AnalyticsLoaded) {
            return _AnalyticsDashboardView(data: state.data);
          }
          return const SizedBox.shrink();
        },
      ),
    );
  }
}

/// Error view with retry option.
class _ErrorView extends StatelessWidget {
  final String message;

  const _ErrorView({required this.message});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 48, color: Colors.red),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: () {
                // Retry loading - parent widget should provide userId
              },
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Main dashboard content view showing all analytics widgets.
class _AnalyticsDashboardView extends StatelessWidget {
  final AnalyticsDashboardData data;

  const _AnalyticsDashboardView({required this.data});

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: () async {
        // Refresh handled by parent BLoC provider
      },
      child: ListView(
        padding: const EdgeInsets.all(16.0),
        children: [
          _ScoreTrendSection(trends: data.scoreTrends),
          const SizedBox(height: 24),
          _AccuracyPerSectionCard(accuracyList: data.accuracyPerSection),
          const SizedBox(height: 24),
          _AvgTimePerSectionCard(avgTimeList: data.avgTimePerSection),
          const SizedBox(height: 24),
          _WeakSkillsSection(weakSkills: data.weakSkills),
        ],
      ),
    );
  }
}


// ---------------------------------------------------------------------------
// Score Trend Chart (Req 7.1)
// ---------------------------------------------------------------------------

/// Displays a line chart showing accuracy percentage over the last 30 days
/// per section. Each section is a separate colored line.
class _ScoreTrendSection extends StatelessWidget {
  final List<SectionScoreTrend> trends;

  const _ScoreTrendSection({required this.trends});

  static const _sectionColors = {
    'english': Colors.blue,
    'math': Colors.red,
    'reading': Colors.green,
    'science': Colors.orange,
  };

  @override
  Widget build(BuildContext context) {
    final hasData = trends.any((t) => t.dataPoints.isNotEmpty);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Score Trend (Last 30 Days)',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            if (!hasData)
              const _InsufficientDataMessage(
                message: 'No score data available yet.',
              )
            else ...[
              SizedBox(
                height: 200,
                child: _buildChart(),
              ),
              const SizedBox(height: 12),
              _buildLegend(),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildChart() {
    final lineBars = <LineChartBarData>[];

    for (final trend in trends) {
      if (trend.dataPoints.isEmpty) continue;

      final color =
          _sectionColors[trend.section.toLowerCase()] ?? Colors.grey;

      // Sort data points by date
      final sorted = List<ScoreTrendPoint>.from(trend.dataPoints)
        ..sort((a, b) => a.date.compareTo(b.date));

      final spots = sorted.asMap().entries.map((entry) {
        return FlSpot(
          entry.key.toDouble(),
          entry.value.accuracy * 100,
        );
      }).toList();

      lineBars.add(
        LineChartBarData(
          spots: spots,
          isCurved: true,
          preventCurveOverShooting: true,
          color: color,
          barWidth: 2,
          dotData: const FlDotData(show: true),
          belowBarData: BarAreaData(show: false),
        ),
      );
    }

    return LineChart(
      LineChartData(
        lineBarsData: lineBars,
        minY: 0,
        maxY: 100,
        titlesData: FlTitlesData(
          leftTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 40,
              getTitlesWidget: (value, meta) {
                return Text(
                  '${value.toInt()}%',
                  style: const TextStyle(fontSize: 10),
                );
              },
            ),
          ),
          bottomTitles: const AxisTitles(
            sideTitles: SideTitles(showTitles: false),
          ),
          topTitles: const AxisTitles(
            sideTitles: SideTitles(showTitles: false),
          ),
          rightTitles: const AxisTitles(
            sideTitles: SideTitles(showTitles: false),
          ),
        ),
        gridData: FlGridData(
          show: true,
          horizontalInterval: 25,
          getDrawingHorizontalLine: (value) => FlLine(
            color: Colors.grey.withOpacity(0.2),
            strokeWidth: 1,
          ),
        ),
        borderData: FlBorderData(show: false),
        lineTouchData: LineTouchData(
          touchTooltipData: LineTouchTooltipData(
            getTooltipItems: (touchedSpots) {
              return touchedSpots.map((spot) {
                return LineTooltipItem(
                  '${spot.y.toStringAsFixed(1)}%',
                  TextStyle(
                    color: spot.bar.color ?? Colors.white,
                    fontWeight: FontWeight.bold,
                  ),
                );
              }).toList();
            },
          ),
        ),
      ),
    );
  }

  Widget _buildLegend() {
    return Wrap(
      spacing: 16,
      runSpacing: 8,
      children: trends.map((trend) {
        final color =
            _sectionColors[trend.section.toLowerCase()] ?? Colors.grey;
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 12,
              height: 12,
              decoration: BoxDecoration(
                color: color,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 4),
            Text(
              _capitalize(trend.section),
              style: const TextStyle(fontSize: 12),
            ),
          ],
        );
      }).toList(),
    );
  }

  String _capitalize(String s) {
    if (s.isEmpty) return s;
    return s[0].toUpperCase() + s.substring(1).toLowerCase();
  }
}

// ---------------------------------------------------------------------------
// Accuracy Per Section (Req 7.4, 7.6)
// ---------------------------------------------------------------------------

/// Displays accuracy percentage for each section, or an insufficient data
/// message for sections with fewer than 5 performance records.
class _AccuracyPerSectionCard extends StatelessWidget {
  final List<SectionAccuracy> accuracyList;

  const _AccuracyPerSectionCard({required this.accuracyList});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Accuracy by Section',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            if (accuracyList.isEmpty)
              const _InsufficientDataMessage(
                message: 'No accuracy data available yet.',
              )
            else
              ...accuracyList.map((item) => _AccuracySectionRow(item: item)),
          ],
        ),
      ),
    );
  }
}

class _AccuracySectionRow extends StatelessWidget {
  final SectionAccuracy item;

  const _AccuracySectionRow({required this.item});

  @override
  Widget build(BuildContext context) {
    if (item.insufficientData) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 8.0),
        child: Row(
          children: [
            Expanded(
              flex: 2,
              child: Text(
                _capitalize(item.section),
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ),
            Expanded(
              flex: 3,
              child: Text(
                'Insufficient data for this section',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Colors.grey,
                      fontStyle: FontStyle.italic,
                    ),
              ),
            ),
          ],
        ),
      );
    }

    final percentage = (item.accuracy * 100).toStringAsFixed(1);
    final color = _colorForAccuracy(item.accuracy);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0),
      child: Row(
        children: [
          Expanded(
            flex: 2,
            child: Text(
              _capitalize(item.section),
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ),
          Expanded(
            flex: 3,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                LinearProgressIndicator(
                  value: item.accuracy,
                  backgroundColor: Colors.grey[200],
                  color: color,
                  minHeight: 8,
                  borderRadius: BorderRadius.circular(4),
                ),
                const SizedBox(height: 4),
                Text(
                  '$percentage%',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: color,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Color _colorForAccuracy(double accuracy) {
    if (accuracy >= 0.8) return Colors.green;
    if (accuracy >= 0.6) return Colors.orange;
    return Colors.red;
  }

  String _capitalize(String s) {
    if (s.isEmpty) return s;
    return s[0].toUpperCase() + s.substring(1).toLowerCase();
  }
}

// ---------------------------------------------------------------------------
// Average Time Per Question Per Section (Req 7.3, 7.6)
// ---------------------------------------------------------------------------

/// Displays average time per question in seconds, broken down by section.
class _AvgTimePerSectionCard extends StatelessWidget {
  final List<SectionAvgTime> avgTimeList;

  const _AvgTimePerSectionCard({required this.avgTimeList});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Average Time per Question',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            if (avgTimeList.isEmpty)
              const _InsufficientDataMessage(
                message: 'No timing data available yet.',
              )
            else
              ...avgTimeList.map((item) => _AvgTimeSectionRow(item: item)),
          ],
        ),
      ),
    );
  }
}

class _AvgTimeSectionRow extends StatelessWidget {
  final SectionAvgTime item;

  const _AvgTimeSectionRow({required this.item});

  @override
  Widget build(BuildContext context) {
    if (item.insufficientData) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 8.0),
        child: Row(
          children: [
            Expanded(
              flex: 2,
              child: Text(
                _capitalize(item.section),
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ),
            Expanded(
              flex: 3,
              child: Text(
                'Insufficient data for this section',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Colors.grey,
                      fontStyle: FontStyle.italic,
                    ),
              ),
            ),
          ],
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0),
      child: Row(
        children: [
          Expanded(
            flex: 2,
            child: Text(
              _capitalize(item.section),
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ),
          Expanded(
            flex: 3,
            child: Row(
              children: [
                const Icon(Icons.timer_outlined, size: 16, color: Colors.grey),
                const SizedBox(width: 4),
                Text(
                  '${item.avgTimeSeconds.toStringAsFixed(1)}s',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _capitalize(String s) {
    if (s.isEmpty) return s;
    return s[0].toUpperCase() + s.substring(1).toLowerCase();
  }
}

// ---------------------------------------------------------------------------
// Weak Skills List (Req 7.2, 7.7)
// ---------------------------------------------------------------------------

/// Displays up to 10 weak skill tags ranked from lowest to highest accuracy,
/// or a "no weak areas" message if none exist.
class _WeakSkillsSection extends StatelessWidget {
  final List<WeakSkill> weakSkills;

  const _WeakSkillsSection({required this.weakSkills});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Weak Areas',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            if (weakSkills.isEmpty)
              _buildNoWeakAreasMessage(context)
            else
              ...weakSkills.map((skill) => _WeakSkillRow(skill: skill)),
          ],
        ),
      ),
    );
  }

  Widget _buildNoWeakAreasMessage(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16.0),
      decoration: BoxDecoration(
        color: Colors.green.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          const Icon(Icons.check_circle, color: Colors.green),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              'No weak areas identified. Keep up the great work!',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Colors.green[800],
                  ),
            ),
          ),
        ],
      ),
    );
  }
}

class _WeakSkillRow extends StatelessWidget {
  final WeakSkill skill;

  const _WeakSkillRow({required this.skill});

  @override
  Widget build(BuildContext context) {
    final percentage = (skill.accuracy * 100).toStringAsFixed(1);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6.0),
      child: Row(
        children: [
          Expanded(
            flex: 3,
            child: Text(
              skill.skillTag,
              style: Theme.of(context).textTheme.bodyMedium,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          Expanded(
            flex: 2,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '$percentage%',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Colors.red[700],
                        fontWeight: FontWeight.w600,
                      ),
                ),
                Text(
                  '${skill.attemptCount} attempts',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Colors.grey,
                      ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Shared Insufficient Data Message Widget (Req 7.6)
// ---------------------------------------------------------------------------

/// Displays a message indicating insufficient data for a section.
class _InsufficientDataMessage extends StatelessWidget {
  final String message;

  const _InsufficientDataMessage({required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12.0),
      decoration: BoxDecoration(
        color: Colors.amber.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.amber.withOpacity(0.3)),
      ),
      child: Row(
        children: [
          const Icon(Icons.info_outline, size: 20, color: Colors.amber),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Colors.amber[900],
                  ),
            ),
          ),
        ],
      ),
    );
  }
}
