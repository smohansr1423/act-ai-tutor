/**
 * Analytics Routes
 * Express route handlers for analytics dashboard endpoints.
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
 */

import { Router, Request, Response } from 'express';
import { AnalyticsService, isAnalyticsError } from './analytics.service';

const router = Router();
const analyticsService = new AnalyticsService();

/**
 * GET /api/analytics/dashboard/:userId
 * Returns the full student analytics dashboard.
 *
 * Params: userId (path parameter)
 * Response 200: { scoreTrends, weakSkills, avgTimePerSection, accuracyPerSection }
 * Response 400: { error } - validation failures
 */
router.get('/dashboard/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const result = await analyticsService.getStudentDashboard(userId);

    if (isAnalyticsError(result)) {
      return res.status(400).json({ error: result.error });
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Analytics dashboard error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
