/**
 * Chat Routes
 * Express route handlers for AI Tutor Chat endpoints.
 * Requirements: 6.2, 6.3
 */

import { Router, Request, Response } from 'express';
import { ChatService, isImageError, ACCEPTED_IMAGE_TYPES, MAX_IMAGE_SIZE_BYTES } from './chat.service';

const router = Router();
const chatService = new ChatService();

/**
 * POST /api/chat/image
 * Handles multipart image upload for question extraction.
 *
 * Expects the request body to contain raw image data with appropriate headers.
 * In production, this would use a multipart middleware (e.g., multer).
 * For this implementation, we accept base64-encoded image in JSON body.
 *
 * Body: { userId, sessionId, image (base64 string), mimeType }
 * Response 200: { extractedQuestion, reply }
 * Response 400: { error, retryPrompt? } - validation failures
 * Response 422: { error, retryPrompt } - extraction failed
 * Response 408: { error, retryPrompt } - timeout
 * Response 500: { error } - internal server error
 */
router.post('/image', async (req: Request, res: Response) => {
  try {
    const { userId, sessionId, image, mimeType } = req.body;

    // Validate required fields
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'userId is required' });
    }

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    if (!image || typeof image !== 'string') {
      return res.status(400).json({ error: 'image (base64) is required' });
    }

    if (!mimeType || typeof mimeType !== 'string') {
      return res.status(400).json({ error: 'mimeType is required' });
    }

    // Convert base64 to Buffer
    let imageBuffer: Buffer;
    try {
      imageBuffer = Buffer.from(image, 'base64');
    } catch {
      return res.status(400).json({ error: 'Invalid base64 image data' });
    }

    const result = await chatService.sendImage({
      userId,
      sessionId,
      imageBuffer,
      mimeType,
    });

    if (isImageError(result)) {
      let statusCode: number;
      switch (result.errorType) {
        case 'validation':
          statusCode = 400;
          break;
        case 'extraction_failed':
          statusCode = 422;
          break;
        case 'timeout':
          statusCode = 408;
          break;
        case 'provider':
          statusCode = 502;
          break;
        default:
          statusCode = 500;
      }

      return res.status(statusCode).json({
        error: result.error,
        retryPrompt: result.retryPrompt,
      });
    }

    return res.status(200).json(result);
  } catch (error: unknown) {
    console.error('Chat image processing error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
