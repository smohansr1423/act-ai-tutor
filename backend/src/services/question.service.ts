/**
 * Question Generation Service
 * Orchestrates LLM-based ACT question generation, validates output,
 * and stores questions in the Question_Bank.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10
 */

import { v4 as uuidv4 } from 'uuid';
import { Section, DifficultyLevel } from '../models/enums';
import { Question } from '../models/interfaces';
import { insertOne, queryMany } from '../utils/database';
import {
  ILLMProvider,
  DefaultLLMProvider,
  LLMTimeoutError,
  LLMProviderError,
} from './llm.provider';

// ─── Skill Tags per Section ───────────────────────────────────────────────────

/**
 * Predefined skill tags for each ACT section.
 * Every generated question must be assigned exactly one skill tag from its section's set.
 */
export const SKILL_TAGS: Record<Section, string[]> = {
  [Section.English]: [
    'punctuation',
    'grammar_usage',
    'sentence_structure',
    'style',
    'organization',
    'word_choice',
    'verb_tense',
    'pronoun_agreement',
    'modifier_placement',
    'parallelism',
  ],
  [Section.Math]: [
    'pre_algebra',
    'elementary_algebra',
    'intermediate_algebra',
    'coordinate_geometry',
    'plane_geometry',
    'trigonometry',
    'number_properties',
    'ratios_proportions',
    'functions',
    'statistics_probability',
  ],
  [Section.Reading]: [
    'main_idea',
    'detail_identification',
    'inference',
    'vocabulary_in_context',
    'author_purpose',
    'tone_attitude',
    'cause_effect',
    'comparison_contrast',
    'sequence_events',
    'generalization',
  ],
  [Section.Science]: [
    'data_representation',
    'research_summaries',
    'conflicting_viewpoints',
    'interpreting_graphs',
    'experimental_design',
    'variable_relationships',
    'hypothesis_evaluation',
    'data_trends',
    'scientific_reasoning',
    'units_measurements',
  ],
};

// ─── Types ────────────────────────────────────────────────────────────────────

/** Raw LLM output structure before validation */
export interface RawLLMQuestionOutput {
  question_text: string;
  passage?: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  incorrect_reasoning: Record<string, string>;
  skill_tag: string;
  difficulty: string;
  strategy_tip: string;
}

/** Request to generate a question */
export interface GenerateQuestionRequest {
  section: Section;
  difficultyLevel: DifficultyLevel;
  skillTag?: string;
}

/** Successful question generation response */
export interface GenerateQuestionResponse {
  success: true;
  question: Question;
}

/** Error response for question generation */
export interface GenerateQuestionError {
  success: false;
  error: string;
  errorType: 'timeout' | 'validation' | 'provider';
  canRetry: boolean;
  suggestChangeSection: boolean;
}

export type GenerateQuestionResult = GenerateQuestionResponse | GenerateQuestionError;

/** Request to fetch a batch of questions from the Question_Bank */
export interface BatchQuestionRequest {
  section: Section;
  count: number;
  difficultyLevel?: DifficultyLevel;
}

/** Response for batch question retrieval */
export interface BatchQuestionResponse {
  questions: Question[];
}

// ─── Prompt Templates ─────────────────────────────────────────────────────────

/**
 * Build section-specific prompts that instruct the LLM to generate
 * properly formatted ACT-style questions.
 */
