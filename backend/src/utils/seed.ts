/**
 * Seed utility - populates the questions table with sample ACT questions.
 * Only inserts if the questions table is empty.
 */

import { getPool } from './database';

const SEED_QUESTIONS = [
  {
    section: 'english',
    question_text: 'Which of the following sentences is punctuated correctly?',
    passage: null,
    options: JSON.stringify(['A) The dog, who was tired laid down.', 'B) The dog who was tired, laid down.', 'C) The dog, who was tired, lay down.', 'D) The dog who was tired lay down.']),
    correct_answer: 'C',
    explanation: 'The relative clause "who was tired" is non-restrictive and should be set off by commas. "Lay" is the correct past tense of "lie."',
    incorrect_reasoning: JSON.stringify({ A: 'Missing second comma and incorrect verb "laid"', B: 'Comma placement is wrong', D: 'Missing commas around non-restrictive clause' }),
    skill_tag: 'punctuation',
    difficulty: 'medium',
    strategy_tip: 'Look for non-restrictive clauses that need commas on both sides.',
  },
  {
    section: 'english',
    question_text: 'Select the correct word to complete the sentence: "The committee _____ divided on the issue."',
    passage: null,
    options: JSON.stringify(['A) was', 'B) were', 'C) are', 'D) have been']),
    correct_answer: 'A',
    explanation: '"Committee" is a collective noun treated as singular when acting as a unit.',
    incorrect_reasoning: JSON.stringify({ B: 'Would be correct if members act individually', C: 'Incorrect tense and number', D: 'Incorrect tense' }),
    skill_tag: 'subject-verb-agreement',
    difficulty: 'easy',
    strategy_tip: 'Collective nouns (team, committee, group) are usually singular.',
  },
  {
    section: 'math',
    question_text: 'If 3x + 7 = 22, what is the value of x?',
    passage: null,
    options: JSON.stringify(['A) 3', 'B) 5', 'C) 7', 'D) 15']),
    correct_answer: 'B',
    explanation: '3x + 7 = 22 → 3x = 15 → x = 5',
    incorrect_reasoning: JSON.stringify({ A: 'Subtracted 7 then divided by 7 instead of 3', C: 'Divided 22 by 3 without subtracting', D: 'Only subtracted 7' }),
    skill_tag: 'linear-equations',
    difficulty: 'easy',
    strategy_tip: 'Isolate the variable by performing inverse operations step by step.',
  },
  {
    section: 'math',
    question_text: 'What is the area of a triangle with base 10 and height 6?',
    passage: null,
    options: JSON.stringify(['A) 16', 'B) 30', 'C) 60', 'D) 36']),
    correct_answer: 'B',
    explanation: 'Area = (1/2) × base × height = (1/2) × 10 × 6 = 30',
    incorrect_reasoning: JSON.stringify({ A: 'Added base and height', C: 'Forgot to divide by 2', D: 'Multiplied height by itself' }),
    skill_tag: 'geometry-area',
    difficulty: 'easy',
    strategy_tip: 'Remember: triangle area is always half of base times height.',
  },
  {
    section: 'math',
    question_text: 'If f(x) = 2x² - 3x + 1, what is f(3)?',
    passage: null,
    options: JSON.stringify(['A) 10', 'B) 12', 'C) 16', 'D) 8']),
    correct_answer: 'A',
    explanation: 'f(3) = 2(9) - 3(3) + 1 = 18 - 9 + 1 = 10',
    incorrect_reasoning: JSON.stringify({ B: 'Computed 2(9) - 3(3) + 3', C: 'Computed 2(9) - 3 + 1', D: 'Computed 2(3) - 3 + 1' }),
    skill_tag: 'functions',
    difficulty: 'medium',
    strategy_tip: 'Substitute carefully and follow order of operations.',
  },
  {
    section: 'reading',
    question_text: 'Based on the passage, the author\'s primary purpose is to:',
    passage: 'The urban heat island effect occurs when cities replace natural land cover with dense concentrations of pavement, buildings, and other surfaces that absorb and retain heat. This effect increases energy costs, air pollution levels, and heat-related illness. Researchers are now studying cool roofs and urban forests as mitigation strategies.',
    options: JSON.stringify(['A) argue against urbanization', 'B) explain a phenomenon and note potential solutions', 'C) compare rural and urban temperatures', 'D) criticize current building practices']),
    correct_answer: 'B',
    explanation: 'The passage explains what the urban heat island effect is, its consequences, and mentions mitigation strategies being studied.',
    incorrect_reasoning: JSON.stringify({ A: 'The passage describes effects, not argues against cities', C: 'No direct comparison is made with rural areas', D: 'The tone is informational, not critical' }),
    skill_tag: 'main-idea',
    difficulty: 'medium',
    strategy_tip: 'Look at the overall structure: does it explain, argue, compare, or narrate?',
  },
  {
    section: 'reading',
    question_text: 'The word "mitigation" in the passage most nearly means:',
    passage: 'The urban heat island effect occurs when cities replace natural land cover with dense concentrations of pavement, buildings, and other surfaces that absorb and retain heat. This effect increases energy costs, air pollution levels, and heat-related illness. Researchers are now studying cool roofs and urban forests as mitigation strategies.',
    options: JSON.stringify(['A) elimination', 'B) measurement', 'C) reduction', 'D) creation']),
    correct_answer: 'C',
    explanation: 'Mitigation means reducing the severity of something. Cool roofs and urban forests would reduce (not eliminate) the heat island effect.',
    incorrect_reasoning: JSON.stringify({ A: 'Too strong - mitigation is reduction, not elimination', B: 'Measurement is about quantifying, not fixing', D: 'Opposite meaning' }),
    skill_tag: 'vocabulary-in-context',
    difficulty: 'medium',
    strategy_tip: 'Replace the word with each option and see which makes the most sense in context.',
  },
  {
    section: 'science',
    question_text: 'According to the data, as temperature increases from 20°C to 40°C, the rate of enzyme activity:',
    passage: 'Table 1 shows enzyme activity rates at different temperatures:\n20°C: 15 units/min\n25°C: 28 units/min\n30°C: 45 units/min\n35°C: 52 units/min\n40°C: 38 units/min\n45°C: 12 units/min',
    options: JSON.stringify(['A) increases steadily', 'B) increases then decreases', 'C) decreases steadily', 'D) remains constant']),
    correct_answer: 'B',
    explanation: 'Activity increases from 20°C to 35°C (15→52), then decreases at 40°C (38). This shows an optimum temperature around 35°C.',
    incorrect_reasoning: JSON.stringify({ A: 'Activity drops at 40°C', C: 'Activity increases before decreasing', D: 'Values clearly change' }),
    skill_tag: 'data-interpretation',
    difficulty: 'medium',
    strategy_tip: 'Read tables carefully — look for trends and turning points in the data.',
  },
  {
    section: 'science',
    question_text: 'Which hypothesis is best supported by the experimental results?',
    passage: 'Experiment: Plants were grown under three light conditions for 4 weeks.\nGroup A (full sun): average height 24cm, 12 leaves\nGroup B (partial shade): average height 18cm, 8 leaves\nGroup C (full shade): average height 8cm, 4 leaves',
    options: JSON.stringify(['A) Light has no effect on plant growth', 'B) More light leads to greater plant growth', 'C) Shade produces taller plants', 'D) Leaf count is unrelated to light']),
    correct_answer: 'B',
    explanation: 'Both height and leaf count increase with more light exposure (full sun > partial shade > full shade).',
    incorrect_reasoning: JSON.stringify({ A: 'Data clearly shows differences between groups', C: 'Full sun plants are tallest', D: 'Leaf count correlates with light level' }),
    skill_tag: 'experimental-design',
    difficulty: 'easy',
    strategy_tip: 'Match the hypothesis to the pattern in the data. Look for consistent trends across all measurements.',
  },
  {
    section: 'english',
    question_text: 'Which transition word best connects these two sentences? "The experiment failed. _____ the team learned valuable lessons."',
    passage: null,
    options: JSON.stringify(['A) Therefore,', 'B) Nevertheless,', 'C) Furthermore,', 'D) Similarly,']),
    correct_answer: 'B',
    explanation: '"Nevertheless" shows contrast — the failure is contrasted with the positive outcome of learning.',
    incorrect_reasoning: JSON.stringify({ A: 'Shows cause-effect, not contrast', C: 'Adds information, not contrast', D: 'Shows similarity, not contrast' }),
    skill_tag: 'transitions',
    difficulty: 'easy',
    strategy_tip: 'Identify the relationship between sentences (contrast, cause, addition) before choosing a transition.',
  },
];

/**
 * Seed the questions table with sample data if it's empty.
 */
export async function seedQuestions(): Promise<boolean> {
  const pool = getPool();

  try {
    const countResult = await pool.query('SELECT COUNT(*) as count FROM questions');
    const count = parseInt(countResult.rows[0].count, 10);

    if (count > 0) {
      console.log(`[Seed] Questions table already has ${count} rows, skipping seed.`);
      return false;
    }

    console.log('[Seed] Questions table is empty, inserting seed data...');

    for (const q of SEED_QUESTIONS) {
      await pool.query(
        `INSERT INTO questions (question_id, section, question_text, passage, options, correct_answer, explanation, incorrect_reasoning, skill_tag, difficulty, strategy_tip)
         VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb, $5, $6, $7::jsonb, $8, $9, $10)`,
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

    console.log(`[Seed] Inserted ${SEED_QUESTIONS.length} seed questions.`);
    return true;
  } catch (error: any) {
    console.error('[Seed] Seeding failed:', error.message);
    throw error;
  }
}
