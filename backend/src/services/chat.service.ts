/**
 * Chat Service - Image Upload and Processing
 * Handles image-based question extraction and AI tutoring responses.
 *
 * Requirements: 6.2, 6.3
 */

import { v4 as uuidv4 } from 'uuid';
import { ChatMessage } from '../models/interfaces';
import { queryOne, query } from '../utils/database';
import { getChatContext, setChatContext } from '../utils/cache';
import {
  ILLMProvider,
  LLMVisionRequest,
  DefaultLLMProvider,
  LLMTimeoutError,
  LLMProviderError,
} from './llm.provider';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum image size in bytes (10 MB) */
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

/** Timeout for image processing LLM calls (10 seconds per Requirement 6.2) */
export const IMAGE_TIMEOUT_MS = 10000;

/** Maximum number of messages retained in chat context (Requirement 6.7) */
export const MAX_CHAT_MESSAGES = 50;

/** Accepted image MIME types */
export const ACCEPTED_IMAGE_TYPES: string[] = [
  'image/jpeg',
  'image/png',
  'image/gif',
];

/** TTL for chat context in Redis (2 hours) */
const CHAT_CONTEXT_TTL = 7200;

// ─── Context Window Logic ─────────────────────────────────────────────────────

/**
 * Enforce the chat context window limit.
 * If messages exceed MAX_CHAT_MESSAGES, only the most recent MAX_CHAT_MESSAGES are retained.
 * Returns a new array with at most MAX_CHAT_MESSAGES messages.
 *
 * Requirement 6.7: Conversation context is maintained for up to 50 messages per session.
 */
export function enforceContextWindow<T>(messages: T[], maxMessages: number = MAX_CHAT_MESSAGES): T[] {
  if (messages.length <= maxMessages) {
    return [...messages];
  }
  return messages.slice(-maxMessages);
}

// ─── Types ────────────────────────────────────────────────────────────────────

/** Request to send an image for question extraction */
export interface SendImageRequest {
  userId: string;
  sessionId: string;
  imageBuffer: Buffer;
  mimeType: string;
}

/** Successful image processing response */
export interface SendImageResponse {
  extractedQuestion: string;
  reply: string;
}

/** Error response for image processing */
export interface ImageError {
  error: string;
  errorType: 'validation' | 'extraction_failed' | 'timeout' | 'provider';
  retryPrompt?: string;
}

export type ImageResult = SendImageResponse | ImageError;

// ─── Type Guards ──────────────────────────────────────────────────────────────

/**
 * Check if a result is an ImageError.
 */
export function isImageError(result: ImageResult): result is ImageError {
  return 'error' in result && 'errorType' in result;
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate image type and size.
 * Returns null if valid, or an ImageError if invalid.
 */
export function validateImage(imageBuffer: Buffer, mimeType: string): ImageError | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(mimeType)) {
    return {
      error: `Unsupported image type: ${mimeType}. Accepted types: JPEG, PNG, GIF.`,
      errorType: 'validation',
    };
  }

  if (imageBuffer.length > MAX_IMAGE_SIZE_BYTES) {
    const sizeMB = (imageBuffer.length / (1024 * 1024)).toFixed(2);
    return {
      error: `Image size (${sizeMB} MB) exceeds the maximum allowed size of 10 MB.`,
      errorType: 'validation',
    };
  }

  if (imageBuffer.length === 0) {
    return {
      error: 'Image file is empty.',
      errorType: 'validation',
    };
  }

  return null;
}

// ─── Prompt Building ──────────────────────────────────────────────────────────

/**
 * Build the prompt for extracting a question from an image and providing explanation.
 */
export function buildImageExtractionPrompt(): string {
  return `You are a supportive ACT test tutor helping a student.

The student has uploaded an image of a question. Please:
1. Extract the question content from the image (including any passage, question text, and answer choices).
2. Provide a clear, step-by-step explanation of how to solve this question.
3. Use encouraging, grade-appropriate language.

Format your response as follows:
EXTRACTED QUESTION:
[The full question text as read from the image]

EXPLANATION:
[Step-by-step explanation of the solution]

If you cannot read or extract the question from the image, respond with exactly:
EXTRACTION_FAILED

Do NOT guess or make up a question if the image is unclear.`;
}

// ─── Chat Service ─────────────────────────────────────────────────────────────

/**
 * ChatService handles image-based question processing for the AI tutor.
 * Uses LLM vision capabilities to extract questions from images and provide explanations.
 */
export class ChatService {
  private readonly llmProvider: ILLMProvider;

  constructor(llmProvider?: ILLMProvider) {
    this.llmProvider = llmProvider || new DefaultLLMProvider();
  }

