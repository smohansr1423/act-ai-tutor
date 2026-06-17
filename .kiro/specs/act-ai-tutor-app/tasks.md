# Implementation Plan: ACT AI Tutor App

## Overview

This plan implements the ACT AI Tutor App feature by feature, starting with shared data models and core backend services, then building out the Flutter client. The backend uses TypeScript with a REST API layer orchestrating the AI Engine subsystems. The Flutter client uses BLoC state management with offline-first caching. Each task builds incrementally, with property-based tests validating correctness properties from the design document.

## Tasks

- [x] 1. Set up project structure and core data models
  - [x] 1.1 Initialize backend project structure with TypeScript
    - Create directory structure: `backend/src/{services,models,middleware,utils,tests}`
    - Set up TypeScript project with `tsconfig.json`, ESLint, and Jest/Vitest for testing
    - Install dependencies: express, pg (PostgreSQL), redis, uuid, bcrypt, jsonwebtoken, fast-check
    - _Requirements: 10.1, 10.5_

  - [x] 1.2 Define database schema and data model interfaces
    - Create TypeScript interfaces for all data models: User, Question, Session, PerformanceRecord, WeaknessProfile, StudyPlan, ChatSession, ParentStudentLink
    - Create SQL migration files for all tables defined in the design (Users, Questions, Sessions, Performance_Records, Weakness_Profiles, Study_Plans, Chat_Sessions, Parent_Student_Links)
    - Define enums: Section, DifficultyLevel, SessionType, SessionStatus, Role, LinkStatus, ErrorClassification
    - _Requirements: 1.1, 2.9, 3.8, 5.1_

  - [x] 1.3 Set up database connection pool and Redis cache client
    - Configure PostgreSQL connection pool sized for 1000+ concurrent users
    - Configure Redis client for session state and chat context caching
    - Create database utility helpers for common CRUD operations
    - _Requirements: 10.5_

- [x] 2. Implement Authentication Service
  - [x] 2.1 Implement registration endpoint with input validation
    - Create validation function: name 1-100 chars, email format, password 8+ chars with uppercase, lowercase, and digit
    - Implement password hashing with bcrypt (unique salt per user)
    - Store user record in Users table on valid registration
    - Return error if email already exists
    - _Requirements: 1.1, 1.2, 1.7_

  - [x] 2.2 Write property tests for registration validation
    - **Property 1: Registration Input Validation**
    - **Validates: Requirements 1.1**

  - [x] 2.3 Write property tests for password hashing
    - **Property 4: Password Hashing Uniqueness**
    - **Validates: Requirements 1.7**

  - [x] 2.4 Implement login endpoint with lockout logic
    - Authenticate user credentials, return JWT token on success
    - Return generic "invalid credentials" error without revealing which field is wrong
    - Track consecutive failed attempts, lock account for 15 minutes after 5 failures
    - Reset failed attempt counter on successful login
    - _Requirements: 1.3, 1.4, 1.5_

  - [x] 2.5 Write property tests for login error opacity and lockout
    - **Property 2: Login Error Opacity**
    - **Property 3: Account Lockout Threshold**
    - **Validates: Requirements 1.4, 1.5**

  - [x] 2.6 Implement parent-student linking
    - Create endpoint to send link invitation by student email
    - Create endpoint for student to accept/reject invitation
    - Enforce access control: only accepted links grant data access
    - _Requirements: 1.6, 8.5_

