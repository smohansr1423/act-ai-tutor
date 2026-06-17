/**
 * Hint Service
 * Provides hints for practice mode questions without revealing the answer.
 * Integrates with Tutor_Chat via the LLM provider to generate contextual hints.
 *
 * Requirements: 3.5, 3.6
 */

import { Question } from '../models/interfaces';
import { queryOne } from '../utils/database';
import {
  ILLMProvider,
  DefaultLLMProvider,
  LLMTimeoutError,
} from './llm.provider';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Timeout for hint generation LLM calls (5 seconds per Requirement 3.6) */
export const HINT_TIMEOUT_MS = 5000;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Request to generate a hint for a question */
export interface HintRequest {
  sessionId: string;
  questionId: string;
}

/** Successful hint response */
export interface HintResponse {
  hint: string;
}

/** Error response for hint generation */
export interface HintError {
  error: string;
  errorType: 'not_found' | 'timeout' | 'provider';
}

export type HintResult = HintResponse | HintError;

// ─── Static Fallback Hints ────────────────────────────────────────────────────

/**
 * Static fallback hints by skill tag, used when the LLM times out.
 * Provides generic guidance without revealing the answer.
 */
export const STATIC_HINTS: Record<string, string> = {
  // English
  punctuation: 'Look carefully at the punctuation marks. Consider whether commas, semicolons, or periods are used correctly to separate ideas.',
  grammar_usage: 'Check for subject-verb agreement and proper pronoun usage. Read the sentence aloud to hear if something sounds off.',
  sentence_structure: 'Consider how the clauses connect. Is the sentence a run-on, or is it a fragment? Look for proper conjunctions.',
  style: 'Think about the tone and formality of the passage. Which option best matches the writing style used elsewhere?',
  organization: 'Consider the logical flow of ideas. Which placement creates the smoothest transition between paragraphs?',
  word_choice: 'Think about the precise meaning needed in context. Eliminate options that are too vague or too specific.',
  verb_tense: 'Check the surrounding sentences for tense consistency. What time frame is the passage describing?',
  pronoun_agreement: 'Identify the antecedent (the noun the pronoun refers to). Make sure the pronoun matches in number and gender.',
  modifier_placement: 'Ask yourself: what word is the modifier describing? Place it as close as possible to that word.',
  parallelism: 'Look for lists or paired structures. Each element should follow the same grammatical pattern.',

  // Math
  pre_algebra: 'Start by identifying what the problem is asking for. Work through the arithmetic step by step.',
  elementary_algebra: 'Try isolating the variable. What operation can you perform on both sides to simplify?',
  intermediate_algebra: 'Consider factoring or using the quadratic formula. Look for patterns in the expressions.',
  coordinate_geometry: 'Sketch a quick graph or plot the key points. Use the distance or midpoint formula if needed.',
  plane_geometry: 'Draw the figure and label all known measurements. Look for relationships between angles or sides.',
  trigonometry: 'Identify which trig ratio applies (SOH-CAH-TOA). Consider the angle relationships in the figure.',
  number_properties: 'Think about factors, multiples, or divisibility rules. Consider testing small values.',
  ratios_proportions: 'Set up a proportion with matching units on each side. Cross-multiply to solve.',
  functions: 'Substitute the given input and evaluate step by step. Pay attention to the order of operations.',
  statistics_probability: 'Identify whether you need mean, median, mode, or probability. List out the data systematically.',

  // Reading
  main_idea: 'Reread the first and last paragraphs. The main idea often appears in the topic sentences.',
  detail_identification: 'Scan the passage for specific keywords from the question. The answer is stated directly in the text.',
  inference: 'Look for clues in the text that suggest something beyond what is directly stated. What can you logically conclude?',
  vocabulary_in_context: 'Read the sentence with each answer choice substituted in. Which one preserves the original meaning?',
  author_purpose: 'Ask yourself: why did the author include this? Consider whether the intent is to inform, persuade, or entertain.',
  tone_attitude: 'Look for emotional or descriptive words. Is the author positive, negative, or neutral toward the subject?',
  cause_effect: 'Identify the event and trace what led to it or what resulted from it in the passage.',
  comparison_contrast: 'Look for signal words like "however," "similarly," or "unlike." What two things are being compared?',
  sequence_events: 'Note time-related words and phrases. Arrange events in chronological order.',
  generalization: 'Consider what broad statement the specific details in the passage support.',

  // Science
  data_representation: 'Look at the axes labels and units carefully. Identify the trend shown in the data.',
  research_summaries: 'Compare the methods and results of each experiment. What variable changed between trials?',
  conflicting_viewpoints: 'Identify what each scientist agrees and disagrees on. Focus on their key claims.',
  interpreting_graphs: 'Read the axis labels first, then trace the data points. Look for patterns, peaks, or intersections.',
  experimental_design: 'Identify the independent and dependent variables. What was the control group?',
  variable_relationships: 'Consider whether the relationship is direct or inverse. As one variable increases, what happens to the other?',
  hypothesis_evaluation: 'Check if the data supports or contradicts the hypothesis. Look at the specific values.',
  data_trends: 'Look for increasing, decreasing, or cyclical patterns. Consider the overall direction of change.',
  scientific_reasoning: 'Apply the scientific method. What conclusion logically follows from the given evidence?',
  units_measurements: 'Pay attention to the units given. Convert if necessary and ensure consistency.',
};

