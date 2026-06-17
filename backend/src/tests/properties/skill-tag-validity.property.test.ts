/**
 * Property-Based Tests for Skill Tag Section Validity
 * Feature: act-ai-tutor-app, Property 6: Skill Tag Section Validity
 *
 * **Validates: Requirements 2.7**
 *
 * For any generated question with a given section, the assigned skill_tag SHALL belong
 * to the predefined valid set for that section and no other section's set.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { Section, DifficultyLevel } from '../../models/enums';
import { SKILL_TAGS, validateLLMOutput } from '../../services/question.service';

/**
 * All section values for iteration and cross-section checks.
 */
const ALL_SECTIONS = Object.values(Section) as Section[];

/**
 * Generator for a random section.
 */
const sectionArb = fc.constantFrom(...ALL_SECTIONS);

/**
 * Generator for a random difficulty level.
 */
const difficultyArb = fc.constantFrom(
  DifficultyLevel.Easy,
  DifficultyLevel.Medium,
  DifficultyLevel.Hard
);

/**
 * Generator for a valid skill tag given a section.
 * Picks one skill tag from the predefined set for that section.
 */
function validSkillTagForSection(section: Section): fc.Arbitrary<string> {
  return fc.constantFrom(...SKILL_TAGS[section]);
}

/**
 * Generator for a complete valid question output for a given section,
 * simulating what the LLM would produce.
 */
function questionOutputArb(section: Section) {
  return fc.record({
    question_text: fc.string({ minLength: 1, maxLength: 200 }),
    passage: fc.option(fc.string({ minLength: 10, maxLength: 100 }), { nil: null }),
    options: fc.tuple(
      fc.string({ minLength: 1, maxLength: 50 }),
      fc.string({ minLength: 1, maxLength: 50 }),
      fc.string({ minLength: 1, maxLength: 50 }),
      fc.string({ minLength: 1, maxLength: 50 })
    ).map(([a, b, c, d]) => [a, b, c, d]),
    correct_answer: fc.constantFrom('A', 'B', 'C', 'D'),
    explanation: fc.string({ minLength: 1, maxLength: 200 }),
    incorrect_reasoning: fc.constantFrom('A', 'B', 'C', 'D').chain((correct) => {
      const incorrectKeys = ['A', 'B', 'C', 'D'].filter(k => k !== correct);
      return fc.record(
        Object.fromEntries(incorrectKeys.map(k => [k, fc.string({ minLength: 1, maxLength: 100 })]))
      ).map(reasoning => ({ correct, reasoning }));
    }).map(({ correct, reasoning }) => {
      // Return both the correct_answer and reasoning together
      return { correct_answer: correct, incorrect_reasoning: reasoning };
    }),
    skill_tag: validSkillTagForSection(section),
    difficulty: difficultyArb,
    strategy_tip: fc.string({ minLength: 1, maxLength: 100 }),
  }).map(({ question_text, passage, options, correct_answer: _ca, explanation, incorrect_reasoning, skill_tag, difficulty, strategy_tip }) => ({
    question_text,
    passage,
    options,
    correct_answer: incorrect_reasoning.correct_answer,
    explanation,
    incorrect_reasoning: incorrect_reasoning.incorrect_reasoning,
    skill_tag,
    difficulty,
    strategy_tip,
  }));
}

describe('Property 6: Skill Tag Section Validity', () => {
  /**
   * Property: For any question with a valid skill_tag for a given section,
   * that skill_tag SHALL belong to the predefined valid set for that section.
   *
   * Tests that the validateLLMOutput function accepts skill tags that are
   * in the correct section's predefined set.
   */
  it('a valid skill_tag for a section SHALL be accepted by validation', () => {
    fc.assert(
      fc.property(
        sectionArb.chain((section) =>
          fc.tuple(fc.constant(section), questionOutputArb(section))
        ),
        ([section, questionOutput]) => {
          const errors = validateLLMOutput(questionOutput, section);
          // Should have no skill_tag related errors since we used a valid tag for the section
          const skillTagErrors = errors.filter(e => e.includes('skill_tag'));
          expect(skillTagErrors).toHaveLength(0);
          // Confirm the skill_tag is in the section's predefined set
          expect(SKILL_TAGS[section]).toContain(questionOutput.skill_tag);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any question with a skill_tag from a DIFFERENT section,
   * the validation SHALL reject it (the skill_tag does not belong to the
   * target section's valid set).
   *
   * This ensures skill tags are section-exclusive — a tag valid for one
   * section is NOT valid for any other section.
   */
  it('a skill_tag from a different section SHALL be rejected by validation', () => {
    fc.assert(
      fc.property(
        sectionArb.chain((targetSection) => {
          // Pick a different section to get a wrong skill tag from
          const otherSections = ALL_SECTIONS.filter(s => s !== targetSection);
          return fc.constantFrom(...otherSections).chain((wrongSection) =>
            fc.tuple(
              fc.constant(targetSection),
              fc.constant(wrongSection),
              fc.constantFrom(...SKILL_TAGS[wrongSection])
            )
          );
        }),
        ([targetSection, _wrongSection, wrongSkillTag]) => {
          // The wrong skill tag should NOT be in the target section's valid set
          expect(SKILL_TAGS[targetSection]).not.toContain(wrongSkillTag);

          // Create a minimal valid question with the wrong skill_tag
          const questionOutput = {
            question_text: 'Test question text',
            options: ['Option A', 'Option B', 'Option C', 'Option D'],
            correct_answer: 'A',
            explanation: 'Test explanation',
            incorrect_reasoning: { B: 'Wrong B', C: 'Wrong C', D: 'Wrong D' },
            skill_tag: wrongSkillTag,
            difficulty: DifficultyLevel.Medium,
            strategy_tip: 'Test tip',
          };

          // Validation should produce a skill_tag error
          const errors = validateLLMOutput(questionOutput, targetSection);
          const skillTagErrors = errors.filter(e => e.includes('skill_tag'));
          expect(skillTagErrors.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Every skill_tag in the predefined set for a section SHALL be
   * exclusive to that section — it SHALL NOT appear in any other section's set.
   *
   * This validates the data model invariant that sections have disjoint
   * skill tag sets.
   */
  it('each section skill_tag set SHALL be disjoint from all other sections', () => {
    fc.assert(
      fc.property(
        sectionArb.chain((section) =>
          fc.tuple(
            fc.constant(section),
            fc.constantFrom(...SKILL_TAGS[section])
          )
        ),
        ([section, skillTag]) => {
          // For every other section, this skill tag should NOT be present
          const otherSections = ALL_SECTIONS.filter(s => s !== section);
          for (const otherSection of otherSections) {
            expect(SKILL_TAGS[otherSection]).not.toContain(skillTag);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
