/**
 * Enums for the ACT AI Tutor App data models.
 */

/** ACT test sections */
export enum Section {
  English = 'english',
  Math = 'math',
  Reading = 'reading',
  Science = 'science',
}

/** Extended section enum that includes 'mixed' for practice mode */
export enum SessionSection {
  English = 'english',
  Math = 'math',
  Reading = 'reading',
  Science = 'science',
  Mixed = 'mixed',
}

/** Question difficulty levels */
export enum DifficultyLevel {
  Easy = 'easy',
  Medium = 'medium',
  Hard = 'hard',
}

/** Types of study sessions */
export enum SessionType {
  Practice = 'practice',
  FullTest = 'full_test',
}

/** Status of a study session */
export enum SessionStatus {
  Active = 'active',
  Completed = 'completed',
  Interrupted = 'interrupted',
  Expired = 'expired',
}

/** User roles */
export enum Role {
  Student = 'student',
  Parent = 'parent',
}

/** Status of a parent-student link invitation */
export enum LinkStatus {
  Pending = 'pending',
  Accepted = 'accepted',
  Rejected = 'rejected',
}

/** Classification of errors in student performance */
export enum ErrorClassification {
  ConceptGap = 'concept_gap',
  CarelessMistake = 'careless_mistake',
  PacingIssue = 'pacing_issue',
}