- [x] 3. Checkpoint - Ensure all auth tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement Question Generation Service
  - [x] 4.1 Implement Question Generator with LLM integration
    - Create structured prompts for each section (English, Math, Reading, Science) following the format specified in requirements
    - Implement LLM API call with 8-second timeout
    - Validate LLM output structure: question_text, 4 options, correct_answer (A/B/C/D), explanation, incorrect_reasoning, skill_tag, difficulty, strategy_tip
    - Store generated questions in Question_Bank
    - Return error with retry/change-section option on timeout
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10_

  - [x] 4.2 Write property tests for question structure completeness
    - **Property 5: Question Structure Completeness**
    - **Validates: Requirements 2.1, 2.6**

  - [x] 4.3 Write property tests for skill tag section validity
    - **Property 6: Skill Tag Section Validity**
    - **Validates: Requirements 2.7**

  - [x] 4.4 Implement batch question retrieval endpoint
    - Create GET endpoint for retrieving questions by section and difficulty
    - Implement query to fetch from Question_Bank with filters
    - Ensure response time under 3 seconds for concurrent load
    - _Requirements: 10.5_

- [x] 5. Implement Session Service (Practice Mode)
  - [x] 5.1 Implement practice session start and question delivery
    - Create practice session start endpoint with section selection (English, Math, Reading, Science, Mixed)
    - For section mode: filter questions by selected section
    - For mixed mode: randomize questions across all sections
    - Deliver questions one at a time
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 5.2 Write property tests for practice mode section filtering
    - **Property 7: Practice Mode Section Filtering**
    - **Validates: Requirements 3.2**

  - [x] 5.3 Implement answer submission and performance recording
    - Record Performance_Record on each answer submission: user_id, question_id, is_correct, time_taken, timestamp
    - In practice mode: return correctness feedback, explanation for incorrect answers, strategy tip for correct answers
    - Persist to database within 3 seconds
    - _Requirements: 3.7, 3.8, 9.3, 9.4, 9.5, 10.1_

  - [x] 5.4 Write property tests for performance record completeness
    - **Property 8: Performance Record Completeness**
    - **Validates: Requirements 3.8**

  - [x] 5.5 Implement hint request endpoint
    - Integrate with Tutor_Chat to provide hints without revealing answers
    - Return hint within 5 seconds
    - _Requirements: 3.5, 3.6_

  - [x] 5.6 Implement practice session end with summary
    - End session, save all records, compute summary: total questions, number correct, average time
    - _Requirements: 3.9_

  - [x] 5.7 Write property tests for session summary accuracy
    - **Property 9: Session Summary Accuracy**
    - **Validates: Requirements 3.9**

- [x] 6. Implement Session Service (Full Test Mode)
  - [x] 6.1 Implement full test session start with section-specific configuration
    - English: 75 questions, 45-minute timer (2700s)
    - Math: 60 questions, 60-minute timer (3600s)
    - Reading: 40 questions, 35-minute timer (2100s)
    - Science: 40 questions, 35-minute timer (2100s)
    - Return all questions and time limit on session start
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 6.2 Implement full test progress saving and navigation support
    - Save answers in progress without revealing correctness
    - Support forward/backward navigation via save-progress endpoint
    - Track current question index and time remaining
    - _Requirements: 4.5, 4.8, 9.6, 9.7_

  - [x] 6.3 Write property test for no feedback during full test
    - **Property 27: No Feedback During Full Test**
    - **Validates: Requirements 9.6**

  - [x] 6.4 Implement timer expiry auto-submit and score summary
    - Auto-submit on timer expiry: submit answered questions, mark unanswered as skipped
    - Generate score summary: correct count, total count, per-question details with correct answer and explanation
    - Complete within 2 seconds of timer expiry
    - _Requirements: 4.6, 4.7_

  - [x] 6.5 Write property tests for timer expiry and score computation
    - **Property 10: Timer Expiry Auto-Submit**
    - **Property 11: Full Test Score Computation**
    - **Validates: Requirements 4.6, 4.7**

  - [x] 6.6 Implement session interruption, resume, and expiry
    - Preserve all answers on interruption (exit/connectivity loss)
    - Allow resume within 24 hours with restored answers, time remaining, and current index
    - Mark sessions as incomplete and discard if not resumed within 24 hours
    - _Requirements: 4.9, 4.10_

  - [x] 6.7 Write property test for interrupted session state preservation
    - **Property 12: Interrupted Session State Preservation**
    - **Validates: Requirements 4.9**