export function buildPrompt(section: Section, difficulty: DifficultyLevel, skillTag?: string): string {
  const difficultyLabel = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
  const validSkillTags = SKILL_TAGS[section];
  const requestedSkillTag = skillTag && validSkillTags.includes(skillTag)
    ? skillTag
    : `one of: ${validSkillTags.join(', ')}`;

  const baseInstructions = `
Generate an original ACT-style ${section} question at ${difficultyLabel} difficulty.
The skill being tested is: ${requestedSkillTag}.

IMPORTANT:
- Produce ONLY original content. Do NOT reproduce any copyrighted ACT test material.
- Respond with a single valid JSON object (no markdown, no extra text).

The JSON must have exactly these fields:
- "question_text": string (the question or prompt text)
- "passage": string or null (passage text if applicable)
- "options": array of exactly 4 strings (the answer choices)
- "correct_answer": string (exactly one of "A", "B", "C", or "D")
- "explanation": string (step-by-step explanation of the correct answer)
- "incorrect_reasoning": object with keys "A", "B", "C", "D" excluding the correct answer key, each explaining why that option is wrong
- "skill_tag": string (must be ${requestedSkillTag})
- "difficulty": string (must be "${difficulty}")
- "strategy_tip": string (a helpful test-taking strategy for this type of question)
`.trim();

  switch (section) {
    case Section.English:
      return `${baseInstructions}

SECTION-SPECIFIC FORMAT (English):
- "passage" must contain a passage of 2-4 sentences with one portion marked in [brackets] to indicate the underlined portion.
- "question_text" should ask "Which of the following alternatives to the bracketed portion would be most acceptable?"
- "options" must contain 4 grammatical or stylistic alternatives for the underlined portion.
- One option should be "NO CHANGE" if the original is correct.
`;

    case Section.Math:
      return `${baseInstructions}

SECTION-SPECIFIC FORMAT (Math):
- "passage" should be null.
- "question_text" must contain a complete math problem statement.
- "options" must contain 4 numerical or expression-based answer choices.
- Cover ACT math content areas: pre-algebra, algebra, geometry, or trigonometry as appropriate for the skill_tag.
- Include relevant formulas or diagrams described in text if needed.
`;

    case Section.Reading:
      return `${baseInstructions}

SECTION-SPECIFIC FORMAT (Reading):
- "passage" must contain an original prose passage of 200-400 words.
- "question_text" must contain a reading comprehension question about the passage.
- "options" must contain 4 answer choices addressing the comprehension question.
- The passage should be engaging and appropriate for high school students.
`;

    case Section.Science:
      return `${baseInstructions}

SECTION-SPECIFIC FORMAT (Science):
- "passage" must contain a description of a data representation (table, graph, or experimental setup).
  Use text-based tables or describe the graph/chart data clearly.
- "question_text" must ask an interpretation or analysis question about the data.
- "options" must contain 4 answer choices based on data interpretation.
- Include specific numerical data points or trends for students to analyze.
`;

    default:
      return baseInstructions;
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validates the LLM output structure ensuring all required fields are present
 * and correctly formatted.
 *
 * Returns validation errors array. Empty array = valid.
 */
export function validateLLMOutput(output: unknown, section: Section): string[] {
  const errors: string[] = [];

  if (!output || typeof output !== 'object') {
    return ['Output is not a valid object'];
  }

  const data = output as Record<string, unknown>;

  // question_text: non-empty string
  if (!data.question_text || typeof data.question_text !== 'string' || data.question_text.trim().length === 0) {
    errors.push('question_text must be a non-empty string');
  }

  // options: array of exactly 4 non-empty strings
  if (!Array.isArray(data.options)) {
    errors.push('options must be an array');
  } else if (data.options.length !== 4) {
    errors.push('options must contain exactly 4 choices');
  } else {
    for (let i = 0; i < data.options.length; i++) {
      if (typeof data.options[i] !== 'string' || (data.options[i] as string).trim().length === 0) {
        errors.push(`options[${i}] must be a non-empty string`);
      }
    }
  }

  // correct_answer: must be A, B, C, or D
  const validAnswers = ['A', 'B', 'C', 'D'];
  if (!data.correct_answer || typeof data.correct_answer !== 'string' || !validAnswers.includes(data.correct_answer)) {
    errors.push('correct_answer must be one of A, B, C, D');
  }

  // explanation: non-empty string
  if (!data.explanation || typeof data.explanation !== 'string' || data.explanation.trim().length === 0) {
    errors.push('explanation must be a non-empty string');
  }

  // incorrect_reasoning: object with keys for incorrect options
  if (!data.incorrect_reasoning || typeof data.incorrect_reasoning !== 'object' || Array.isArray(data.incorrect_reasoning)) {
    errors.push('incorrect_reasoning must be an object');
  } else {
    const reasoning = data.incorrect_reasoning as Record<string, unknown>;
    const correctAnswer = typeof data.correct_answer === 'string' ? data.correct_answer : '';
    const incorrectOptions = validAnswers.filter(a => a !== correctAnswer);
    for (const opt of incorrectOptions) {
      if (!reasoning[opt] || typeof reasoning[opt] !== 'string' || (reasoning[opt] as string).trim().length === 0) {
        errors.push(`incorrect_reasoning must have a non-empty explanation for option ${opt}`);
      }
    }
  }

  // skill_tag: must be from the predefined set for this section
  if (!data.skill_tag || typeof data.skill_tag !== 'string') {
    errors.push('skill_tag must be a non-empty string');
  } else if (!SKILL_TAGS[section].includes(data.skill_tag)) {
    errors.push(`skill_tag "${data.skill_tag}" is not valid for section "${section}". Valid tags: ${SKILL_TAGS[section].join(', ')}`);
  }

  // difficulty: must be easy, medium, or hard
  const validDifficulties = Object.values(DifficultyLevel);
  if (!data.difficulty || typeof data.difficulty !== 'string' || !validDifficulties.includes(data.difficulty as DifficultyLevel)) {
    errors.push(`difficulty must be one of: ${validDifficulties.join(', ')}`);
  }

  // strategy_tip: non-empty string
  if (!data.strategy_tip || typeof data.strategy_tip !== 'string' || data.strategy_tip.trim().length === 0) {
    errors.push('strategy_tip must be a non-empty string');
  }

  return errors;
}

// ─── Question Service ─────────────────────────────────────────────────────────

/**
 * QuestionService orchestrates question generation, validation, and storage.
 * Depends on an ILLMProvider for testability.
 */
export class QuestionService {
  private readonly llmProvider: ILLMProvider;

  constructor(llmProvider?: ILLMProvider) {
    this.llmProvider = llmProvider || new DefaultLLMProvider();
  }

  /**
   * Generate an ACT-style question for the specified section and difficulty.
   *
   * Flow:
   * 1. Build a section-specific prompt
   * 2. Call the LLM with 8-second timeout
   * 3. Parse and validate the response
   * 4. Store in the Question_Bank
   * 5. Return the question or an error with retry/change-section option
   */
  async generateQuestion(request: GenerateQuestionRequest): Promise<GenerateQuestionResult> {
    const { section, difficultyLevel, skillTag } = request;

    // Build the prompt
    const prompt = buildPrompt(section, difficultyLevel, skillTag);

    // Call LLM with 8-second timeout (Requirement 2.1, 2.10)
    let llmContent: string;
    try {
      const response = await this.llmProvider.complete({
        prompt,
        timeoutMs: 8000,
        temperature: 0.7,
        maxTokens: 2000,
      });
      llmContent = response.content;
    } catch (error: unknown) {
      if (error instanceof LLMTimeoutError) {
        return {
          success: false,
          error: 'Question generation timed out. Please try again or select a different section.',
          errorType: 'timeout',
          canRetry: true,
          suggestChangeSection: true,
        };
      }
      const message = error instanceof Error ? error.message : 'Unknown LLM error';
      return {
        success: false,
        error: `Question generation failed: ${message}`,
        errorType: 'provider',
        canRetry: true,
        suggestChangeSection: true,
      };
    }

    // Parse JSON from LLM response
    let parsed: unknown;
    try {
      // Strip any markdown code fences the LLM might add
      const cleaned = llmContent
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return {
        success: false,
        error: 'Failed to parse question output from AI. Please retry.',
        errorType: 'validation',
        canRetry: true,
        suggestChangeSection: false,
      };
    }

    // Validate structure (Requirement 2.1, 2.6, 2.7)
    const validationErrors = validateLLMOutput(parsed, section);
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: `Generated question failed validation: ${validationErrors.join('; ')}`,
        errorType: 'validation',
        canRetry: true,
        suggestChangeSection: false,
      };
    }

    const rawOutput = parsed as RawLLMQuestionOutput;

    // Build Question object
    const question: Question = {
      question_id: uuidv4(),
      section,
      question_text: rawOutput.question_text,
      passage: rawOutput.passage || null,
      options: rawOutput.options,
      correct_answer: rawOutput.correct_answer,
      explanation: rawOutput.explanation,
      incorrect_reasoning: rawOutput.incorrect_reasoning,
      skill_tag: rawOutput.skill_tag,
      difficulty: rawOutput.difficulty as DifficultyLevel,
      strategy_tip: rawOutput.strategy_tip,
      created_at: new Date(),
    };

    // Store in Question_Bank (Requirement 2.9)
    await this.storeQuestion(question);

    return {
      success: true,
      question,
    };
  }

  /**
   * Store a validated question in the Question_Bank database.
   */
  private async storeQuestion(question: Question): Promise<void> {
    await insertOne(
      `INSERT INTO questions (
        question_id, section, question_text, passage, options, correct_answer,
        explanation, incorrect_reasoning, skill_tag, difficulty, strategy_tip, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        question.question_id,
        question.section,
        question.question_text,
        question.passage,
        JSON.stringify(question.options),
        question.correct_answer,
        question.explanation,
        JSON.stringify(question.incorrect_reasoning),
        question.skill_tag,
        question.difficulty,
        question.strategy_tip,
        question.created_at,
      ]
    );
  }

  /**
   * Retrieve a batch of questions from the Question_Bank filtered by section
   * and optionally by difficulty level.
   *
   * Uses indexed queries for sub-3-second response under concurrent load.
   * Results are randomized via ORDER BY RANDOM() to avoid serving the same set repeatedly.
   *
   * Requirement: 10.5 (response within 3 seconds for 1000+ concurrent users)
   */
  async getQuestionsBatch(request: BatchQuestionRequest): Promise<BatchQuestionResponse> {
    const { section, count, difficultyLevel } = request;

    // Validate count is a positive integer within a reasonable range
    const safeCount = Math.min(Math.max(1, Math.floor(count)), 100);

    let sql: string;
    let params: unknown[];

    if (difficultyLevel) {
      sql = `
        SELECT question_id, section, question_text, passage, options, correct_answer,
               explanation, incorrect_reasoning, skill_tag, difficulty, strategy_tip, created_at
        FROM questions
        WHERE section = $1 AND difficulty = $2
        ORDER BY RANDOM()
        LIMIT $3
      `;
      params = [section, difficultyLevel, safeCount];
    } else {
      sql = `
        SELECT question_id, section, question_text, passage, options, correct_answer,
               explanation, incorrect_reasoning, skill_tag, difficulty, strategy_tip, created_at
        FROM questions
        WHERE section = $1
        ORDER BY RANDOM()
        LIMIT $2
      `;
      params = [section, safeCount];
    }

    const rows = await queryMany<Record<string, unknown>>(sql, params);

    const questions: Question[] = rows.map((row) => ({
      question_id: row.question_id as string,
      section: row.section as Section,
      question_text: row.question_text as string,
      passage: (row.passage as string) || null,
      options: typeof row.options === 'string' ? JSON.parse(row.options) : row.options as string[],
      correct_answer: row.correct_answer as string,
      explanation: row.explanation as string,
      incorrect_reasoning: typeof row.incorrect_reasoning === 'string'
        ? JSON.parse(row.incorrect_reasoning)
        : row.incorrect_reasoning as Record<string, string>,
      skill_tag: row.skill_tag as string,
      difficulty: row.difficulty as DifficultyLevel,
      strategy_tip: row.strategy_tip as string,
      created_at: new Date(row.created_at as string),
    }));

    return { questions };
  }
}
