/**
 * Seed utility - populates the questions table with ACT-style practice questions.
 * Only inserts if the questions table has fewer than 50 questions.
 */

import { getPool } from './database';
import { ALL_SEED_QUESTIONS } from './seed-questions';

/**
 * Seed the questions table with comprehensive ACT-style data.
 */
export async function seedQuestions(): Promise<boolean> {
  const pool = getPool();

  try {
    const countResult = await pool.query('SELECT COUNT(*) as count FROM questions');
    const count = parseInt(countResult.rows[0].count, 10);

    if (count >= 50) {
      console.log(`[Seed] Questions table already has ${count} rows, skipping seed.`);
      return false;
    }

    console.log(`[Seed] Questions table has ${count} rows, inserting ${ALL_SEED_QUESTIONS.length} questions...`);

    for (const q of ALL_SEED_QUESTIONS) {
      await pool.query(
        `INSERT INTO questions (question_id, section, question_text, passage, options, correct_answer, explanation, incorrect_reasoning, skill_tag, difficulty, strategy_tip)
         VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb, $5, $6, $7::jsonb, $8, $9, $10)
         ON CONFLICT DO NOTHING`,
        [
          q.section,
          q.question_text,
          q.passage,
          q.options,
          q.correct_answer,
          q.explanation,
          q.incorrect_reasoning,
          q.skill_tag,
          q.difficulty,
          q.strategy_tip,
        ]
      );
    }

    console.log(`[Seed] Inserted ${ALL_SEED_QUESTIONS.length} seed questions successfully.`);
    return true;
  } catch (error: any) {
    console.error('[Seed] Seeding failed:', error.message);
    throw error;
  }
}