/** Default fallback hint when skill tag is not found in static hints */
const DEFAULT_STATIC_HINT = 'Take a moment to re-read the question carefully. Eliminate any answer choices that seem clearly wrong, then focus on the remaining options.';

// ─── Prompt Building ──────────────────────────────────────────────────────────

/**
 * Build a prompt for the LLM to generate a hint for a question.
 * The prompt instructs the LLM to guide without revealing the answer.
 */
export function buildHintPrompt(question: Question): string {
  const optionLabels = ['A', 'B', 'C', 'D'];
  const formattedOptions = question.options
    .map((opt, i) => `${optionLabels[i]}. ${opt}`)
    .join('\n');

  return `You are a supportive ACT test tutor helping a student who is stuck on a question.
Provide a helpful hint that guides the student toward the correct approach WITHOUT revealing the answer.

RULES:
- Do NOT state the correct answer letter (${question.correct_answer}) or explicitly identify the correct option.
- Do NOT eliminate specific wrong answers by name.
- DO guide the student on what concept or strategy to think about.
- DO point them toward the relevant skill or technique needed.
- Keep your hint to 1-3 sentences, clear and encouraging.

QUESTION:
${question.question_text}

${question.passage ? `PASSAGE:\n${question.passage}\n` : ''}OPTIONS:
${formattedOptions}

SKILL BEING TESTED: ${question.skill_tag}
DIFFICULTY: ${question.difficulty}

Provide your hint as plain text (no JSON, no markdown formatting).`;
}

// ─── Hint Service ─────────────────────────────────────────────────────────────

/**
 * HintService generates hints for practice questions.
 * Uses the LLM to provide contextual guidance, falling back to static hints on timeout.
 */
export class HintService {
  private readonly llmProvider: ILLMProvider;

  constructor(llmProvider?: ILLMProvider) {
    this.llmProvider = llmProvider || new DefaultLLMProvider();
  }

  /**
   * Generate a hint for a given question without revealing the answer.
   *
   * Flow:
   * 1. Look up the question from the database
   * 2. Build a hint prompt for the LLM
   * 3. Call LLM with 5-second timeout
   * 4. If LLM times out, generate a static hint based on skill_tag
   * 5. Return the hint
   */
  async getHint(request: HintRequest): Promise<HintResult> {
    const { questionId } = request;

    // 1. Look up the question from the database
    const question = await this.findQuestion(questionId);
    if (!question) {
      return {
        error: `Question not found: ${questionId}`,
        errorType: 'not_found',
      };
    }

    // 2. Build hint prompt
    const prompt = buildHintPrompt(question);

    // 3. Call LLM with 5-second timeout
    try {
      const response = await this.llmProvider.complete({
        prompt,
        timeoutMs: HINT_TIMEOUT_MS,
        temperature: 0.7,
        maxTokens: 200,
      });

      const hint = response.content.trim();
      if (!hint) {
        // Empty response from LLM, use static fallback
        return { hint: this.getStaticHint(question.skill_tag) };
      }

      return { hint };
    } catch (error: unknown) {
      // 4. If LLM times out, generate static hint based on skill_tag
      if (error instanceof LLMTimeoutError) {
        return { hint: this.getStaticHint(question.skill_tag) };
      }

      // For other provider errors, return an error response
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        error: `Failed to generate hint: ${message}`,
        errorType: 'provider',
      };
    }
  }

  /**
   * Look up a question by ID from the database.
   */
  private async findQuestion(questionId: string): Promise<Question | null> {
    const row = await queryOne<{
      question_id: string;
      section: string;
      question_text: string;
      passage: string | null;
      options: string;
      correct_answer: string;
      explanation: string;
      incorrect_reasoning: string;
      skill_tag: string;
      difficulty: string;
      strategy_tip: string;
      created_at: Date;
    }>(
      'SELECT * FROM questions WHERE question_id = $1',
      [questionId]
    );

    if (!row) return null;

    return {
      question_id: row.question_id,
      section: row.section as Question['section'],
      question_text: row.question_text,
      passage: row.passage,
      options: typeof row.options === 'string' ? JSON.parse(row.options) : row.options,
      correct_answer: row.correct_answer,
      explanation: row.explanation,
      incorrect_reasoning: typeof row.incorrect_reasoning === 'string'
        ? JSON.parse(row.incorrect_reasoning)
        : row.incorrect_reasoning,
      skill_tag: row.skill_tag,
      difficulty: row.difficulty as Question['difficulty'],
      strategy_tip: row.strategy_tip,
      created_at: row.created_at,
    };
  }

  /**
   * Get a static fallback hint based on the question's skill tag.
   * Used when the LLM times out to still provide value to the student.
   */
  private getStaticHint(skillTag: string): string {
    return STATIC_HINTS[skillTag] || DEFAULT_STATIC_HINT;
  }
}
