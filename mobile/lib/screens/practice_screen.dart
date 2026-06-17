import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../blocs/practice/practice_bloc.dart';
import '../models/enums.dart';
import '../utils/app_router.dart';

/// Practice mode section selection screen.
/// Displays 5 section cards: English, Math, Reading, Science, Mixed Mode.
/// On tap, dispatches StartPracticeSession and navigates to question screen.
class PracticeScreen extends StatelessWidget {
  const PracticeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const _PracticeScreenContent();
  }
}

class _PracticeScreenContent extends StatelessWidget {
  const _PracticeScreenContent();

  static const _sections = [
    _SectionData(
      section: SessionSection.english,
      label: 'English',
      icon: Icons.menu_book_rounded,
      color: Color(0xFF42A5F5),
      description: 'Grammar, punctuation, and rhetorical skills',
    ),
    _SectionData(
      section: SessionSection.math,
      label: 'Math',
      icon: Icons.calculate_rounded,
      color: Color(0xFF66BB6A),
      description: 'Algebra, geometry, and trigonometry',
    ),
    _SectionData(
      section: SessionSection.reading,
      label: 'Reading',
      icon: Icons.auto_stories_rounded,
      color: Color(0xFFAB47BC),
      description: 'Comprehension and analytical reasoning',
    ),
    _SectionData(
      section: SessionSection.science,
      label: 'Science',
      icon: Icons.science_rounded,
      color: Color(0xFFFF7043),
      description: 'Data interpretation and scientific reasoning',
    ),
    _SectionData(
      section: SessionSection.mixed,
      label: 'Mixed Mode',
      icon: Icons.shuffle_rounded,
      color: Color(0xFF5C6BC0),
      description: 'Questions from all sections combined',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return BlocListener<PracticeBloc, PracticeState>(
      listener: (context, state) {
        if (state is PracticeQuestion) {
          Navigator.pushNamed(context, AppRouter.practiceQuestion);
        } else if (state is PracticeError) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(state.message),
              backgroundColor: Theme.of(context).colorScheme.error,
            ),
          );
        }
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Practice Mode'),
          centerTitle: true,
        ),
        body: SafeArea(
          child: BlocBuilder<PracticeBloc, PracticeState>(
            builder: (context, state) {
              if (state is PracticeLoading) {
                return const Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      CircularProgressIndicator(),
                      SizedBox(height: 16),
                      Text('Starting session...'),
                    ],
                  ),
                );
              }

              return Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
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
                      'Select a subject to start practicing',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: Theme.of(context)
                                .colorScheme
                                .onSurface
                                .withOpacity(0.6),
                          ),
                    ),
                    const SizedBox(height: 24),
                    Expanded(
                      child: ListView.separated(
                        itemCount: _sections.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 12),
                        itemBuilder: (context, index) {
                          final sectionData = _sections[index];
                          return _SectionCard(
                            data: sectionData,
                            onTap: () {
                              context.read<PracticeBloc>().add(
                                    StartPracticeSession(
                                      section: sectionData.section,
                                    ),
                                  );
                            },
                          );
                        },
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

/// Card widget for a practice section option.
class _SectionCard extends StatelessWidget {
  final _SectionData data;
  final VoidCallback onTap;

  const _SectionCard({required this.data, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Semantics(
          button: true,
          label: '${data.label} practice section. ${data.description}',
          child: Padding(
            padding: const EdgeInsets.all(16.0),
            child: Row(
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    color: data.color.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    data.icon,
                    color: data.color,
                    size: 28,
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        data.label,
                        style:
                            Theme.of(context).textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.w600,
                                ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        data.description,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: Theme.of(context)
                                  .colorScheme
                                  .onSurface
                                  .withOpacity(0.6),
                            ),
                      ),
                    ],
                  ),
                ),
                Icon(
                  Icons.arrow_forward_ios_rounded,
                  size: 16,
                  color: Theme.of(context)
                      .colorScheme
                      .onSurface
                      .withOpacity(0.4),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Data model for a section card.
class _SectionData {
  final SessionSection section;
  final String label;
  final IconData icon;
  final Color color;
  final String description;

  const _SectionData({
    required this.section,
    required this.label,
    required this.icon,
    required this.color,
    required this.description,
  });
}
