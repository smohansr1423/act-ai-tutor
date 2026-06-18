/**
 * Full Test Routes
 * Express route handlers for full test session endpoints.
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 9.6, 9.7
 */

import { Router, Request, Response } from 'express';
import {
  startFullTest,
  saveFullTestProgress,
  submitFullTest,
  isFullTestError,
  StartFullTestRequest,
  SaveProgressRequest,
  FullTestSubmitRequest,
} from './fulltest.service';
import { SessionSection } from '../models/enums';

const router = Router();

/**
 * POST /api/sessions/fulltest/start
 * Starts a new full test session for a specific ACT section.
 * Returns all questions for the section (without correct answers) and the time limit.
 *
 * Section-specific configuration:
 * - English: 75 questions, 45-minute timer (2700s)
 * - Math: 60 questions, 60-minute timer (3600s)
 * - Reading: 40 questions, 35-minute timer (2100s)
 * - Science: 40 questions, 35-minute timer (2100s)
 *
 * Body: { userId, section }
 * Response 201: { sessionId, questions, timeLimit }
 * Response 400: { error } - validation failures
 * Response 404: { error } - no questions available
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { userId, section } = req.body;

    const request: StartFullTestRequest = {
      userId: userId || req.user?.userId || '',
      section: (section as SessionSection) ?? '',
    };

    const result = await startFullTest(request);

    if (isFullTestError(result)) {
      const statusCode = result.error.includes('No questions available') ? 404 : 400;
      return res.status(statusCode).json({ error: result.error });
    }

    return res.status(201).json(result);
  } catch (error: any) {
    console.error('Full test session start error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/sessions/fulltest/save-progress
 * Saves answers in progress without revealing correctness.
 * Supports forward/backward navigation.
 * Tracks current question index and time remaining.
 *
 * Body: { sessionId, answers: [{questionIndex, selectedAnswer}], currentIndex }
 * Response 200: { status: 'saved', timeRemaining, currentIndex }
 * Response 400: { error } - validation failures
 * Response 404: { error } - session not found
 *
 * Key constraint: MUST NOT reveal answer correctness (Property 27).
 * Requirements: 4.5, 4.8, 9.6, 9.7
 */
router.post('/save-progress', async (req: Request, res: Response) => {
  try {
    const { sessionId, answers, currentIndex } = req.body;

    const request: SaveProgressRequest = {
      sessionId: sessionId ?? '',
      answers: answers ?? [],
      currentIndex: currentIndex ?? -1,
    };

    const result = await saveFullTestProgress(request);

    if (isFullTestError(result)) {
      const statusCode = result.error.includes('not found') || result.error.includes('expired')
        ? 404
        : 400;
      return res.status(statusCode).json({ error: result.error });
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Full test save-progress error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/sessions/fulltest/submit
 * Submits a completed full test for scoring.
 *
 * Body: { sessionId, answers: [{questionIndex, selectedAnswer}] }
 * Response 200: { score: { correct, total }, details: [...] }
 * Response 400: { error }
 * Response 404: { error }
 *
 * Requirements: 4.6, 4.7
 */
router.post('/submit', async (req: Request, res: Response) => {
  try {
    const { sessionId, answers } = req.body;

    const request: FullTestSubmitRequest = {
      sessionId: sessionId ?? '',
      answers: answers ?? [],
    };

    const result = await submitFullTest(request);

    if (isFullTestError(result)) {
      const statusCode = result.error.includes('not found') || result.error.includes('expired')
        ? 404
        : 400;
      return res.status(statusCode).json({ error: result.error });
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Full test submit error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
