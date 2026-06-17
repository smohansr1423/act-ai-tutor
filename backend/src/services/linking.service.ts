/**
 * Parent-Student Linking Service
 *
 * Handles link invitations from parents to students and
 * enforces access control: only accepted links grant data access.
 *
 * Requirements: 1.6, 8.5
 */

import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryMany, insertOne, updateMany } from '../utils/database';
import { LinkStatus, Role } from '../models/enums';
import { ParentStudentLink, User } from '../models/interfaces';

/** Error thrown when a linking operation is invalid */
export class LinkingError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'LinkingError';
  }
}

/**
 * Send a link invitation from a parent to a student by email.
 *
 * Validates:
 * - The parent exists and has the 'parent' role
 * - The student email is provided
 * - No duplicate pending invitation exists for the same parent + student_email
 *
 * @param parentId - UUID of the parent user
 * @param studentEmail - Email address of the student to invite
 * @returns The created ParentStudentLink record
 */
export async function sendLinkInvitation(
  parentId: string,
  studentEmail: string
): Promise<ParentStudentLink> {
  if (!parentId) {
    throw new LinkingError('Parent ID is required', 'MISSING_PARENT_ID');
  }

  if (!studentEmail || studentEmail.trim() === '') {
    throw new LinkingError('Student email is required', 'MISSING_STUDENT_EMAIL');
  }

  const trimmedEmail = studentEmail.trim().toLowerCase();

  // Verify the parent exists and has the parent role
  const parent = await queryOne<User>(
    'SELECT * FROM users WHERE user_id = $1',
    [parentId]
  );

  if (!parent) {
    throw new LinkingError('Parent not found', 'PARENT_NOT_FOUND');
  }

  if (parent.role !== Role.Parent) {
    throw new LinkingError('User is not a parent', 'NOT_A_PARENT');
  }

  // Check for existing pending invitation from this parent to this email
  const existingLink = await queryOne<ParentStudentLink>(
    `SELECT * FROM parent_student_links 
     WHERE parent_id = $1 AND student_email = $2 AND status = $3`,
    [parentId, trimmedEmail, LinkStatus.Pending]
  );

  if (existingLink) {
    throw new LinkingError(
      'A pending invitation already exists for this student email',
      'DUPLICATE_INVITATION'
    );
  }

  // Look up the student by email to pre-fill student_id if they exist
  const student = await queryOne<User>(
    'SELECT * FROM users WHERE email = $1 AND role = $2',
    [trimmedEmail, Role.Student]
  );

  const linkId = uuidv4();
  const now = new Date();

  const link = await insertOne<ParentStudentLink>(
    `INSERT INTO parent_student_links (link_id, parent_id, student_id, student_email, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [linkId, parentId, student?.user_id || null, trimmedEmail, LinkStatus.Pending, now]
  );

  return link;
}

/**
 * Accept or reject a link invitation.
 *
 * Validates:
 * - The link exists and is in 'pending' status
 * - The student exists and has the 'student' role
 * - The student's email matches the invitation's student_email
 *
 * @param linkId - UUID of the link invitation
 * @param studentId - UUID of the student responding
 * @param accept - true to accept, false to reject
 * @returns The updated ParentStudentLink record
 */
export async function respondToInvitation(
  linkId: string,
  studentId: string,
  accept: boolean
): Promise<ParentStudentLink> {
  if (!linkId) {
    throw new LinkingError('Link ID is required', 'MISSING_LINK_ID');
  }

  if (!studentId) {
    throw new LinkingError('Student ID is required', 'MISSING_STUDENT_ID');
  }

  // Get the link
  const link = await queryOne<ParentStudentLink>(
    'SELECT * FROM parent_student_links WHERE link_id = $1',
    [linkId]
  );

  if (!link) {
    throw new LinkingError('Link invitation not found', 'LINK_NOT_FOUND');
  }

  if (link.status !== LinkStatus.Pending) {
    throw new LinkingError(
      'This invitation has already been responded to',
      'ALREADY_RESPONDED'
    );
  }

  // Verify student exists and has the student role
  const student = await queryOne<User>(
    'SELECT * FROM users WHERE user_id = $1',
    [studentId]
  );

  if (!student) {
    throw new LinkingError('Student not found', 'STUDENT_NOT_FOUND');
  }

  if (student.role !== Role.Student) {
    throw new LinkingError('User is not a student', 'NOT_A_STUDENT');
  }

  // Verify the student's email matches the invitation
  if (student.email.toLowerCase() !== link.student_email.toLowerCase()) {
    throw new LinkingError(
      'Student email does not match the invitation',
      'EMAIL_MISMATCH'
    );
  }

  const newStatus = accept ? LinkStatus.Accepted : LinkStatus.Rejected;

  await updateMany(
    `UPDATE parent_student_links SET status = $1, student_id = $2 WHERE link_id = $3`,
    [newStatus, studentId, linkId]
  );

  // Return the updated link
  const updatedLink = await queryOne<ParentStudentLink>(
    'SELECT * FROM parent_student_links WHERE link_id = $1',
    [linkId]
  );

  return updatedLink!;
}

/**
 * Check whether a parent has access to a student's data.
 * Access is granted only when the link status is 'accepted'.
 *
 * @param parentId - UUID of the parent
 * @param studentId - UUID of the student
 * @returns true if the parent has an accepted link to the student
 */
export async function hasParentAccess(
  parentId: string,
  studentId: string
): Promise<boolean> {
  if (!parentId || !studentId) {
    return false;
  }

  const link = await queryOne<ParentStudentLink>(
    `SELECT * FROM parent_student_links 
     WHERE parent_id = $1 AND student_id = $2 AND status = $3`,
    [parentId, studentId, LinkStatus.Accepted]
  );

  return link !== null;
}

/**
 * Get all link invitations for a student (by student email).
 *
 * @param studentEmail - Email address of the student
 * @returns Array of pending ParentStudentLink records
 */
export async function getPendingInvitationsForStudent(
  studentEmail: string
): Promise<ParentStudentLink[]> {
  if (!studentEmail) {
    return [];
  }

  const links = await queryMany<ParentStudentLink>(
    `SELECT * FROM parent_student_links 
     WHERE student_email = $1 AND status = $2
     ORDER BY created_at DESC`,
    [studentEmail.trim().toLowerCase(), LinkStatus.Pending]
  );

  return links;
}

/**
 * Get all linked students for a parent (accepted links only).
 *
 * @param parentId - UUID of the parent
 * @returns Array of accepted ParentStudentLink records
 */
export async function getLinkedStudents(
  parentId: string
): Promise<ParentStudentLink[]> {
  if (!parentId) {
    return [];
  }

  const links = await queryMany<ParentStudentLink>(
    `SELECT * FROM parent_student_links 
     WHERE parent_id = $1 AND status = $2
     ORDER BY created_at DESC`,
    [parentId, LinkStatus.Accepted]
  );

  return links;
}

/**
 * Get all links for a parent (any status).
 *
 * @param parentId - UUID of the parent
 * @returns Array of all ParentStudentLink records for this parent
 */
export async function getAllLinksForParent(
  parentId: string
): Promise<ParentStudentLink[]> {
  if (!parentId) {
    return [];
  }

  const links = await queryMany<ParentStudentLink>(
    `SELECT * FROM parent_student_links 
     WHERE parent_id = $1
     ORDER BY created_at DESC`,
    [parentId]
  );

  return links;
}
