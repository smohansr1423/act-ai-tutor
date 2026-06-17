/**
 * Property-Based Tests for Question Structure Completeness
 * Feature: act-ai-tutor-app, Property 5: Question Structure Completeness
 *
 * **Validates: Requirements 2.1, 2.6**
 *
 * For any generated question, the output SHALL contain all required fields:
 * question_text (non-empty), exactly 4 options, a correct_answer (A/B/C/D),
 * a non-empty explanation, incorrect_reasoning for each wrong option,
 * a valid skill_tag, a valid difficulty (Easy/Medium/Hard), and a strategy_tip.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateLLMOutput, SKILL_TAGS } from '../../services/question.service';
import { Section, DifficultyLevel } from '../../models/enums';

// ─── Generators ───────────────────────────────────────────────────────────────

/** Generator for a valid ACT section */
const sectionArb = fc.constantFrom(
  Section.English,
  Section.Math,
  Section.Reading,
  Section.Science
);

/** Generator for a valid difficulty level */
const difficultyArb = fc.constantFrom(
  DifficultyLevel.Easy,
  DifficultyLevel.Medium,
  DifficultyLevel.Hard
);

/** Generator for a valid correct answer (A/B/C/D) */
const correctAnswerArb = fc.constantFrom('A', 'B', 'C', 'D');

/** Generator for a non-empty string (simulates text content) */
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0);

/** Generator for exactly 4 non-empty option strings */
const optionsArb = fc.tuple(
  nonEmptyStringArb,
  nonEmptyStringArb,
  nonEmptyStringArb,
  nonEmptyStringArb
).map(([a, b, c, d]) => [a, b, c, d]);

/**
 * Generator for a valid skill_tag given a section.
 * Picks one tag from the predefined set for that section.
 */
function skillTagArbForSection(section: Section): fc.Arbitrary<string> {
  const tags = SKILL_TAGS[section];
  return fc.constantFrom(...tags);
}

/**
 * Generator for incorrect_reasoning object.
 * Must contain non-empty explanations for each option that is NOT the correct answer.
 */
function incorrectReasoningArb(correctAnswer: string): fc.Arbitrary<Record<string, string>> {
  const incorrectOptions = ['A', 'B', 'C', 'D'].filter(o => o !== correctAnswer);
  return fc.tuple(nonEmptyStringArb, nonEmptyStringArb, nonEmptyStringArb).map(
    ([r1, r2, r3]) => {
      const result: Record<string, string> = {};
      result[incorrectOptions[0]] = r1;
      result[incorrectOptions[1]] = r2;
      result[incorrectOptions[2]] = r3;
      return result;
    }
  );
}

/**
 * Generator for a fully valid question structure for a given section.
 * Produces objects that should pass validateLLMOutput with zero errors.
 */
