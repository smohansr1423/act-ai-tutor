/// Enums for the ACT AI Tutor App data models.
/// Mirrors backend enums in backend/src/models/enums.ts

/// ACT test sections
enum Section {
  english('english'),
  math('math'),
  reading('reading'),
  science('science');

  const Section(this.value);
  final String value;

  static Section fromString(String value) {
    return Section.values.firstWhere(
      (e) => e.value == value,
      orElse: () => throw ArgumentError('Invalid Section: $value'),
    );
  }
}

/// Extended section enum that includes 'mixed' for practice mode
enum SessionSection {
  english('english'),
  math('math'),
  reading('reading'),
  science('science'),
  mixed('mixed');

  const SessionSection(this.value);
  final String value;

  static SessionSection fromString(String value) {
    return SessionSection.values.firstWhere(
      (e) => e.value == value,
      orElse: () => throw ArgumentError('Invalid SessionSection: $value'),
    );
  }
}

/// Question difficulty levels
enum DifficultyLevel {
  easy('easy'),
  medium('medium'),
  hard('hard');

  const DifficultyLevel(this.value);
  final String value;

  static DifficultyLevel fromString(String value) {
    return DifficultyLevel.values.firstWhere(
      (e) => e.value == value,
      orElse: () => throw ArgumentError('Invalid DifficultyLevel: $value'),
    );
  }
}

/// Types of study sessions
enum SessionType {
  practice('practice'),
  fullTest('full_test');

  const SessionType(this.value);
  final String value;

  static SessionType fromString(String value) {
    return SessionType.values.firstWhere(
      (e) => e.value == value,
      orElse: () => throw ArgumentError('Invalid SessionType: $value'),
    );
  }
}

/// Status of a study session
enum SessionStatus {
  active('active'),
  completed('completed'),
  interrupted('interrupted'),
  expired('expired');

  const SessionStatus(this.value);
  final String value;

  static SessionStatus fromString(String value) {
    return SessionStatus.values.firstWhere(
      (e) => e.value == value,
      orElse: () => throw ArgumentError('Invalid SessionStatus: $value'),
    );
  }
}

/// User roles
enum Role {
  student('student'),
  parent('parent');

  const Role(this.value);
  final String value;

  static Role fromString(String value) {
    return Role.values.firstWhere(
      (e) => e.value == value,
      orElse: () => throw ArgumentError('Invalid Role: $value'),
    );
  }
}

/// Status of a parent-student link invitation
enum LinkStatus {
  pending('pending'),
  accepted('accepted'),
  rejected('rejected');

  const LinkStatus(this.value);
  final String value;

  static LinkStatus fromString(String value) {
    return LinkStatus.values.firstWhere(
      (e) => e.value == value,
      orElse: () => throw ArgumentError('Invalid LinkStatus: $value'),
    );
  }
}

/// Classification of errors in student performance
enum ErrorClassification {
  conceptGap('concept_gap'),
  carelessMistake('careless_mistake'),
  pacingIssue('pacing_issue');

  const ErrorClassification(this.value);
  final String value;

  static ErrorClassification fromString(String value) {
    return ErrorClassification.values.firstWhere(
      (e) => e.value == value,
      orElse: () => throw ArgumentError('Invalid ErrorClassification: $value'),
    );
  }
}
