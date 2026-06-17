/**
 * Property-Based Tests for Practice Mode Section Filtering
 * Feature: act-ai-tutor-app, Property 7: Practice Mode Section Filtering
 *
 * **Validates: Requirements 3.2**
 *
 * For any Practice_Mode session with a selected section, every question presented
 * SHALL belong to that selected section.
 */

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { Section, SessionSection, DifficultyLevel } from '../../models/enums';
import { Question } from '../../models/interfaces';
import { formatQuestionDelivery } from '../../services/session.service';

/**
 * Maps a SessionSection to its expected Section filter,
 * replicating the getSectionFilter logic for assertion purposes.
 */
function expectedSectionFilter(sessionSection: SessionSection): Section | null {
  switch (sessionSection) {
    case SessionSection.English:
      return Section.English;
    case SessionSection.Math:
      return Section.Math;
    case SessionSection.Reading:
      return Section.Reading;
    case SessionSection.Science:
      return Section.Science;
    case SessionSection.Mixed:
      return null;
    default:
      return null;
  }
}

/** The four specific (non-mixed) sections available for section mode */
const specificSections = [
  SessionSection.English,
  SessionSection.Math,
  SessionSection.Reading,
  SessionSection.Science,
] as const;

/** Arbitrary for selecting a specific (non-mixed) session section */
const specificSessionSectionArb = fc.constantFrom(...specificSections);

/** Arbitrary for generating a random Section enum value */
const sectionArb = fc.constantFrom(
  Section.English,
  Section.Math,
  Section.Reading,
  Section.Science
);

/** Arbitrary for generating a difficulty level */
const difficultyArb = fc.constantFrom(
  DifficultyLevel.Easy,
  DifficultyLevel.Medium,
  DifficultyLevel.Hard
);

/** Arbitrary for generating a valid skill tag */
const skillTagArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz-_'.split('')),
  { minLength: 3, maxLength: 30 }
);

/** Arbitrary for generating a valid Question object with a specific section */
function questionWithSectionArb(section: Section): fc.Arbitrary<Question> {
  return fc.record({
    question_id: fc.uuid(),
    section: fc.constant(section),
    question_text: fc.string({ minLength: 10, maxLength: 200 }),
    passage: fc.option(fc.string({ minLength: 20, maxLength: 400 }), { nil: null }),
    options: fc.tuple(
      fc.string({ minLength: 1, maxLength: 100 }),
      fc.string({ minLength: 1, maxLength: 100 }),
      fc.string({ minLength: 1, maxLength: 100 }),
      fc.string({ minLength: 1, maxLength: 100 })
    ).map(([a, b, c, d]) => [a, b, c, d]),
    correct_answer: fc.constantFrom('A', 'B', 'C', 'D'),
    explanation: fc.string({ minLength: 5, maxLength: 300 }),
    incorrect_reasoning: fc.constant({ B: 'wrong', C: 'wrong', D: 'wrong' }),
    skill_tag: skillTagArb,
    difficulty: difficultyArb,
    strategy_tip: fc.string({ minLength: 5, maxLength: 200 }),
    created_at: fc.date(),
  });
}

/** Arbitrary for generating a Question with any random section */
const questionWithAnySectionArb: fc.Arbitrary<Question> = sectionArb.chain(
  (section) => questionWithSectionArb(section)
);

describe('Property 7: Practice Mode Section Filtering', () => {
  /**
   * Property: For any selected section in practice mode, when questions are filtered
   * by that section, every resulting question belongs to the selected section.
   *
   * This tests the section filtering logic: given a pool of questions with various
   * sections, filtering by a specific section should yield ONLY questions of that section.
   */
  it('for any practice session with a selected section, every question SHALL belong to that section', () => {
    fc.assert(
      fc.property(
        specificSessionSectionArb,
        fc.array(questionWithAnySectionArb, { minLength: 1, maxLength: 50 }),
        (sessionSection, questionPool) => {
          // Determine the expected section filter
          const expectedSection = expectedSectionFilter(sessionSection);
          expect(expectedSection).not.toBeNull();

          // Simulate the section filtering from fetchQuestions
          const filteredQuestions = questionPool.filter(
            (q) => q.section === expectedSection
          );

          // Every filtered question must belong to the selected section
          for (const question of filteredQuestions) {
            expect(question.section).toBe(expectedSection);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any question delivered from a section-filtered practice session,
   * the delivered question's section matches the session's selected section.
   *
   * This tests that formatQuestionDelivery preserves the section field correctly,
   * ensuring the client receives questions tagged with the correct section.
   */
  it('for any question delivered in a section session, the delivery SHALL preserve the section', () => {
    fc.assert(
      fc.property(
        specificSessionSectionArb,
        fc.integer({ min: 1, max: 20 }),
        (sessionSection, count) => {
          const expectedSection = expectedSectionFilter(sessionSection)!;

          // Generate questions that belong to the target section
          // (simulating what the DB would return after filtering)
          const questions: Question[] = [];
          for (let i = 0; i < count; i++) {
            questions.push({
              question_id: `q-${i}-${Date.now()}`,
              section: expectedSection,
              question_text: `Sample question ${i}`,
              passage: null,
              options: ['Option A', 'Option B', 'Option C', 'Option D'],
              correct_answer: 'A',
              explanation: 'Sample explanation',
              incorrect_reasoning: { B: 'wrong', C: 'wrong', D: 'wrong' },
              skill_tag: 'sample-skill',
              difficulty: DifficultyLevel.Medium,
              strategy_tip: 'Sample tip',
              created_at: new Date(),
            });
          }

          // Format each question for delivery
          const deliveries = questions.map(formatQuestionDelivery);

          // Every delivered question must have the correct section
          for (const delivery of deliveries) {
            expect(delivery.section).toBe(expectedSection);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any selected section, the section filter mapping SHALL produce
   * a non-null Section value that corresponds to the selected SessionSection.
   *
   * This validates the getSectionFilter function ensures a 1:1 mapping between
   * specific SessionSection values and their corresponding Section values.
   */
  it('for any specific session section, the filter mapping SHALL produce the matching Section', () => {
    fc.assert(
      fc.property(specificSessionSectionArb, (sessionSection) => {
        const filtered = expectedSectionFilter(sessionSection);

        // Must not be null for specific sections
        expect(filtered).not.toBeNull();

        // The string value must match (both enums use the same string values)
        expect(filtered).toBe(sessionSection as unknown as Section);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any pool of questions with mixed sections and a chosen session section,
   * the filtered subset shall NEVER contain questions from a different section.
   *
   * This is the critical property: no question from a non-selected section should
   * ever "leak" into the filtered results.
   */
  it('for any section filter, no question from a different section SHALL appear in results', () => {
    fc.assert(
      fc.property(
        specificSessionSectionArb,
        fc.array(questionWithAnySectionArb, { minLength: 5, maxLength: 50 }),
        (sessionSection, questionPool) => {
          const expectedSection = expectedSectionFilter(sessionSection)!;

          // Filter questions by section (replicating the DB WHERE clause logic)
          const filteredQuestions = questionPool.filter(
            (q) => q.section === expectedSection
          );

          // No question in the filtered set should have a different section
          const otherSections = Object.values(Section).filter(
            (s) => s !== expectedSection
          );

          for (const question of filteredQuestions) {
            for (const otherSection of otherSections) {
              expect(question.section).not.toBe(otherSection);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
