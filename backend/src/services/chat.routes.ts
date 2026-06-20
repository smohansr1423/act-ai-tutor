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
 * POST /api/chat/message
 * Handles text message to AI tutor.
 *
 * Body: { userId, sessionId, text }
 * Response 200: { reply }
 * Response 400: { error } - validation failures
 * Response 500: { error } - internal server error
 */
router.post('/message', async (req: Request, res: Response) => {
  try {
    const { userId, sessionId, text } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'text is required' });
    }

    if (text.length > 1000) {
      return res.status(400).json({ error: 'Message exceeds 1000 character limit' });
    }

    const { DefaultLLMProvider: LLMProvider, LLMProviderError: ProviderError } = await import('./llm.provider');
    const llm = new LLMProvider();

    if (!llm.isConfigured()) {
      return res.status(503).json({ error: 'AI assistance is currently unavailable. Please try again later.' });
    }

    const response = await llm.complete({
      prompt: `You are a supportive ACT test tutor. Help the student with their ACT prep question. Be encouraging, clear, and concise. If they ask about a specific subject (English, Math, Reading, Science), tailor your response to ACT-style content.\n\nStudent: ${text.trim()}`,
      maxTokens: 1000,
      temperature: 0.7,
      timeoutMs: 15000,
    });

    return res.status(200).json({ reply: response.content });
  } catch (error: any) {
    console.error('Chat message error:', error);
    if (error?.name === 'LLMProviderError') {
      return res.status(502).json({ error: error.message });
    }
    if (error?.name === 'LLMTimeoutError') {
      return res.status(408).json({ error: 'Response timed out. Please try again.' });
    }
    return res.status(500).json({ error: 'Failed to get AI response. Please try again.' });
  }
});

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
