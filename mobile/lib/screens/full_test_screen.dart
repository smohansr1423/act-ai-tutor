import 'package:flutter/material.dart';

import '../services/session_storage_service.dart';
import '../utils/app_router.dart';
import '../utils/constants.dart';

/// Full Test Mode section selection screen.
///
/// Displays cards for each ACT section showing question count and time limit.
/// The student selects a section to begin a timed full test.
/// Also shows a banner if there are interrupted sessions available for resume.
///
/// Requirements: 4.1, 4.2, 4.3, 4.4, 4.9
class FullTestScreen extends StatefulWidget {
  const FullTestScreen({super.key});

  @override
  State<FullTestScreen> createState() => _FullTestScreenState();
}

class _FullTestScreenState extends State<FullTestScreen> {
  bool _hasInterruptedSessions = false;

  @override
  void initState() {
    super.initState();
    _checkForInterruptedSessions();
  }

  Future<void> _checkForInterruptedSessions() async {
    final storageService = SessionStorageService();
    final hasInterrupted = await storageService.hasInterruptedSessions();
    if (mounted) {
      setState(() {
        _hasInterruptedSessions = hasInterrupted;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Full Test Mode'),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (_hasInterruptedSessions) ...[
                _ResumeSessionBanner(
                  onTap: () {
                    Navigator.of(context).pushNamed(AppRouter.resumeSession);
                  },
                ),
                const SizedBox(height: 16),
              ],
              const _HeaderSection(),
              const SizedBox(height: 24),
              Expanded(
                child: ListView(
                  children: const [
                    _SectionCard(
                      section: 'english',
                      title: 'English',
                      description:
                          'Grammar, punctuation, sentence structure, and rhetorical skills',
                      icon: Icons.edit_note,
                      color: Color(0xFF4CAF50),
                    ),
                    SizedBox(height: 16),
                    _SectionCard(
                      section: 'math',
                      title: 'Math',
                      description:
                          'Pre-algebra, algebra, geometry, and trigonometry',
                      icon: Icons.calculate,
                      color: Color(0xFF2196F3),
                    ),
                    SizedBox(height: 16),
                    _SectionCard(
                      section: 'reading',
                      title: 'Reading',
                      description:
                          'Reading comprehension across prose fiction, social science, humanities, and natural science',
                      icon: Icons.menu_book,
                      color: Color(0xFFFF9800),
                    ),
                    SizedBox(height: 16),
                    _SectionCard(
                      section: 'science',
                      title: 'Science',
                      description:
                          'Data representation, research summaries, and conflicting viewpoints',
                      icon: Icons.science,
                      color: Color(0xFF9C27B0),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Banner shown when there are interrupted sessions available to resume.
class _ResumeSessionBanner extends StatelessWidget {
  final VoidCallback onTap;

  const _ResumeSessionBanner({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.amber[50],
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            border: Border.all(color: Colors.amber[300]!),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              Icon(Icons.pause_circle_outline, color: Colors.amber[800]),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'You have interrupted sessions',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                            color: Colors.amber[900],
                          ),
                    ),
                    Text(
                      'Tap to resume where you left off',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: Colors.amber[800],
                          ),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: Colors.amber[800]),
            ],
          ),
        ),
      ),
    );
  }
}

/// Header section describing the full test mode.
class _HeaderSection extends StatelessWidget {
  const _HeaderSection();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Choose a Section',
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.bold,
              ),
        ),
        const SizedBox(height: 8),
        Text(
          'Simulate real ACT test conditions with timed sections. '
          'No hints or feedback until you submit.',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Colors.grey[600],
              ),
        ),
      ],
    );
  }
}

/// Card widget for a single section showing its details and a start button.
class _SectionCard extends StatelessWidget {
  final String section;
  final String title;
  final String description;
  final IconData icon;
  final Color color;

  const _SectionCard({
    required this.section,
    required this.title,
    required this.description,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final config = AppConstants.fullTestConfig[section]!;
    final questionCount = config['questions']!;
    final timeMinutes = config['timeMinutes']!;

    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: color.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(icon, color: color, size: 28),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style:
                            Theme.of(context).textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.bold,
                                ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        description,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: Colors.grey[600],
                            ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                _InfoChip(
                  icon: Icons.quiz_outlined,
                  label: '$questionCount questions',
                ),
                const SizedBox(width: 12),
                _InfoChip(
                  icon: Icons.timer_outlined,
                  label: '$timeMinutes min',
                ),
                const Spacer(),
                ElevatedButton(
                  onPressed: () => _startTest(context),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: color,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  child: const Text('Start'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _startTest(BuildContext context) {
    Navigator.of(context).pushNamed(
      AppRouter.fullTestQuestion,
      arguments: section,
    );
  }
}

/// Small chip showing an icon and label for section metadata.
class _InfoChip extends StatelessWidget {
  final IconData icon;
  final String label;

  const _InfoChip({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 16, color: Colors.grey[700]),
        const SizedBox(width: 4),
        Text(
          label,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Colors.grey[700],
                fontWeight: FontWeight.w500,
              ),
        ),
      ],
    );
  }
}
