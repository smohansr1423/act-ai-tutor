/**
 * Request Validation Middleware
 * Validates incoming request bodies against defined schemas.
 *
 * Provides a generic validation middleware factory that checks:
 * - Required fields are present
 * - Field types match expected types
 * - String fields meet length constraints
 * - Enum fields contain valid values
 *
 * Requirements: 10.1
 */

import { Request, Response, NextFunction } from 'express';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Supported field types for validation */
type FieldType = 'string' | 'number' | 'boolean' | 'array' | 'object';

/** Schema definition for a single field */
export interface FieldSchema {
  type: FieldType;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  enum?: string[];
  /** Custom validator function returning an error message or null */
  validate?: (value: any) => string | null;
}

/** Full request body validation schema */
export interface ValidationSchema {
  [field: string]: FieldSchema;
}

/** Validation error response */
export interface ValidationError {
  field: string;
  message: string;
}

// ─── Validation Logic ─────────────────────────────────────────────────────────

/**
 * Validates a single field value against its schema definition.
 * Returns an error message if invalid, or null if valid.
 */
export function validateField(field: string, value: any, schema: FieldSchema): string | null {
  // Check required
  if (schema.required && (value === undefined || value === null || value === '')) {
    return `${field} is required`;
  }

  // If not required and not provided, skip further validation
  if (value === undefined || value === null) {
    return null;
  }

  // Type check
  if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      return `${field} must be an array`;
    }
  } else if (typeof value !== schema.type) {
    return `${field} must be of type ${schema.type}`;
  }

  // String-specific validations
  if (schema.type === 'string' && typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      return `${field} must be at least ${schema.minLength} characters`;
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      return `${field} must be at most ${schema.maxLength} characters`;
    }
    if (schema.enum && !schema.enum.includes(value)) {
      return `${field} must be one of: ${schema.enum.join(', ')}`;
    }
  }

  // Number-specific validations
  if (schema.type === 'number' && typeof value === 'number') {
    if (schema.min !== undefined && value < schema.min) {
      return `${field} must be at least ${schema.min}`;
    }
    if (schema.max !== undefined && value > schema.max) {
      return `${field} must be at most ${schema.max}`;
    }
  }

  // Custom validation
  if (schema.validate) {
    return schema.validate(value);
  }

  return null;
}

/**
 * Validates an entire request body against a schema.
 * Returns an array of validation errors (empty if all valid).
 */
export function validateBody(body: Record<string, any>, schema: ValidationSchema): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const [field, fieldSchema] of Object.entries(schema)) {
    const error = validateField(field, body[field], fieldSchema);
    if (error) {
      errors.push({ field, message: error });
    }
  }

  return errors;
}

// ─── Middleware Factory ───────────────────────────────────────────────────────

/**
 * Creates an Express middleware that validates the request body against the given schema.
 * Returns 400 with validation errors if the body is invalid.
 *
 * Usage:
 *   router.post('/endpoint', validateRequest(schema), handler);
 */
export function validateRequest(schema: ValidationSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors = validateBody(req.body || {}, schema);

    if (errors.length > 0) {
      res.status(400).json({
        error: 'Validation failed',
        details: errors,
      });
      return;
    }

    next();
  };
}

// ─── Common Schemas ───────────────────────────────────────────────────────────

/** Schema for UUID field validation */
function uuidField(required = true): FieldSchema {
  return {
    type: 'string',
    required,
    minLength: 36,
    maxLength: 36,
    validate: (value: string) => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return uuidRegex.test(value) ? null : 'must be a valid UUID';
    },
  };
}

/** Reusable schema for practice session start */
export const practiceStartSchema: ValidationSchema = {
  userId: uuidField(),
  section: {
    type: 'string',
    required: true,
    enum: ['english', 'math', 'reading', 'science', 'mixed'],
  },
  mode: {
    type: 'string',
    required: true,
    enum: ['section', 'mixed'],
  },
};

/** Reusable schema for answer submission */
export const answerSubmitSchema: ValidationSchema = {
  sessionId: uuidField(),
  questionId: uuidField(),
  selectedAnswer: {
    type: 'string',
    required: true,
    enum: ['A', 'B', 'C', 'D'],
  },
  timeTaken: {
    type: 'number',
    required: true,
    min: 0.001,
  },
};

/** Reusable schema for full test start */
export const fullTestStartSchema: ValidationSchema = {
  userId: uuidField(),
  section: {
    type: 'string',
    required: true,
    enum: ['english', 'math', 'reading', 'science'],
  },
};

/** Reusable schema for full test submit */
export const fullTestSubmitSchema: ValidationSchema = {
  sessionId: uuidField(),
  answers: {
    type: 'array',
    required: true,
  },
};

/** Reusable schema for chat message */
export const chatMessageSchema: ValidationSchema = {
  userId: uuidField(),
  sessionId: uuidField(),
  text: {
    type: 'string',
    required: true,
    minLength: 1,
    maxLength: 1000,
  },
};

/** Reusable schema for chat image upload */
export const chatImageSchema: ValidationSchema = {
  userId: uuidField(),
  sessionId: uuidField(),
  image: {
    type: 'string',
    required: true,
    minLength: 1,
  },
  mimeType: {
    type: 'string',
    required: true,
    enum: ['image/jpeg', 'image/png', 'image/gif'],
  },
};

/** Reusable schema for study plan generation */
export const studyPlanSchema: ValidationSchema = {
  userId: uuidField(),
};

/** Reusable schema for pacing drill */
export const pacingDrillSchema: ValidationSchema = {
  userId: uuidField(),
  skillTag: {
    type: 'string',
    required: true,
    minLength: 1,
  },
};
