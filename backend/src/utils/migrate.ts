/**
 * Auto-migration utility.
 * Checks if required tables exist and runs the migration SQL if they don't.
 * Safe to call on every server startup — idempotent.
 */

import { getPool } from './database';

/**
 * SQL to create all tables. Uses IF NOT EXISTS to be idempotent.
 */
const MIGRATION_SQL = `
-- Create custom enum types (ignore if they already exist)
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('student', 'parent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE section_type AS ENUM ('english', 'math', 'reading', 'science');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE session_section_type AS ENUM ('english', 'math', 'reading', 'science', 'mixed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE difficulty_level AS ENUM ('easy', 'medium', 'hard');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE session_type AS ENUM ('practice', 'full_test');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE session_status AS ENUM ('active', 'completed', 'interrupted', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE link_status AS ENUM ('pending', 'accepted', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE error_classification AS ENUM ('concept_gap', 'careless_mistake', 'pacing_issue');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    user_id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL CHECK (char_length(name) >= 1),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    password_salt VARCHAR(64) NOT NULL,
    role user_role NOT NULL,
    grade INTEGER NULL,
    target_score INTEGER NULL,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Parent-Student Links table
CREATE TABLE IF NOT EXISTS parent_student_links (
    link_id UUID PRIMARY KEY,
    parent_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    student_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
    student_email VARCHAR(255) NOT NULL,
    status link_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parent_student_links_parent ON parent_student_links(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_student_links_student ON parent_student_links(student_id);
CREATE INDEX IF NOT EXISTS idx_parent_student_links_email ON parent_student_links(student_email);

-- Questions table (Question Bank)
CREATE TABLE IF NOT EXISTS questions (
    question_id UUID PRIMARY KEY,
    section section_type NOT NULL,
    question_text TEXT NOT NULL,
    passage TEXT NULL,
    options JSONB NOT NULL,
    correct_answer CHAR(1) NOT NULL CHECK (correct_answer IN ('A', 'B', 'C', 'D')),
    explanation TEXT NOT NULL,
    incorrect_reasoning JSONB NOT NULL,
    skill_tag VARCHAR(100) NOT NULL,
    difficulty difficulty_level NOT NULL,
    strategy_tip TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_questions_section ON questions(section);
CREATE INDEX IF NOT EXISTS idx_questions_difficulty ON questions(difficulty);
CREATE INDEX IF NOT EXISTS idx_questions_skill_tag ON questions(skill_tag);
CREATE INDEX IF NOT EXISTS idx_questions_section_difficulty ON questions(section, difficulty);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
    session_id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    session_type session_type NOT NULL,
    section session_section_type NOT NULL,
    status session_status NOT NULL DEFAULT 'active',
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP NULL,
    time_limit_seconds INTEGER NULL,
    time_remaining_seconds INTEGER NULL,
    expires_at TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_status ON sessions(user_id, status);

-- Performance Records table
CREATE TABLE IF NOT EXISTS performance_records (
    record_id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
    selected_answer CHAR(1) NULL CHECK (selected_answer IS NULL OR selected_answer IN ('A', 'B', 'C', 'D')),
    is_correct BOOLEAN NOT NULL,
    time_taken_seconds REAL NOT NULL CHECK (time_taken_seconds > 0),
    error_classification error_classification NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_performance_records_user ON performance_records(user_id);
CREATE INDEX IF NOT EXISTS idx_performance_records_session ON performance_records(session_id);
CREATE INDEX IF NOT EXISTS idx_performance_records_user_timestamp ON performance_records(user_id, timestamp);

-- Weakness Profiles table
CREATE TABLE IF NOT EXISTS weakness_profiles (
    profile_id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    skill_tag VARCHAR(100) NOT NULL,
    section section_type NOT NULL,
    accuracy REAL NOT NULL CHECK (accuracy >= 0.0 AND accuracy <= 1.0),
    attempt_count INTEGER NOT NULL CHECK (attempt_count >= 0),
    recent_attempts JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, skill_tag)
);

CREATE INDEX IF NOT EXISTS idx_weakness_profiles_user ON weakness_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_weakness_profiles_user_accuracy ON weakness_profiles(user_id, accuracy);

-- Study Plans table
CREATE TABLE IF NOT EXISTS study_plans (
    plan_id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    daily_targets JSONB NOT NULL,
    weekly_goals JSONB NOT NULL,
    projected_score_range JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_study_plans_user ON study_plans(user_id);

-- Chat Sessions table
CREATE TABLE IF NOT EXISTS chat_sessions (
    chat_session_id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id);
`;

/**
 * Run auto-migration: creates tables if they don't exist.
 * Returns true if migration ran, false if tables already existed.
 */
export async function runMigration(): Promise<boolean> {
  const pool = getPool();

  try {
    // Check if tables already exist
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'users'
      ) as exists
    `);

    const tablesExist = result.rows[0]?.exists === true;

    if (tablesExist) {
      console.log('[Migration] Tables already exist, skipping migration.');
      return false;
    }

    console.log('[Migration] Tables not found, running migration...');
    await pool.query(MIGRATION_SQL);
    console.log('[Migration] Migration completed successfully.');
    return true;
  } catch (error: any) {
    console.error('[Migration] Migration failed:', error.message);
    throw error;
  }
}
