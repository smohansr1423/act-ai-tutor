import 'package:equatable/equatable.dart';
import 'enums.dart';

/// User account model matching backend User interface.
class User extends Equatable {
  final String userId;
  final String name;
  final String email;
  final Role role;
  final int? grade;
  final int? targetScore;
  final DateTime createdAt;
  final DateTime updatedAt;

  const User({
    required this.userId,
    required this.name,
    required this.email,
    required this.role,
    this.grade,
    this.targetScore,
    required this.createdAt,
    required this.updatedAt,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      userId: json['user_id'] as String,
      name: json['name'] as String,
      email: json['email'] as String,
      role: Role.fromString(json['role'] as String),
      grade: json['grade'] as int?,
      targetScore: json['target_score'] as int?,
      createdAt: DateTime.parse(json['created_at'] as String),
      updatedAt: DateTime.parse(json['updated_at'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'user_id': userId,
      'name': name,
      'email': email,
      'role': role.value,
      'grade': grade,
      'target_score': targetScore,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  @override
  List<Object?> get props => [userId, name, email, role, grade, targetScore];
}
