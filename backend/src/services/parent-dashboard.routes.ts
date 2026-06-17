/**
 * Parent Dashboard Routes
 * Express route handler for the parent analytics endpoint.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8
 */

import { Router, Request, Response } from 'express';
import { getParentDashboard } from './parent-dashboard.service';

const router = Router();

/**
 * GET /api/analytics/parent/:parentId/:studentId?
 *
 * Returns the parent dashboard data for a given parent and optionally a specific student.
 *
 * Params:
 *   - parentId (required): UUID of the parent
 *   - studentId (optional): UUID of a specific linked student
 *
 * Responses:
 *   200: Dashboard data, student selection list, or empty state messages
 *   400: Validation error or access denied
 *   404: Parent not found
 *   500: Internal server error
 */
router.get('/parent/:parentId/:studentId?', async (req: Request, res: Response) => {
  try {
    const { parentId, studentId } = req.params;

    const result = await getParentDashboard(parentId, studentId || undefined);

    switch (result.type) {
      case 'dashboard':
        return res.status(200).json(result.data);

      case 'student_selection':
        return res.status(200).json({
          message: 'Multiple linked students found. Please select a student.',
          linkedStudents: result.linkedStudents,
        });

      case 'no_linked_students':
        return res.status(200).json({ message: result.message });

      case 'no_performance_data':
        return res.status(200).json({
          studentId: result.studentId,
          studentName: result.studentName,
          message: result.message,
        });

      case 'error':
        if (result.message.includes('not found')) {
          return res.status(404).json({ error: result.message });
        }
        return res.status(400).json({ error: result.message });

      default:
        return res.status(500).json({ error: 'Unexpected response type' });
    }
  } catch (error: any) {
    console.error('Parent dashboard error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