- [x] 7. Checkpoint - Ensure all session tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement Adaptive Learning Service
  - [x] 8.1 Implement Weakness Profile management
    - Maintain per-student per-skill_tag accuracy over most recent 20 attempts (sliding window)
    - Update profile on each answer submission
    - Store recent_attempts as JSONB array for recalculation
    - _Requirements: 5.1, 5.2_

  - [x] 8.2 Write property tests for weakness profile sliding window
    - **Property 13: Weakness Profile Sliding Window**
    - **Validates: Requirements 5.1, 5.2**

  - [x] 8.3 Implement error classification logic
    - Concept_Gap: incorrect + (accuracy <= 80% or < 5 attempts on skill_tag)
    - Careless_Mistake: incorrect + accuracy > 80% with 5+ attempts on skill_tag
    - Pacing_Issue: response time > 2× median for that difficulty level
    - Store classification in Performance_Record
    - _Requirements: 5.3_

  - [x] 8.4 Write property tests for error classification
    - **Property 14: Error Classification Logic**
    - **Validates: Requirements 5.3**

  - [x] 8.5 Implement adaptive difficulty selection
    - < 5 attempts → Medium difficulty
    - 5+ attempts, accuracy < 60% → Easy + concept explanation
    - 5+ attempts, accuracy 60-80% → Medium + 90-second time limit
    - 5+ attempts, accuracy > 80% → Hard + 60-second time limit
    - _Requirements: 5.4, 5.5, 5.6, 5.9_

  - [x] 8.6 Write property tests for adaptive difficulty selection
    - **Property 15: Adaptive Difficulty Selection**
    - **Validates: Requirements 5.4, 5.5, 5.6, 5.9**

  - [x] 8.7 Implement pacing drill generation
    - Generate 5-10 questions with progressively shorter time limits
    - Time limit formula: 120 - (i × 10) seconds for question i (0-indexed)
    - _Requirements: 5.7_

  - [x] 8.8 Write property tests for pacing drill time progression
    - **Property 16: Pacing Drill Time Progression**
    - **Validates: Requirements 5.7**

  - [x] 8.9 Implement Study Plan generation
    - Generate 3-10 daily practice targets per weak Skill_Tag (accuracy < 60%)
    - Include weekly goals with measurable accuracy thresholds
    - Include projected score range (lower and upper bound)
    - _Requirements: 5.8_

  - [x] 8.10 Write property tests for study plan structure
    - **Property 17: Study Plan Structure**
    - **Validates: Requirements 5.8**

- [x] 9. Implement AI Tutor Chat Service
  - [x] 9.1 Implement text message handling with context management
    - Accept text messages up to 1000 characters
    - Reject messages exceeding 1000 characters with error
    - Respond with step-by-step explanations using grade-appropriate vocabulary within 5 seconds
    - Maintain conversation context for up to 50 messages per session
    - Use motivational and encouraging language
    - Implement hint-first, then full-solution pattern
    - _Requirements: 6.1, 6.4, 6.5, 6.6, 6.7, 6.8_

  - [x] 9.2 Write property tests for message length validation
    - **Property 19: Message Length Validation**
    - **Validates: Requirements 6.8**

  - [x] 9.3 Write property tests for chat context window
    - **Property 18: Chat Context Window**
    - **Validates: Requirements 6.7**

  - [x] 9.4 Implement image upload and processing
    - Accept JPEG, PNG, GIF images up to 10 MB
    - Extract question content from image using LLM vision capabilities
    - Respond with explanation within 10 seconds
    - Return error with retry prompt if extraction fails
    - _Requirements: 6.2, 6.3_

