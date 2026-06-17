/**
 * Question Routes
 * Express route handlers for question endpoints.
 * Requirements: 10.5
 */

import { Router, Request, Response } from 'express';
import { Section, DifficultyLevel } from '../models/enums';
import { QuestionService, BatchQuestionRequest } from './question.service';

const router = Router();
const questionService = new QuestionService();

/**
 * GET /api/questions/batch
 * Retrieves a batch of questions from the Question_Bank filtered by section
 * and optionally by difficulty level.
 *
 * Query params: section (required), count (required), difficultyLevel (optional)
 * Response 200: { questions: [...] }
 * Response 400: { error } - invalid parameters
 */
router.get('/batch', async (req: Request, res: Response) => {
  try {
    const { section, count, difficultyLevel } = req.query;

    // Validate required params
    if (!section || !count) {
      return res.status(400).json({
        error: 'Missing required parameters: section and count are required',
      });
    }

    // Validate section
    const validSections = Object.values(Section) as string[];
    if (!validSections.includes(section as string)) {
      return res.status(400).json({
        error: `Invalid section. Must be one of: ${validSections.join(', ')}`,
      });
    }

    // Validate count
    const countNum = parseInt(count as string, 10);
    if (isNaN(countNum) || countNum < 1) {
      return res.status(400).json({
        error: 'Count must be a positive integer',
      });
    }

    // Validate difficultyLevel if provided
    if (difficultyLevel) {
      const validDifficulties = Object.values(DifficultyLevel) as string[];
      if (!validDifficulties.includes(difficultyLevel as string)) {
        return res.status(400).json({
          error: `Invalid difficultyLevel. Must be one of: ${validDifficulties.join(', ')}`,
        });
      }
    }

    const request: BatchQuestionRequest = {
      section: section as Section,
      count: countNum,
      difficultyLevel: difficultyLevel ? (difficultyLevel as DifficultyLevel) : undefined,
    };

    const result = await questionService.getQuestionsBatch(request);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Batch question retrieval error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
