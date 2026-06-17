/**
 * Event Pipeline Module
 * Implements the async event-driven architecture for performance record processing.
 *
 * Event flow:
 *   Answer Submission → MessageQueue → [Analytics Update, Adaptive Service Update]
 *
 * The message queue decouples answer processing from the synchronous request path,
 * ensuring sub-3-second response times while keeping analytics and adaptive profiles current.
 *
 * Requirements: 1.3, 10.1, 10.5
 */

export { EventBus, eventBus } from './event-bus';
export { MessageQueue, messageQueue } from './message-queue';
export { registerEventHandlers } from './handlers';
export {
  AnswerSubmittedEvent,
  SessionCompletedEvent,
  AppEvent,
  EventType,
} from './types';
