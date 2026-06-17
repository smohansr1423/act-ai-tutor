/**
 * TypeScript interfaces for all ACT AI Tutor App data models.
 */

import {
  Section,
  SessionSection,
  DifficultyLevel,
  SessionType,
  SessionStatus,
  Role,
  LinkStatus,
  ErrorClassification,
} from './enums';

/** User account record */
export interface User {
  user_id: string;
  name: string;
  email: string;
  password_hash: string;
  password_salt: string;
  role: Role;
  grade: number | null;
  target_score: number | null;
  failed_login_attempts: number;
  locked_until: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** A generated or curated ACT-style question */
export interface Question {
  question_id: string;
  section: Section;
  question_text: string;
  passage: string | null;
  options: string[];
  correct_answer: string;
  explanation: string;
  incorrect_reasoning: Record<string, string>;
  skill_tag: string;
  difficulty: DifficultyLevel;
  strategy_tip: string;
  created_at: Date;
}

/** A practice or full test session */
export interface Session {
  session_id: string;
  user_id: string;
  session_type: SessionType;
  section: SessionSection;
  status: SessionStatus;
  started_at: Date;
  completed_at: Date | null;
  time_limit_seconds: number | null;
  time_remaining_seconds: number | null;
  expires_at: Date | null;
}

/** A record of a student's response to a single question */
export interface PerformanceRecord {
  record_id: string;
  user_id: string;
  session_id: string;
  question_id: string;
  selected_answer: string | null;
  is_correct: boolean;
  time_taken_seconds: number;
  error_classification: ErrorClassification | null;
  timestamp: Date;
}

/** Aggregated weakness data per skill tag for a student */
export interface WeaknessProfile {
  profile_id: string;
  user_id: string;
  skill_tag: string;
  section: Section;
  accuracy: number;
  attempt_count: number;
  recent_attempts: RecentAttempt[];
  updated_at: Date;
}

/** A single attempt entry within the recent_attempts array */
export interface RecentAttempt {
  is_correct: boolean;
  timestamp: string;
}

/** A personalized study plan for a student */
export interface StudyPlan {
  plan_id: string;
  user_id: string;
  daily_targets: DailyTarget[];
  weekly_goals: WeeklyGoal[];
  projected_score_range: ScoreRange;
  created_at: Date;
  valid_until: Date;
}

/** Daily practice target within a study plan */
export interface DailyTarget {
  skill_tag: string;
  section: Section;
  question_count: number;
}

/** Weekly goal within a study plan */
export interface WeeklyGoal {
  skill_tag: string;
  target_accuracy: number;
}

/** Projected score range */
export interface ScoreRange {
  lower: number;
  upper: number;
}

/** A chat session between student and AI tutor */
export interface ChatSession {
  chat_session_id: string;
  user_id: string;
  messages: ChatMessage[];
  created_at: Date;
  updated_at: Date;
}

/** A single message within a chat session */
export interface ChatMessage {
  role: 'student' | 'tutor';
  content: string;
  timestamp: string;
}

/** A link between a parent and student account */
export interface ParentStudentLink {
  link_id: string;
  parent_id: string;
  student_id: string | null;
  student_email: string;
  status: LinkStatus;
  created_at: Date;
}
