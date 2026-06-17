/**
 * Property-Based Tests for Message Length Validation
 * Feature: act-ai-tutor-app, Property 19: Message Length Validation
 *
 * For any text message with length exceeding 1000 characters, the Tutor_Chat
 * SHALL reject the message. For any text message with length between 1 and 1000
 * characters, the Tutor_Chat SHALL accept and process the message.
 *
 * **Validates: Requirements 6.8**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  validateField,
  validateBody,
  chatMessageSchema,
  FieldSchema,
} from '../../middleware/validation.middleware';

// ============================================================================
// Generators
// ============================================================================

/**
 * Generates valid text messages: strings with length between 1 and 1000 characters.
 * Uses printable ASCII characters to simulate realistic user input.
 */
const validMessageArb = fc.stringOf(
  fc.char(),
  { minLength: 1, maxLength: 1000 }
).filter((s) => s.length >= 1 && s.length <= 1000);

/**
 * Generates messages that exceed the 1000-character limit.
 * Creates strings with length from 1001 to 2000 characters.
 */
const tooLongMessageArb = fc.stringOf(
  fc.char(),
  { minLength: 1001, maxLength: 2000 }
).filter((s) => s.length > 1000);

/**
 * Generates empty messages (invalid - minimum 1 character required).
 */
const emptyMessageArb = fc.constant('');

/**
 * Valid UUID generator for userId and sessionId fields.
 */
const validUuidArb = fc
  .tuple(
    fc.hexaString({ minLength: 8, maxLength: 8 }),
    fc.hexaString({ minLength: 4, maxLength: 4 }),
    fc.hexaString({ minLength: 4, maxLength: 4 }),
    fc.hexaString({ minLength: 4, maxLength: 4 }),
    fc.hexaString({ minLength: 12, maxLength: 12 })
  )
  .map(([a, b, c, d, e]) => `${a}-${b}-${c}-${d}-${e}`);

// ============================================================================
// Property Tests
// ============================================================================

describe('Feature: act-ai-tutor-app, Property 19: Message Length Validation', () => {
  /**
   * **Validates: Requirements 6.8**
   *
   * For any text message with length between 1 and 1000 characters,
   * the Tutor_Chat SHALL accept and process the message (no validation errors on text field).
   */
  it('SHALL accept any text message with length between 1 and 1000 characters', () => {
    fc.assert(
      fc.property(
        validMessageArb,
        (text) => {
          const textSchema: FieldSchema = chatMessageSchema.text;
          const error = validateField('text', text, textSchema);
          expect(error).toBeNull();
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 6.8**
   *
   * For any text message exceeding 1000 characters,
   * the Tutor_Chat SHALL reject the message with a validation error.
   */
  it('SHALL reject any text message exceeding 1000 characters', () => {
    fc.assert(
      fc.property(
        tooLongMessageArb,
        (text) => {
          const textSchema: FieldSchema = chatMessageSchema.text;
          const error = validateField('text', text, textSchema);
          expect(error).not.toBeNull();
          expect(error).toContain('1000');
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 6.8**
   *
   * For empty messages (length 0), the validation SHALL reject the message
   * since messages must have at least 1 character.
   */
  it('SHALL reject empty messages (length 0)', () => {
    fc.assert(
      fc.property(
        emptyMessageArb,
        (text) => {
          const textSchema: FieldSchema = chatMessageSchema.text;
          const error = validateField('text', text, textSchema);
          expect(error).not.toBeNull();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * **Validates: Requirements 6.8**
   *
   * Boundary property: a message of exactly 1000 characters SHALL be accepted,
   * and a message of exactly 1001 characters SHALL be rejected.
   */
  it('SHALL accept exactly 1000 characters and reject exactly 1001 characters', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('a', 'b', 'c', 'x', 'y', 'z', '1', '2', '3'),
        (char) => {
          const textSchema: FieldSchema = chatMessageSchema.text;

          // Exactly 1000 characters → accepted
          const msg1000 = char.repeat(1000);
          const errorAt1000 = validateField('text', msg1000, textSchema);
          expect(errorAt1000).toBeNull();

          // Exactly 1001 characters → rejected
          const msg1001 = char.repeat(1001);
          const errorAt1001 = validateField('text', msg1001, textSchema);
          expect(errorAt1001).not.toBeNull();
          expect(errorAt1001).toContain('1000');
        }
      ),
      { numRuns: 9 }
    );
  });

  /**
   * **Validates: Requirements 6.8**
   *
   * Full body validation: a complete chat message request with valid userId, sessionId,
   * and text within 1000 characters SHALL pass validation with no errors.
   */
  it('SHALL pass full body validation when all fields are valid and text <= 1000 chars', () => {
    fc.assert(
      fc.property(
        validUuidArb,
        validUuidArb,
        validMessageArb,
        (userId, sessionId, text) => {
          const body = { userId, sessionId, text };
          const errors = validateBody(body, chatMessageSchema);
          expect(errors).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 6.8**
   *
   * Full body validation: a complete chat message request with text exceeding 1000
   * characters SHALL fail validation with an error on the text field.
   */
  it('SHALL fail full body validation when text exceeds 1000 characters', () => {
    fc.assert(
      fc.property(
        validUuidArb,
        validUuidArb,
        tooLongMessageArb,
        (userId, sessionId, text) => {
          const body = { userId, sessionId, text };
          const errors = validateBody(body, chatMessageSchema);
          expect(errors.length).toBeGreaterThan(0);
          expect(errors.some((e) => e.field === 'text')).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
