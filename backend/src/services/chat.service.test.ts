/**
 * Unit tests for Chat Service - Image Upload and Processing
 * Tests validation, successful extraction, and failure cases.
 *
 * Requirements: 6.2, 6.3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ChatService,
  SendImageRequest,
  SendImageResponse,
  ImageError,
  validateImage,
  buildImageExtractionPrompt,
  isImageError,
  MAX_IMAGE_SIZE_BYTES,
  IMAGE_TIMEOUT_MS,
  MAX_CHAT_MESSAGES,
  ACCEPTED_IMAGE_TYPES,
} from './chat.service';
import {
  ILLMProvider,
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMVisionRequest,
  LLMTimeoutError,
  LLMProviderError,
} from './llm.provider';

// ─── Mock database module ─────────────────────────────────────────────────────

const mockQueryOne = vi.fn();
const mockQuery = vi.fn();
vi.mock('../utils/database', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  query: (...args: unknown[]) => mockQuery(...args),
}));

// ─── Mock cache module ────────────────────────────────────────────────────────

const mockGetChatContext = vi.fn();
const mockSetChatContext = vi.fn();
vi.mock('../utils/cache', () => ({
  getChatContext: (...args: unknown[]) => mockGetChatContext(...args),
  setChatContext: (...args: unknown[]) => mockSetChatContext(...args),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createMockVisionProvider(response?: string | Error): ILLMProvider {
  return {
    complete: vi.fn().mockResolvedValue({ content: '' }),
    completeVision: vi.fn().mockImplementation(async (_request: LLMVisionRequest): Promise<LLMCompletionResponse> => {
      if (response instanceof Error) {
        throw response;
      }
      return { content: response || '' };
    }),
  };
}

function createProviderWithoutVision(): ILLMProvider {
  return {
    complete: vi.fn().mockResolvedValue({ content: '' }),
    // No completeVision method
  };
}

function createImageBuffer(sizeBytes: number): Buffer {
  return Buffer.alloc(sizeBytes, 0xFF);
}

function createValidRequest(overrides?: Partial<SendImageRequest>): SendImageRequest {
  return {
    userId: 'user-123',
    sessionId: 'session-456',
    imageBuffer: createImageBuffer(1024), // 1 KB
    mimeType: 'image/jpeg',
    ...overrides,
  };
}

const VALID_VISION_RESPONSE = `EXTRACTED QUESTION:
What is the value of x when 2x + 4 = 10?
A) 2
B) 3
C) 4
D) 5

EXPLANATION:
Step 1: Subtract 4 from both sides: 2x = 6
Step 2: Divide both sides by 2: x = 3
The correct answer is B) 3.`;

// ─── validateImage Tests ──────────────────────────────────────────────────────

describe('validateImage', () => {
  describe('valid images', () => {
    it('should accept JPEG images within size limit', () => {
      const buffer = createImageBuffer(1024);
      const result = validateImage(buffer, 'image/jpeg');
      expect(result).toBeNull();
    });

    it('should accept PNG images within size limit', () => {
      const buffer = createImageBuffer(5 * 1024 * 1024); // 5 MB
      const result = validateImage(buffer, 'image/png');
      expect(result).toBeNull();
    });

    it('should accept GIF images within size limit', () => {
      const buffer = createImageBuffer(2048);
      const result = validateImage(buffer, 'image/gif');
      expect(result).toBeNull();
    });

    it('should accept images exactly at 10 MB', () => {
      const buffer = createImageBuffer(MAX_IMAGE_SIZE_BYTES);
      const result = validateImage(buffer, 'image/jpeg');
      expect(result).toBeNull();
    });
  });

  describe('invalid image types', () => {
    it('should reject BMP images', () => {
      const buffer = createImageBuffer(1024);
      const result = validateImage(buffer, 'image/bmp');
      expect(result).not.toBeNull();
      expect(result!.errorType).toBe('validation');
      expect(result!.error).toContain('Unsupported image type');
    });

    it('should reject SVG images', () => {
      const buffer = createImageBuffer(1024);
      const result = validateImage(buffer, 'image/svg+xml');
      expect(result).not.toBeNull();
      expect(result!.errorType).toBe('validation');
    });

    it('should reject WEBP images', () => {
      const buffer = createImageBuffer(1024);
      const result = validateImage(buffer, 'image/webp');
      expect(result).not.toBeNull();
      expect(result!.errorType).toBe('validation');
    });

    it('should reject non-image MIME types', () => {
      const buffer = createImageBuffer(1024);
      const result = validateImage(buffer, 'application/pdf');
      expect(result).not.toBeNull();
      expect(result!.errorType).toBe('validation');
    });
  });

  describe('invalid image sizes', () => {
    it('should reject images exceeding 10 MB', () => {
      const buffer = createImageBuffer(MAX_IMAGE_SIZE_BYTES + 1);
      const result = validateImage(buffer, 'image/jpeg');
      expect(result).not.toBeNull();
      expect(result!.errorType).toBe('validation');
      expect(result!.error).toContain('exceeds the maximum');
    });

    it('should reject empty images', () => {
      const buffer = Buffer.alloc(0);
      const result = validateImage(buffer, 'image/jpeg');
      expect(result).not.toBeNull();
      expect(result!.errorType).toBe('validation');
      expect(result!.error).toContain('empty');
    });
  });
});

// ─── buildImageExtractionPrompt Tests ─────────────────────────────────────────

describe('buildImageExtractionPrompt', () => {
  it('should include instructions to extract question content', () => {
    const prompt = buildImageExtractionPrompt();
    expect(prompt).toContain('Extract the question content');
  });

  it('should include instructions for step-by-step explanation', () => {
    const prompt = buildImageExtractionPrompt();
    expect(prompt).toContain('step-by-step explanation');
  });

  it('should include EXTRACTION_FAILED fallback instruction', () => {
    const prompt = buildImageExtractionPrompt();
    expect(prompt).toContain('EXTRACTION_FAILED');
  });

  it('should include structured response format', () => {
    const prompt = buildImageExtractionPrompt();
    expect(prompt).toContain('EXTRACTED QUESTION:');
    expect(prompt).toContain('EXPLANATION:');
  });
});

// ─── isImageError Tests ───────────────────────────────────────────────────────

describe('isImageError', () => {
  it('should return true for error responses', () => {
    const error: ImageError = {
      error: 'Some error',
      errorType: 'validation',
    };
    expect(isImageError(error)).toBe(true);
  });

  it('should return false for success responses', () => {
    const success: SendImageResponse = {
      extractedQuestion: 'What is 2+2?',
      reply: 'The answer is 4.',
    };
    expect(isImageError(success)).toBe(false);
  });
});

// ─── ChatService.sendImage Tests ──────────────────────────────────────────────

describe('ChatService', () => {
  let service: ChatService;
  let mockProvider: ILLMProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetChatContext.mockResolvedValue(null);
    mockSetChatContext.mockResolvedValue(undefined);
    mockQueryOne.mockResolvedValue(null);
    mockQuery.mockResolvedValue(undefined);
  });

  describe('sendImage - validation', () => {
    beforeEach(() => {
      mockProvider = createMockVisionProvider(VALID_VISION_RESPONSE);
      service = new ChatService(mockProvider);
    });

    it('should reject unsupported image types', async () => {
      const request = createValidRequest({ mimeType: 'image/bmp' });
      const result = await service.sendImage(request);

      expect(isImageError(result)).toBe(true);
      const error = result as ImageError;
      expect(error.errorType).toBe('validation');
      expect(error.error).toContain('Unsupported image type');
    });

    it('should reject images exceeding 10 MB', async () => {
      const request = createValidRequest({
        imageBuffer: createImageBuffer(MAX_IMAGE_SIZE_BYTES + 1),
      });
      const result = await service.sendImage(request);

      expect(isImageError(result)).toBe(true);
      const error = result as ImageError;
      expect(error.errorType).toBe('validation');
      expect(error.error).toContain('exceeds the maximum');
    });

    it('should reject empty images', async () => {
      const request = createValidRequest({
        imageBuffer: Buffer.alloc(0),
      });
      const result = await service.sendImage(request);

      expect(isImageError(result)).toBe(true);
      const error = result as ImageError;
      expect(error.errorType).toBe('validation');
    });

    it('should not call LLM for invalid images', async () => {
      const request = createValidRequest({ mimeType: 'image/bmp' });
      await service.sendImage(request);

      expect(mockProvider.completeVision).not.toHaveBeenCalled();
    });
  });

  describe('sendImage - successful extraction', () => {
    beforeEach(() => {
      mockProvider = createMockVisionProvider(VALID_VISION_RESPONSE);
      service = new ChatService(mockProvider);
    });

    it('should return extracted question and explanation', async () => {
      const request = createValidRequest();
      const result = await service.sendImage(request);

      expect(isImageError(result)).toBe(false);
      const response = result as SendImageResponse;
      expect(response.extractedQuestion).toContain('What is the value of x');
      expect(response.reply).toContain('Step 1');
    });

    it('should call LLM vision with 10-second timeout', async () => {
      const request = createValidRequest();
      await service.sendImage(request);

      expect(mockProvider.completeVision).toHaveBeenCalledWith(
        expect.objectContaining({ timeoutMs: IMAGE_TIMEOUT_MS })
      );
    });

    it('should send image as base64 to LLM', async () => {
      const request = createValidRequest();
      await service.sendImage(request);

      expect(mockProvider.completeVision).toHaveBeenCalledWith(
        expect.objectContaining({
          imageBase64: request.imageBuffer.toString('base64'),
          mimeType: 'image/jpeg',
        })
      );
    });

    it('should store exchange in chat context', async () => {
      const request = createValidRequest();
      await service.sendImage(request);

      expect(mockSetChatContext).toHaveBeenCalledWith(
        'session-456',
        expect.arrayContaining([
          expect.objectContaining({ role: 'student' }),
          expect.objectContaining({ role: 'tutor' }),
        ]),
        expect.any(Number)
      );
    });

    it('should persist chat messages to database', async () => {
      const request = createValidRequest();
      await service.sendImage(request);

      // Should try to check if session exists, then insert
      expect(mockQueryOne).toHaveBeenCalled();
      expect(mockQuery).toHaveBeenCalled();
    });

    it('should handle unstructured but valid LLM responses', async () => {
      const unstructuredResponse = 'This is a math problem about finding x. To solve 2x + 4 = 10, subtract 4 from both sides to get 2x = 6, then divide by 2 to get x = 3.';
      mockProvider = createMockVisionProvider(unstructuredResponse);
      service = new ChatService(mockProvider);

      const request = createValidRequest();
      const result = await service.sendImage(request);

      expect(isImageError(result)).toBe(false);
      const response = result as SendImageResponse;
      expect(response.reply).toContain('math problem');
    });
  });

  describe('sendImage - extraction failure', () => {
    it('should return error when LLM returns EXTRACTION_FAILED', async () => {
      mockProvider = createMockVisionProvider('EXTRACTION_FAILED');
      service = new ChatService(mockProvider);

      const request = createValidRequest();
      const result = await service.sendImage(request);

      expect(isImageError(result)).toBe(true);
      const error = result as ImageError;
      expect(error.errorType).toBe('extraction_failed');
      expect(error.retryPrompt).toContain('clearer image');
    });

    it('should return error when LLM returns empty content', async () => {
      mockProvider = createMockVisionProvider('');
      service = new ChatService(mockProvider);

      const request = createValidRequest();
      const result = await service.sendImage(request);

      expect(isImageError(result)).toBe(true);
      const error = result as ImageError;
      expect(error.errorType).toBe('extraction_failed');
    });

    it('should include retry prompt suggesting clearer image or text', async () => {
      mockProvider = createMockVisionProvider('EXTRACTION_FAILED');
      service = new ChatService(mockProvider);

      const request = createValidRequest();
      const result = await service.sendImage(request);

      expect(isImageError(result)).toBe(true);
      const error = result as ImageError;
      expect(error.retryPrompt).toContain('type your question');
    });
  });

  describe('sendImage - timeout handling', () => {
    it('should return timeout error when LLM exceeds 10 seconds', async () => {
      mockProvider = createMockVisionProvider(new LLMTimeoutError(IMAGE_TIMEOUT_MS));
      service = new ChatService(mockProvider);

      const request = createValidRequest();
      const result = await service.sendImage(request);

      expect(isImageError(result)).toBe(true);
      const error = result as ImageError;
      expect(error.errorType).toBe('timeout');
      expect(error.retryPrompt).toBeDefined();
    });
  });

  describe('sendImage - provider errors', () => {
    it('should return provider error when LLM service fails', async () => {
      mockProvider = createMockVisionProvider(new LLMProviderError('Service unavailable', 503));
      service = new ChatService(mockProvider);

      const request = createValidRequest();
      const result = await service.sendImage(request);

      expect(isImageError(result)).toBe(true);
      const error = result as ImageError;
      expect(error.errorType).toBe('provider');
      expect(error.retryPrompt).toBeDefined();
    });

    it('should return error when vision is not supported by provider', async () => {
      const provider = createProviderWithoutVision();
      service = new ChatService(provider);

      const request = createValidRequest();
      const result = await service.sendImage(request);

      expect(isImageError(result)).toBe(true);
      const error = result as ImageError;
      expect(error.errorType).toBe('provider');
      expect(error.retryPrompt).toContain('type your question');
    });

    it('should handle unexpected errors gracefully', async () => {
      mockProvider = createMockVisionProvider(new Error('Unexpected network failure'));
      service = new ChatService(mockProvider);

      const request = createValidRequest();
      const result = await service.sendImage(request);

      expect(isImageError(result)).toBe(true);
      const error = result as ImageError;
      expect(error.errorType).toBe('provider');
    });
  });

  describe('sendImage - conversation history', () => {
    beforeEach(() => {
      mockProvider = createMockVisionProvider(VALID_VISION_RESPONSE);
      service = new ChatService(mockProvider);
    });

    it('should append to existing conversation history', async () => {
      const existingMessages = [
        { role: 'student', content: 'Hello', timestamp: '2024-01-01T00:00:00.000Z' },
        { role: 'tutor', content: 'Hi there!', timestamp: '2024-01-01T00:00:01.000Z' },
      ];
      mockGetChatContext.mockResolvedValue(existingMessages);

      const request = createValidRequest();
      await service.sendImage(request);

      expect(mockSetChatContext).toHaveBeenCalledWith(
        'session-456',
        expect.arrayContaining([
          expect.objectContaining({ content: 'Hello' }),
          expect.objectContaining({ content: 'Hi there!' }),
          expect.objectContaining({ role: 'student' }),
          expect.objectContaining({ role: 'tutor' }),
        ]),
        expect.any(Number)
      );
    });

    it('should enforce 50-message limit', async () => {
      // Create 49 existing messages
      const existingMessages = Array.from({ length: 49 }, (_, i) => ({
        role: i % 2 === 0 ? 'student' : 'tutor',
        content: `Message ${i}`,
        timestamp: new Date(2024, 0, 1, 0, 0, i).toISOString(),
      }));
      mockGetChatContext.mockResolvedValue(existingMessages);

      const request = createValidRequest();
      await service.sendImage(request);

      // 49 existing + 2 new = 51, should be trimmed to 50
      const setChatCall = mockSetChatContext.mock.calls[0];
      const storedMessages = setChatCall[1];
      expect(storedMessages.length).toBeLessThanOrEqual(MAX_CHAT_MESSAGES);
    });

    it('should update existing chat session in database', async () => {
      mockQueryOne.mockResolvedValue({ chat_session_id: 'session-456' });

      const request = createValidRequest();
      await service.sendImage(request);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE chat_sessions'),
        expect.any(Array)
      );
    });

    it('should create new chat session in database if not exists', async () => {
      mockQueryOne.mockResolvedValue(null);

      const request = createValidRequest();
      await service.sendImage(request);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO chat_sessions'),
        expect.any(Array)
      );
    });
  });
});

// ─── Constants Tests ──────────────────────────────────────────────────────────

describe('Constants', () => {
  it('MAX_IMAGE_SIZE_BYTES should be 10 MB', () => {
    expect(MAX_IMAGE_SIZE_BYTES).toBe(10 * 1024 * 1024);
  });

  it('IMAGE_TIMEOUT_MS should be 10 seconds', () => {
    expect(IMAGE_TIMEOUT_MS).toBe(10000);
  });

  it('MAX_CHAT_MESSAGES should be 50', () => {
    expect(MAX_CHAT_MESSAGES).toBe(50);
  });

  it('ACCEPTED_IMAGE_TYPES should include JPEG, PNG, and GIF', () => {
    expect(ACCEPTED_IMAGE_TYPES).toContain('image/jpeg');
    expect(ACCEPTED_IMAGE_TYPES).toContain('image/png');
    expect(ACCEPTED_IMAGE_TYPES).toContain('image/gif');
  });

  it('ACCEPTED_IMAGE_TYPES should only include 3 types', () => {
    expect(ACCEPTED_IMAGE_TYPES).toHaveLength(3);
  });
});
