/**
 * Event Handlers - Pipeline Wiring
 * Connects answer submission events to Analytics and Adaptive service updates.
 *
 * Event Pipeline:
 *   answer_submitted → Adaptive Service (weakness profile + error classification)
 *                    → Analytics Service (dashboard metric refresh)
 *
 *   session_completed → Analytics Service (session summary update)
 *
 * Requirements: 5.1, 5.2, 5.3, 7.5, 10.1
 *
 * NOTE: This module re-exports from handlers.ts for backward compatibility.
 * The primary implementation lives in handlers.ts.
 */

export { registerEventHandlers } from './handlers';