function validQuestionArb(section: Section): fc.Arbitrary<Record<string, unknown>> {
  return fc.tuple(
    nonEmptyStringArb,          // question_text
    optionsArb,                 // options (4 items)
    correctAnswerArb,           // correct_answer
    nonEmptyStringArb,          // explanation
    skillTagArbForSection(section), // skill_tag
    difficultyArb,              // difficulty
    nonEmptyStringArb           // strategy_tip
  ).chain(([questionText, options, correctAnswer, explanation, skillTag, difficulty, strategyTip]) =>
    incorrectReasoningArb(correctAnswer).map(incorrectReasoning => ({
      question_text: questionText,
      options,
      correct_answer: correctAnswer,
      explanation,
      incorrect_reasoning: incorrectReasoning,
      skill_tag: skillTag,
      difficulty,
      strategy_tip: strategyTip,
    }))
  );
}

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 5: Question Structure Completeness', () => {
  /**
   * Property: Any well-formed question structure SHALL pass validation.
   * This verifies that the validateLLMOutput function accepts all questions
   * containing the required fields in the correct format.
   */
  it('any question with all required fields in correct format SHALL pass validation', () => {
    fc.assert(
      fc.property(
        sectionArb.chain(section => fc.tuple(fc.constant(section), validQuestionArb(section))),
        ([section, question]) => {
          const errors = validateLLMOutput(question, section);
          expect(errors).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: A question missing question_text (empty or absent) SHALL fail validation.
   * Validates that the question_text field is required and non-empty.
   */
  it('a question with empty or missing question_text SHALL fail validation', () => {
    fc.assert(
      fc.property(
        sectionArb.chain(section => fc.tuple(fc.constant(section), validQuestionArb(section))),
        fc.constantFrom('', '   ', undefined, null),
        ([section, question], invalidText) => {
          const modified = { ...question, question_text: invalidText };
          const errors = validateLLMOutput(modified, section);
          expect(errors.length).toBeGreaterThan(0);
          expect(errors.some(e => e.includes('question_text'))).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: A question without exactly 4 options SHALL fail validation.
   * Validates that the options array must contain exactly 4 non-empty strings.
   */
  it('a question without exactly 4 options SHALL fail validation', () => {
    fc.assert(
      fc.property(
        sectionArb.chain(section => fc.tuple(fc.constant(section), validQuestionArb(section))),
        fc.constantFrom(
          [],
          ['A'],
          ['A', 'B'],
          ['A', 'B', 'C'],
          ['A', 'B', 'C', 'D', 'E']
        ),
        ([section, question], invalidOptions) => {
          const modified = { ...question, options: invalidOptions };
          const errors = validateLLMOutput(modified, section);
          expect(errors.length).toBeGreaterThan(0);
          expect(errors.some(e => e.includes('options'))).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: A question with invalid correct_answer (not A/B/C/D) SHALL fail validation.
   * Validates that correct_answer must be exactly one of A, B, C, or D.
   */
  it('a question with invalid correct_answer SHALL fail validation', () => {
    fc.assert(
      fc.property(
        sectionArb.chain(section => fc.tuple(fc.constant(section), validQuestionArb(section))),
        fc.string({ minLength: 1, maxLength: 5 }).filter(s => !['A', 'B', 'C', 'D'].includes(s)),
        ([section, question], invalidAnswer) => {
          const modified = { ...question, correct_answer: invalidAnswer };
          const errors = validateLLMOutput(modified, section);
          expect(errors.length).toBeGreaterThan(0);
          expect(errors.some(e => e.includes('correct_answer'))).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: A question with empty or missing explanation SHALL fail validation.
   * Validates that the explanation field is required and non-empty.
   */
  it('a question with empty or missing explanation SHALL fail validation', () => {
    fc.assert(
      fc.property(
        sectionArb.chain(section => fc.tuple(fc.constant(section), validQuestionArb(section))),
        fc.constantFrom('', '   ', undefined, null),
        ([section, question], invalidExplanation) => {
          const modified = { ...question, explanation: invalidExplanation };
          const errors = validateLLMOutput(modified, section);
          expect(errors.length).toBeGreaterThan(0);
          expect(errors.some(e => e.includes('explanation'))).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: A question with missing incorrect_reasoning for any wrong option SHALL fail validation.
   * Validates that incorrect_reasoning must have explanations for all three incorrect options.
   */
  it('a question with incomplete incorrect_reasoning SHALL fail validation', () => {
    fc.assert(
      fc.property(
        sectionArb.chain(section => fc.tuple(fc.constant(section), validQuestionArb(section))),
        ([section, question]) => {
          const correctAnswer = question.correct_answer as string;
          const incorrectOptions = ['A', 'B', 'C', 'D'].filter(o => o !== correctAnswer);

          // Remove one of the required incorrect reasoning entries
          const reasoning = { ...(question.incorrect_reasoning as Record<string, string>) };
          delete reasoning[incorrectOptions[0]];

          const modified = { ...question, incorrect_reasoning: reasoning };
          const errors = validateLLMOutput(modified, section);
          expect(errors.length).toBeGreaterThan(0);
          expect(errors.some(e => e.includes('incorrect_reasoning'))).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: A question with an invalid skill_tag (not in the section's set) SHALL fail validation.
   * Validates that skill_tag must belong to the predefined set for the question's section.
   */
  it('a question with invalid skill_tag SHALL fail validation', () => {
    fc.assert(
      fc.property(
        sectionArb.chain(section => fc.tuple(fc.constant(section), validQuestionArb(section))),
        fc.string({ minLength: 1, maxLength: 30 }).filter(s =>
          s.trim().length > 0 &&
          !Object.values(SKILL_TAGS).flat().includes(s)
        ),
        ([section, question], invalidTag) => {
          const modified = { ...question, skill_tag: invalidTag };
          const errors = validateLLMOutput(modified, section);
          expect(errors.length).toBeGreaterThan(0);
          expect(errors.some(e => e.includes('skill_tag'))).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: A question with invalid difficulty (not easy/medium/hard) SHALL fail validation.
   * Validates that difficulty must be one of the predefined DifficultyLevel values.
   */
  it('a question with invalid difficulty SHALL fail validation', () => {
    fc.assert(
      fc.property(
        sectionArb.chain(section => fc.tuple(fc.constant(section), validQuestionArb(section))),
        fc.string({ minLength: 1, maxLength: 20 }).filter(s =>
          !['easy', 'medium', 'hard'].includes(s.toLowerCase())
        ),
        ([section, question], invalidDifficulty) => {
          const modified = { ...question, difficulty: invalidDifficulty };
          const errors = validateLLMOutput(modified, section);
          expect(errors.length).toBeGreaterThan(0);
          expect(errors.some(e => e.includes('difficulty'))).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: A question with empty or missing strategy_tip SHALL fail validation.
   * Validates that the strategy_tip field is required and non-empty.
   */
  it('a question with empty or missing strategy_tip SHALL fail validation', () => {
    fc.assert(
      fc.property(
        sectionArb.chain(section => fc.tuple(fc.constant(section), validQuestionArb(section))),
        fc.constantFrom('', '   ', undefined, null),
        ([section, question], invalidTip) => {
          const modified = { ...question, strategy_tip: invalidTip };
          const errors = validateLLMOutput(modified, section);
          expect(errors.length).toBeGreaterThan(0);
          expect(errors.some(e => e.includes('strategy_tip'))).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: A null or non-object input SHALL fail validation.
   * Validates that the validator rejects non-object inputs.
   */
  it('null, undefined, or non-object inputs SHALL fail validation', () => {
    fc.assert(
      fc.property(
        sectionArb,
        fc.constantFrom(null, undefined, 42, 'string', true, []),
        (section, invalidInput) => {
          const errors = validateLLMOutput(invalidInput, section);
          expect(errors.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
