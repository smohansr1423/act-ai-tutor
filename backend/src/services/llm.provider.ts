/**
 * LLM Provider Interface
 * Abstraction layer for LLM API calls, enabling testability via mocking.
 */

export interface LLMCompletionRequest {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface LLMVisionRequest {
  prompt: string;
  imageBase64: string;
  mimeType: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface LLMCompletionResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Interface for LLM providers. Implementations can target OpenAI, Anthropic,
 * or any other provider. This abstraction allows mocking in tests.
 */
export interface ILLMProvider {
  /**
   * Send a completion request to the LLM.
   * @throws LLMTimeoutError if the request exceeds the timeout
   * @throws LLMProviderError for any other provider-level failure
   */
  complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse>;

  /**
   * Send a vision request to the LLM with an image.
   * @throws LLMTimeoutError if the request exceeds the timeout
   * @throws LLMProviderError for any other provider-level failure
   */
  completeVision?(request: LLMVisionRequest): Promise<LLMCompletionResponse>;
}

/**
 * Error thrown when an LLM request exceeds the configured timeout.
 */
export class LLMTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`LLM request timed out after ${timeoutMs}ms`);
    this.name = 'LLMTimeoutError';
  }
}

/**
 * Error thrown for general LLM provider failures (rate limits, server errors, etc.).
 */
export class LLMProviderError extends Error {
  public readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'LLMProviderError';
    this.statusCode = statusCode;
  }
}

/**
 * Validates LLM configuration at startup.
 * Logs a WARNING if LLM_API_KEY is not configured, or an info confirmation if it is.
 * This is a warning only — the app should still start for non-AI features.
 */
export function validateLLMConfig(): void {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    console.warn('WARNING: LLM_API_KEY is not configured. AI assistance features will be unavailable.');
  } else {
    console.log('[LLM] LLM_API_KEY is configured. AI assistance features are available.');
  }
}

/**
 * Default LLM provider implementation using HTTP fetch to a configurable endpoint.
 * Supports OpenAI-compatible APIs.
 */
export class DefaultLLMProvider implements ILLMProvider {
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly model: string;

  constructor(config?: { apiKey?: string; endpoint?: string; model?: string }) {
    this.apiKey = config?.apiKey || process.env.LLM_API_KEY || '';
    this.endpoint = config?.endpoint || process.env.LLM_ENDPOINT || 'https://api.openai.com/v1/chat/completions';
    this.model = config?.model || process.env.LLM_MODEL || 'gpt-4';
  }

  /**
   * Check if the LLM provider is configured with a valid (non-empty) API key.
   */
  isConfigured(): boolean {
    return this.apiKey.trim().length > 0;
  }

  async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    // Guard: throw immediately if API key is not configured
    if (!this.isConfigured()) {
      throw new LLMProviderError(
        'AI assistance is unavailable: LLM_API_KEY is not configured'
      );
    }

    const timeoutMs = request.timeoutMs || 8000;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: 'You are an expert ACT test question generator. Always respond with valid JSON.' },
            { role: 'user', content: request.prompt },
          ],
          max_tokens: request.maxTokens || 2000,
          temperature: request.temperature || 0.7,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new LLMProviderError(
            'API key is invalid or unauthorized',
            response.status
          );
        }
        throw new LLMProviderError(
          `LLM provider returned status ${response.status}: ${response.statusText}`,
          response.status
        );
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      };

      return {
        content: data.choices[0]?.message?.content || '',
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        } : undefined,
      };
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new LLMTimeoutError(timeoutMs);
      }
      if (error instanceof LLMProviderError || error instanceof LLMTimeoutError) {
        throw error;
      }
      throw new LLMProviderError(
        `LLM request failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async completeVision(request: LLMVisionRequest): Promise<LLMCompletionResponse> {
    // Guard: throw immediately if API key is not configured
    if (!this.isConfigured()) {
      throw new LLMProviderError(
        'AI assistance is unavailable: LLM_API_KEY is not configured'
      );
    }

    const timeoutMs = request.timeoutMs || 10000;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: 'You are an expert ACT test tutor. Extract the question from the image and provide a step-by-step explanation.' },
            {
              role: 'user',
              content: [
                { type: 'text', text: request.prompt },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${request.mimeType};base64,${request.imageBase64}`,
                  },
                },
              ],
            },
          ],
          max_tokens: request.maxTokens || 2000,
          temperature: request.temperature || 0.7,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new LLMProviderError(
            'API key is invalid or unauthorized',
            response.status
          );
        }
        throw new LLMProviderError(
          `LLM provider returned status ${response.status}: ${response.statusText}`,
          response.status
        );
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      };

      return {
        content: data.choices[0]?.message?.content || '',
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        } : undefined,
      };
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new LLMTimeoutError(timeoutMs);
      }
      if (error instanceof LLMProviderError || error instanceof LLMTimeoutError) {
        throw error;
      }
      throw new LLMProviderError(
        `LLM vision request failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