- [x] 10. Implement Analytics Service
  - [x] 10.1 Implement student analytics dashboard endpoints
    - Compute score trend: accuracy per day per section over last 30 days
    - Compute weak skill tags: up to 10 skill_tags with accuracy < 60%, ranked lowest to highest
    - Compute average time per question by section (last 30 days)
    - Compute accuracy per section (last 30 days)
    - Update metrics within 10 seconds of session completion
    - Display insufficient data message for sections with < 5 records
    - Display "no weak areas" message if no skill_tags below 60%
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 10.2 Write property tests for analytics computations
    - **Property 20: Score Trend Computation**
    - **Property 21: Weak Skill Tag Ranking**
    - **Property 22: Average Time Per Section**
    - **Property 23: Accuracy Per Section**
    - **Property 24: Insufficient Data Threshold**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.6**

  - [x] 10.3 Implement parent dashboard endpoints
    - Display linked student's total time, sessions completed, overall accuracy
    - Display accuracy trend per section over 30 days
    - Display weak skill tags for linked student
    - Support multiple linked students with selection
    - Restrict to accepted link status only
    - Handle empty states: no linked students, no performance data
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

  - [x] 10.4 Write property tests for parent dashboard
    - **Property 25: Parent Dashboard Aggregation**
    - **Property 26: Parent Access Control**
    - **Validates: Requirements 8.1, 8.5**

- [x] 11. Checkpoint - Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Implement data synchronization and offline support
  - [x] 12.1 Implement sync conflict resolution logic
    - On connectivity restoration: sync cached local responses to server within 30 seconds
    - Conflict resolution: last-write-wins (most recent timestamp per question)
    - Retry sync up to 3 times at 10-second intervals on failure
    - Show sync pending indicator to student
    - _Requirements: 10.2, 10.3, 10.4_

  - [x] 12.2 Write property tests for sync conflict resolution
    - **Property 28: Sync Conflict Resolution**
    - **Validates: Requirements 10.3**

- [x] 13. Initialize Flutter mobile client
  - [x] 13.1 Set up Flutter project structure
    - Create Flutter project with directory structure: `lib/{blocs,models,screens,widgets,services,utils}`
    - Configure dependencies: flutter_bloc, http, sqflite/hive (local cache), image_picker, charts_flutter
    - Set up routing and navigation
    - Create shared model classes mirroring backend interfaces
    - _Requirements: 10.1_

  - [x] 13.2 Implement Auth BLoC and registration/login screens
    - Create AuthBloc with register, login, logout events
    - Build registration screen with client-side validation (name, email, password rules)
    - Build login screen with error display (generic message, lockout message)
    - Store JWT token securely on device
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 13.3 Implement parent-student linking UI
    - Build link invitation screen for parents
    - Build invitation acceptance screen for students
    - _Requirements: 1.6_

- [x] 14. Implement Practice Mode UI
  - [x] 14.1 Build practice session screens
    - Section selection screen: English, Math, Reading, Science, Mixed Mode
    - Question display: question text, 4 labeled choices (A, B, C, D), elapsed timer
    - Answer selection with visual highlight before submission
    - Submit button, Hint button (enabled), Explain button (disabled until submission)
    - Correct/incorrect feedback after submission with explanation display
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 14.2 Build practice session summary screen
    - End Session button
    - Summary: total questions, correct count, average time per question
    - _Requirements: 3.9_

- [x] 15. Implement Full Test Mode UI
  - [x] 15.1 Build full test session screens
    - Section selection with test parameters displayed
    - Countdown timer (MM:SS) updated every second
    - Question navigation: forward, backward, question number grid showing answered/unanswered
    - No correctness feedback during test
    - Submit button to end test early
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.8, 9.6, 9.7_

  - [x] 15.2 Build full test score summary and review screen
    - Score display: correct out of total
    - Per-question review: student's answer, correct answer, explanation
    - _Requirements: 4.7_

  - [x] 15.3 Implement session interruption and resume handling
    - Detect exit/connectivity loss, save progress locally
    - Resume screen listing interrupted sessions (within 24 hours)
    - _Requirements: 4.9, 4.10_

