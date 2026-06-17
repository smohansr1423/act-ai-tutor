import 'package:equatable/equatable.dart';
import 'enums.dart';

/// Model representing a parent-student link invitation.
class Invitation extends Equatable {
  final String linkId;
  final String parentId;
  final String? studentId;
  final String studentEmail;
  final LinkStatus status;
  final DateTime createdAt;

  const Invitation({
    required this.linkId,
    required this.parentId,
    this.studentId,
    required this.studentEmail,
    required this.status,
    required this.createdAt,
  });

  factory Invitation.fromJson(Map<String, dynamic> json) {
    return Invitation(
      linkId: json['link_id'] as String,
      parentId: json['parent_id'] as String,
      studentId: json['student_id'] as String?,
      studentEmail: json['student_email'] as String,
      status: LinkStatus.fromString(json['status'] as String),
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'link_id': linkId,
      'parent_id': parentId,
      'student_id': studentId,
      'student_email': studentEmail,
      'status': status.value,
      'created_at': createdAt.toIso8601String(),
    };
  }

  @override
  List<Object?> get props => [linkId, parentId, studentId, studentEmail, status];
}
