-- Migration 001: Create all tables for ACT AI Tutor App
-- Requirements: 1.1, 2.9, 3.8, 5.1

-- Create custom enum types
CREATE TYPE user_role AS ENUM ('student', 'parent');
CREATE TYPE section_type AS ENUM ('english', 'math', 'reading', 'science');
CREATE TYPE session_section_type AS ENUM ('english', 'math', 'reading', 'science', 'mixed');
CREATE TYPE difficulty_level AS ENUM ('easy', 'medium', 'hard');
CREATE TYPE session_type AS ENUM ('practice', 'full_test');
CREATE TYPE session_status AS ENUM ('active', 'completed', 'interrupted', 'expired');
CREATE TYPE link_status AS ENUM ('pending', 'accepted', 'rejected');
CREATE TYPE error_classification AS ENUM ('concept_gap', 'careless_mistake', 'pacing_issue');

-- Users table
CREATE TABLE users (
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

CREATE INDEX idx_users_email ON users(email);

-- Parent-Student Links table
CREATE TABLE parent_student_links (
    link_id UUID PRIMARY KEY,
    parent_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    student_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
    student_email VARCHAR(255) NOT NULL,
    status link_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_parent_student_links_parent ON parent_student_links(parent_id);
CREATE INDEX idx_parent_student_links_student ON parent_student_links(student_id);
CREATE INDEX idx_parent_student_links_email ON parent_student_links(student_email);

-- Questions table (Question Bank)
CREATE TABLE questions (
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

CREATE INDEX idx_questions_section ON questions(section);
CREATE INDEX idx_questions_difficulty ON questions(difficulty);
CREATE INDEX idx_questions_skill_tag ON questions(skill_tag);
CREATE INDEX idx_questions_section_difficulty ON questions(section, difficulty);

-- Sessions table
CREATE TABLE sessions (
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

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_user_status ON sessions(user_id, status);

-- Performance Records table
CREATE TABLE performance_records (
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

CREATE INDEX idx_performance_records_user ON performance_records(user_id);
CREATE INDEX idx_performance_records_session ON performance_records(session_id);
CREATE INDEX idx_performance_records_user_timestamp ON performance_records(user_id, timestamp);

-- Weakness Profiles table
CREATE TABLE weakness_profiles (
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

CREATE INDEX idx_weakness_profiles_user ON weakness_profiles(user_id);
CREATE INDEX idx_weakness_profiles_user_accuracy ON weakness_profiles(user_id, accuracy);

-- Study Plans table
CREATE TABLE study_plans (
    plan_id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    daily_targets JSONB NOT NULL,
    weekly_goals JSONB NOT NULL,
    projected_score_range JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMP NOT NULL
);

CREATE INDEX idx_study_plans_user ON study_plans(user_id);

-- Chat Sessions table
CREATE TABLE chat_sessions (
    chat_session_id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_sessions_user ON chat_sessions(user_id);