- [x] 16. Implement Tutor Chat UI
  - [x] 16.1 Build chat interface
    - Text input with 1000-character limit enforcement
    - Image upload button (JPEG, PNG, GIF, max 10 MB)
    - Chat message list with Student/AI messages
    - Loading indicators during AI response
    - Error messages for failed image processing
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

- [x] 17. Implement Analytics and Parent Dashboard UI
  - [x] 17.1 Build student analytics dashboard
    - Score trend chart (accuracy over 30 days per section)
    - Weak skills list (up to 10, ranked by accuracy)
    - Average time per question per section
    - Accuracy per section
    - Insufficient data and no-weak-areas messaging
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.6, 7.7_

  - [x] 17.2 Build parent dashboard
    - Linked student list with selection
    - Student progress summary: total time, sessions, overall accuracy
    - Accuracy trend chart per section
    - Weak skills list for selected student
    - Empty states for no linked students and no data
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

- [x] 18. Implement offline caching and sync in Flutter
  - [x] 18.1 Build local cache and sync service
    - Cache answer submissions locally using SQLite/Hive when offline
    - Detect connectivity restoration and sync within 30 seconds
    - Implement conflict resolution (most recent timestamp wins)
    - Retry sync 3 times at 10-second intervals on failure
    - Show sync pending indicator in UI
    - Sync all data (Performance_Records, Weakness_Profile, Study_Plan) on new device login within 10 seconds
    - _Requirements: 10.2, 10.3, 10.4_

- [x] 19. Integration wiring and end-to-end validation
  - [x] 19.1 Wire all backend services with API Gateway and middleware
    - Set up Express API router connecting all service endpoints
    - Add JWT authentication middleware on all protected routes
    - Add request validation middleware
    - Configure message queue for async performance record processing
    - Wire event pipeline: answer submission → Analytics + Adaptive service updates
    - _Requirements: 1.3, 10.1, 10.5_

  - [x] 19.2 Write integration tests for critical flows
    - Test registration → login → practice → analytics flow
    - Test full test start → answer → submit → score review
    - Test parent link → accept → parent dashboard
    - Test offline → online → sync
    - _Requirements: 1.1, 3.8, 4.7, 8.1, 10.3_

- [x] 20. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The backend uses TypeScript with fast-check for property-based testing
- The Flutter client uses Dart with BLoC pattern for state management
- All backend services are stateless to enable horizontal scaling

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "2.4", "2.6"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.5", "4.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "4.4", "5.1"] },
    { "id": 5, "tasks": ["5.2", "5.3", "5.5"] },
    { "id": 6, "tasks": ["5.4", "5.6", "6.1"] },
    { "id": 7, "tasks": ["5.7", "6.2", "6.4", "6.6"] },
    { "id": 8, "tasks": ["6.3", "6.5", "6.7", "8.1"] },
    { "id": 9, "tasks": ["8.2", "8.3", "8.5", "8.7", "8.9"] },
    { "id": 10, "tasks": ["8.4", "8.6", "8.8", "8.10", "9.1"] },
    { "id": 11, "tasks": ["9.2", "9.3", "9.4", "10.1"] },
    { "id": 12, "tasks": ["10.2", "10.3"] },
    { "id": 13, "tasks": ["10.4", "12.1"] },
    { "id": 14, "tasks": ["12.2", "13.1"] },
    { "id": 15, "tasks": ["13.2", "13.3"] },
    { "id": 16, "tasks": ["14.1", "14.2", "15.1"] },
    { "id": 17, "tasks": ["15.2", "15.3", "16.1"] },
    { "id": 18, "tasks": ["17.1", "17.2", "18.1"] },
    { "id": 19, "tasks": ["19.1"] },
    { "id": 20, "tasks": ["19.2"] }
  ]
}
```
