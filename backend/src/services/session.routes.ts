/**
 * Session Routes
 * Express route handlers for practice and full test session endpoints.
 * Requirements: 3.1, 3.2, 3.3, 4.9, 4.10
 */

import { Router, Request, Response } from 'express';
import {
  startPracticeSession,
  getNextQuestion,
  isSessionError,
  StartPracticeRequest,
} from './session.service';
import {
  interruptSession,
  resumeSession,
  isSessionInterruptError,
} from './session-interrupt.service';
import {
  PerformanceService,
  isSubmitAnswerError,
} from './performance.service';
import { SessionSection } from '../models/enums';

const router = Router();

/**
 * POST /api/sessions/practice/start
 * Starts a new practice session with section selection.
 *
 * Body: { userId, section, mode }
 * Response 201: { sessionId, firstQuestion }
 * Response 400: { error } - validation failures
 * Response 404: { error } - no questions available
 */
router.post('/practice/start', async (req: Request, res: Response) => {
  // v2: defaults mode to 'section' when not provided
  try {
    const { userId, section, mode } = req.body;

    const request: StartPracticeRequest = {
      userId: userId || req.user?.userId || '',
      section: (section as SessionSection) ?? '',
      mode: mode || 'section',
    };

    const result = await startPracticeSession(request);

    if (isSessionError(result)) {
      const statusCode = result.message.includes('No questions available') ? 404 : 400;
      return res.status(statusCode).json({ error: result.message });
    }

    return res.status(201).json(result);
  } catch (error: any) {
    console.error('Practice session start error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/sessions/practice/next
 * Gets the next question in an active practice session.
 *
 * Body: { sessionId }
 * Response 200: { questionId, section, questionText, ... }
 * Response 204: No more questions
 * Response 400: { error }
 * Response 404: { error } - session not found
 */
router.post('/practice/next', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const result = await getNextQuestion(sessionId);

    if (result === null) {
      return res.status(204).send();
    }

    if (isSessionError(result)) {
      const statusCode = result.message.includes('not found') ? 404 : 400;
      return res.status(statusCode).json({ error: result.message });
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Practice next question error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/sessions/practice/submit
 * Submits an answer for the current question in a practice session.
 *
 * Body: { sessionId, questionId, selectedAnswer, timeTaken }
 * Response 200: { isCorrect, explanation, correctAnswer, strategyTip, incorrectReasoning }
 * Response 400: { error } - validation failures
 * Response 404: { error } - session/question not found
 */
router.post('/practice/submit', async (req: Request, res: Response) => {
  try {
    const { sessionId, questionId, selectedAnswer, timeTaken } = req.body;

    const performanceService = new PerformanceService();
    const result = await performanceService.submitAnswer({
      sessionId: sessionId ?? '',
      questionId: questionId ?? '',
      selectedAnswer: selectedAnswer ?? '',
      timeTaken: typeof timeTaken === 'number' ? timeTaken : 0.1,
    });

    if (isSubmitAnswerError(result)) {
      const statusCode = result.error.includes('not found') ? 404 : 400;
      return res.status(statusCode).json({ error: result.error });
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Practice submit error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/sessions/fulltest/interrupt
 * Marks an active full test session as interrupted.
 * Preserves all saved answers and sets expiry to 24 hours from session start.
 *
 * Body: { sessionId }
 * Response 200: { sessionId, status, expiresAt }
 * Response 400: { error } - validation failures
 * Response 404: { error } - session not found
 */
router.post('/fulltest/interrupt', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;

    const result = await interruptSession({ sessionId: sessionId ?? '' });

    if (isSessionInterruptError(result)) {
      const statusCode = result.error.includes('not found') ? 404 : 400;
      return res.status(statusCode).json({ error: result.error });
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Session interrupt error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/sessions/fulltest/resume
 * Resumes an interrupted full test session within the 24-hour window.
 * Returns questions, saved answers, time remaining, and current index.
 *
 * Body: { sessionId }
 * Response 200: { sessionId, questions, answers, timeRemaining, currentIndex }
 * Response 400: { error } - validation failures or session expired
 * Response 404: { error } - session not found
 */
router.post('/fulltest/resume', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;

    const result = await resumeSession({ sessionId: sessionId ?? '' });

    if (isSessionInterruptError(result)) {
      const statusCode = result.error.includes('not found') ? 404 : 400;
      return res.status(statusCode).json({ error: result.error });
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Session resume error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
