/**
 * Property-Based Tests for Chat Context Window
 * Feature: act-ai-tutor-app, Property 18: Chat Context Window
 *
 * **Validates: Requirements 6.7**
 *
 * For any chat session, the system SHALL retain all messages up to 50 messages.
 * For any chat session with more than 50 messages, only the most recent 50
 * SHALL be retained in context.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { enforceContextWindow, MAX_CHAT_MESSAGES } from '../../services/chat.service';

/**
 * Generator for a single chat message with role, content, and timestamp.
 */
const chatMessageArb = fc.record({
  role: fc.constantFrom('student', 'tutor'),
  content: fc.string({ minLength: 1, maxLength: 200 }),
  timestamp: fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') })
    .map((d) => d.toISOString()),
});

/**
 * Generator for a sequence of chat messages representing a session history.
 * Allows 0 to 120 messages to cover well beyond the 50-message limit.
 */
const messageSequenceArb = fc.array(chatMessageArb, { minLength: 0, maxLength: 120 });

describe('Property 18: Chat Context Window', () => {
  /**
   * Property: For any chat session, the context window SHALL retain at most 50 messages.
   */
  it('enforceContextWindow SHALL retain at most 50 messages for any input size', () => {
    fc.assert(
      fc.property(messageSequenceArb, (messages) => {
        const result = enforceContextWindow(messages);

        expect(result.length).toBeLessThanOrEqual(MAX_CHAT_MESSAGES);
      }),
      { numRuns: 200 }
    );
  });

  /**
   * Property: For any chat session with 50 or fewer messages, ALL messages SHALL be retained.
   */
  it('enforceContextWindow SHALL retain all messages when count is <= 50', () => {
    const smallSequenceArb = fc.array(chatMessageArb, { minLength: 0, maxLength: MAX_CHAT_MESSAGES });

    fc.assert(
      fc.property(smallSequenceArb, (messages) => {
        const result = enforceContextWindow(messages);

        expect(result.length).toBe(messages.length);
        // All original messages are preserved
        for (let i = 0; i < messages.length; i++) {
          expect(result[i]).toEqual(messages[i]);
        }
      }),
      { numRuns: 200 }
    );
  });

  /**
   * Property: For any chat session with more than 50 messages, only the most recent 50
   * SHALL be retained in context.
   */
  it('enforceContextWindow SHALL retain only the most recent 50 messages when count > 50', () => {
    const largeSequenceArb = fc.array(chatMessageArb, { minLength: MAX_CHAT_MESSAGES + 1, maxLength: 120 });

    fc.assert(
      fc.property(largeSequenceArb, (messages) => {
        const result = enforceContextWindow(messages);

        // Exactly 50 messages retained
        expect(result.length).toBe(MAX_CHAT_MESSAGES);

        // The retained messages are the last 50 from the original
        const expectedSlice = messages.slice(-MAX_CHAT_MESSAGES);
        expect(result).toEqual(expectedSlice);
      }),
      { numRuns: 200 }
    );
  });

  /**
   * Property: The most recent message SHALL always be preserved in the context window,
   * regardless of total message count.
   */
  it('the most recent message SHALL always be present in the context window', () => {
    const nonEmptySequenceArb = fc.array(chatMessageArb, { minLength: 1, maxLength: 120 });

    fc.assert(
      fc.property(nonEmptySequenceArb, (messages) => {
        const result = enforceContextWindow(messages);

        // The last message in the original must be the last in the result
        expect(result[result.length - 1]).toEqual(messages[messages.length - 1]);
      }),
      { numRuns: 200 }
    );
  });

  /**
   * Property: Messages older than the 50 most recent SHALL NOT be present in the context.
   */
  it('messages older than the 50 most recent SHALL NOT be in the retained context', () => {
    const largeSequenceArb = fc.array(chatMessageArb, { minLength: MAX_CHAT_MESSAGES + 1, maxLength: 120 });

    fc.assert(
      fc.property(largeSequenceArb, (messages) => {
        const result = enforceContextWindow(messages);

        // Messages that were dropped (older than most recent 50) should not be in result
        const droppedMessages = messages.slice(0, messages.length - MAX_CHAT_MESSAGES);
        for (const dropped of droppedMessages) {
          // Use deep equality check - the dropped message should not appear in retained set
          const found = result.some(
            (m) => m.role === dropped.role && m.content === dropped.content && m.timestamp === dropped.timestamp
          );
          // Note: it's possible for a generated message to have same content/timestamp,
          // so we check by reference position instead
          expect(result[0]).not.toBe(droppedMessages[0]);
        }

        // Verify result matches the expected slice
        const expectedSlice = messages.slice(-MAX_CHAT_MESSAGES);
        expect(result).toEqual(expectedSlice);
      }),
      { numRuns: 200 }
    );
  });

  /**
   * Property: Incrementally adding messages one at a time and enforcing the window
   * SHALL produce the same result as enforcing once on the full sequence.
   */
  it('incremental enforcement SHALL produce same result as batch enforcement', () => {
    fc.assert(
      fc.property(
        fc.array(chatMessageArb, { minLength: 1, maxLength: 80 }),
        (messages) => {
          // Simulate incremental: add messages one by one and enforce after each
          let incremental: typeof messages = [];
          for (const msg of messages) {
            incremental.push(msg);
            incremental = enforceContextWindow(incremental);
          }

          // Batch: enforce once on the full sequence
          const batch = enforceContextWindow(messages);

          // Both should produce the same final result
          expect(incremental).toEqual(batch);
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * Property: The order of retained messages SHALL be preserved (no reordering).
   */
  it('enforceContextWindow SHALL preserve message ordering', () => {
    fc.assert(
      fc.property(messageSequenceArb, (messages) => {
        const result = enforceContextWindow(messages);

        // All elements in result should appear in the same relative order as in messages
        if (result.length > 1) {
          const startIdx = messages.length - result.length;
          for (let i = 0; i < result.length; i++) {
            expect(result[i]).toEqual(messages[startIdx + i]);
          }
        }
      }),
      { numRuns: 200 }
    );
  });
});
