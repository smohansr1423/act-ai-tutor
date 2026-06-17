/**
 * Adaptive Routes
 * Express route handlers for adaptive learning endpoints.
 * Requirements: 5.7, 5.8
 */

import { Router, Request, Response } from 'express';
import {
  generatePacingDrill,
  isPacingDrillError,
  PacingDrillRequest,
} from './pacing-drill.service';
import {
  generateStudyPlan,
  isStudyPlanError,
} from './study-plan.service';

const router = Router();

/**
 * POST /api/adaptive/pacing-drill
 * Generates a pacing drill with progressively shorter time limits.
 *
 * Body: { userId, skillTag, severity? }
 * Response 200: { questions: [...], timeLimits: [120, 110, ...] }
 * Response 400: { error } - validation failures
 * Response 404: { error } - no questions available
 */
router.post('/pacing-drill', async (req: Request, res: Response) => {
  try {
    const { userId, skillTag, severity } = req.body;

    const request: PacingDrillRequest = {
      userId: userId ?? '',
      skillTag: skillTag ?? '',
    };

    const result = await generatePacingDrill(request, severity);

    if (isPacingDrillError(result)) {
      const statusCode = result.error.includes('No questions available') ||
        result.error.includes('Insufficient questions')
        ? 404
        : 400;
      return res.status(statusCode).json({ error: result.error });
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Pacing drill generation error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/adaptive/study-plan
 * Generates a personalized study plan for a student based on their weakness profile.
 *
 * Body: { userId }
 * Response 200: { dailyTargets, weeklyGoals, projectedScoreRange }
 * Response 400: { error } - validation failures or no weak skills found
 */
router.post('/study-plan', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;

    const result = await generateStudyPlan(userId ?? '');

    if (isStudyPlanError(result)) {
      return res.status(400).json({ error: result.error });
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Study plan generation error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