  /**
   * Process an uploaded image to extract a question and provide explanation.
   *
   * Flow:
   * 1. Validate image type (JPEG, PNG, GIF only)
   * 2. Validate image size (reject > 10 MB)
   * 3. Send image to LLM vision API for question extraction
   * 4. If extraction succeeds: provide step-by-step explanation
   * 5. If extraction fails: return error with prompt to upload clearer image or type question
   * 6. Store exchange in conversation history (within 50-message limit)
   *
   * Timeout: 10 seconds
   */
  async sendImage(request: SendImageRequest): Promise<ImageResult> {
    const { userId, sessionId, imageBuffer, mimeType } = request;

    // 1-2. Validate image type and size
    const validationError = validateImage(imageBuffer, mimeType);
    if (validationError) {
      return validationError;
    }

    // 3. Send image to LLM vision API
    const imageBase64 = imageBuffer.toString('base64');
    const prompt = buildImageExtractionPrompt();

    const visionRequest: LLMVisionRequest = {
      prompt,
      imageBase64,
      mimeType,
      timeoutMs: IMAGE_TIMEOUT_MS,
      temperature: 0.3,
      maxTokens: 2000,
    };

    try {
      if (!this.llmProvider.completeVision) {
        return {
          error: 'Image processing is not supported by the current LLM provider.',
          errorType: 'provider',
          retryPrompt: 'Please type your question as text instead.',
        };
      }

      const response = await this.llmProvider.completeVision(visionRequest);
      const content = response.content.trim();

      // 5. If extraction fails
      if (!content || content === 'EXTRACTION_FAILED') {
        return {
          error: 'Could not extract the question from the uploaded image.',
          errorType: 'extraction_failed',
          retryPrompt: 'Please upload a clearer image or type your question as text.',
        };
      }

      // 4. Parse the response
      const parsed = this.parseVisionResponse(content);

      if (!parsed) {
        return {
          error: 'Could not extract the question from the uploaded image.',
          errorType: 'extraction_failed',
          retryPrompt: 'Please upload a clearer image or type your question as text.',
        };
      }

      // 6. Store exchange in conversation history
      await this.storeImageExchange(userId, sessionId, parsed.extractedQuestion, parsed.reply);

      return parsed;
    } catch (error: unknown) {
      if (error instanceof LLMTimeoutError) {
        return {
          error: 'Image processing timed out. Please try again.',
          errorType: 'timeout',
          retryPrompt: 'Please upload a clearer image or type your question as text.',
        };
      }

      if (error instanceof LLMProviderError) {
        return {
          error: 'Failed to process the image. Please try again.',
          errorType: 'provider',
          retryPrompt: 'Please upload a clearer image or type your question as text.',
        };
      }

      return {
        error: 'An unexpected error occurred while processing the image.',
        errorType: 'provider',
        retryPrompt: 'Please upload a clearer image or type your question as text.',
      };
    }
  }

  /**
   * Parse the LLM vision response into extracted question and explanation.
   * Returns null if the response cannot be parsed.
   */
  private parseVisionResponse(content: string): SendImageResponse | null {
    // Try to parse the structured response
    const extractedMatch = content.match(/EXTRACTED QUESTION:\s*([\s\S]*?)(?=EXPLANATION:|$)/i);
    const explanationMatch = content.match(/EXPLANATION:\s*([\s\S]*?)$/i);

    if (extractedMatch && explanationMatch) {
      const extractedQuestion = extractedMatch[1].trim();
      const reply = explanationMatch[1].trim();

      if (extractedQuestion && reply) {
        return { extractedQuestion, reply };
      }
    }

    // If structured parsing fails but content seems valid (not EXTRACTION_FAILED),
    // treat the entire response as the reply with a generic extracted question note
    if (content.length > 20 && !content.includes('EXTRACTION_FAILED')) {
      return {
        extractedQuestion: '[Question extracted from image]',
        reply: content,
      };
    }

    return null;
  }

  /**
   * Store the image exchange in the conversation history.
   * Enforces the 50-message context window limit.
   */
  private async storeImageExchange(
    userId: string,
    sessionId: string,
    extractedQuestion: string,
    reply: string
  ): Promise<void> {
    // Get existing chat context
    let messages = await getChatContext<ChatMessage>(sessionId) || [];

    // Add the student's image message
    const studentMessage: ChatMessage = {
      role: 'student',
      content: `[Image uploaded] ${extractedQuestion}`,
      timestamp: new Date().toISOString(),
    };

    // Add the tutor's response
    const tutorMessage: ChatMessage = {
      role: 'tutor',
      content: reply,
      timestamp: new Date().toISOString(),
    };

    messages.push(studentMessage, tutorMessage);

    // Enforce 50-message limit
    messages = enforceContextWindow(messages);

    // Store in Redis cache
    await setChatContext(sessionId, messages, CHAT_CONTEXT_TTL);

    // Persist to database
    await this.persistChatMessages(userId, sessionId, messages);
  }

  /**
   * Persist chat messages to the database.
   */
  private async persistChatMessages(
    userId: string,
    sessionId: string,
    messages: ChatMessage[]
  ): Promise<void> {
    const existing = await queryOne<{ chat_session_id: string }>(
      'SELECT chat_session_id FROM chat_sessions WHERE chat_session_id = $1',
      [sessionId]
    );

    if (existing) {
      await query(
        'UPDATE chat_sessions SET messages = $1, updated_at = $2 WHERE chat_session_id = $3',
        [JSON.stringify(messages), new Date(), sessionId]
      );
    } else {
      await query(
        `INSERT INTO chat_sessions (chat_session_id, user_id, messages, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [sessionId, userId, JSON.stringify(messages), new Date(), new Date()]
      );
    }
  }
}
