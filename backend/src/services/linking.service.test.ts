import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LinkStatus, Role } from '../models/enums';

// Mock the database module
vi.mock('../utils/database', () => ({
  queryOne: vi.fn(),
  queryMany: vi.fn(),
  insertOne: vi.fn(),
  updateMany: vi.fn(),
}));

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-link-id-123'),
}));

import { queryOne, queryMany, insertOne, updateMany } from '../utils/database';
import {
  sendLinkInvitation,
  respondToInvitation,
  hasParentAccess,
  getPendingInvitationsForStudent,
  getLinkedStudents,
  getAllLinksForParent,
  LinkingError,
} from './linking.service';

const mockQueryOne = vi.mocked(queryOne);
const mockQueryMany = vi.mocked(queryMany);
const mockInsertOne = vi.mocked(insertOne);
const mockUpdateMany = vi.mocked(updateMany);

describe('Linking Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendLinkInvitation', () => {
    const parentId = 'parent-uuid-1';
    const studentEmail = 'student@example.com';

    const mockParent = {
      user_id: parentId,
      name: 'Parent User',
      email: 'parent@example.com',
      role: Role.Parent,
      password_hash: 'hash',
      password_salt: 'salt',
      grade: null,
      target_score: null,
      failed_login_attempts: 0,
      locked_until: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const mockStudent = {
      user_id: 'student-uuid-1',
      name: 'Student User',
      email: studentEmail,
      role: Role.Student,
      password_hash: 'hash',
      password_salt: 'salt',
      grade: 10,
      target_score: 30,
      failed_login_attempts: 0,
      locked_until: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    it('should create a link invitation successfully', async () => {
      const expectedLink = {
        link_id: 'mock-link-id-123',
        parent_id: parentId,
        student_id: mockStudent.user_id,
        student_email: studentEmail,
        status: LinkStatus.Pending,
        created_at: expect.any(Date),
      };

      // Parent exists
      mockQueryOne.mockResolvedValueOnce(mockParent);
      // No existing pending link
      mockQueryOne.mockResolvedValueOnce(null);
      // Student exists
      mockQueryOne.mockResolvedValueOnce(mockStudent);
      // Insert succeeds
      mockInsertOne.mockResolvedValueOnce(expectedLink as any);

      const result = await sendLinkInvitation(parentId, studentEmail);

      expect(result.link_id).toBe('mock-link-id-123');
      expect(result.status).toBe(LinkStatus.Pending);
      expect(result.parent_id).toBe(parentId);
      expect(result.student_email).toBe(studentEmail);
      expect(mockInsertOne).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO parent_student_links'),
        expect.arrayContaining([
          'mock-link-id-123',
          parentId,
          mockStudent.user_id,
          studentEmail,
          LinkStatus.Pending,
        ])
      );
    });

    it('should create a link invitation with null student_id when student is not registered', async () => {
      const expectedLink = {
        link_id: 'mock-link-id-123',
        parent_id: parentId,
        student_id: null,
        student_email: 'unknown@example.com',
        status: LinkStatus.Pending,
        created_at: new Date(),
      };

      mockQueryOne.mockResolvedValueOnce(mockParent); // Parent exists
      mockQueryOne.mockResolvedValueOnce(null); // No existing pending link
      mockQueryOne.mockResolvedValueOnce(null); // Student not found
      mockInsertOne.mockResolvedValueOnce(expectedLink as any);

      const result = await sendLinkInvitation(parentId, 'unknown@example.com');

      expect(result.student_id).toBeNull();
      expect(mockInsertOne).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([null])
      );
    });

    it('should throw when parent ID is missing', async () => {
      await expect(sendLinkInvitation('', studentEmail)).rejects.toThrow(LinkingError);
      await expect(sendLinkInvitation('', studentEmail)).rejects.toMatchObject({
        code: 'MISSING_PARENT_ID',
      });
    });

    it('should throw when student email is missing', async () => {
      await expect(sendLinkInvitation(parentId, '')).rejects.toThrow(LinkingError);
      await expect(sendLinkInvitation(parentId, '')).rejects.toMatchObject({
        code: 'MISSING_STUDENT_EMAIL',
      });
    });

    it('should throw when student email is whitespace only', async () => {
      await expect(sendLinkInvitation(parentId, '   ')).rejects.toThrow(LinkingError);
      await expect(sendLinkInvitation(parentId, '   ')).rejects.toMatchObject({
        code: 'MISSING_STUDENT_EMAIL',
      });
    });

    it('should throw when parent is not found', async () => {
      mockQueryOne.mockResolvedValueOnce(null);

      await expect(sendLinkInvitation(parentId, studentEmail)).rejects.toThrow(
        expect.objectContaining({
          name: 'LinkingError',
          code: 'PARENT_NOT_FOUND',
        })
      );
    });

    it('should throw when user is not a parent role', async () => {
      const notParent = { ...mockParent, role: Role.Student };
      mockQueryOne.mockResolvedValueOnce(notParent);

      await expect(sendLinkInvitation(parentId, studentEmail)).rejects.toThrow(LinkingError);
    });

    it('should throw on duplicate pending invitation', async () => {
      mockQueryOne.mockResolvedValueOnce(mockParent); // Parent exists
      mockQueryOne.mockResolvedValueOnce({
        link_id: 'existing-link',
        status: LinkStatus.Pending,
      }); // Existing link

      await expect(sendLinkInvitation(parentId, studentEmail)).rejects.toThrow(
        expect.objectContaining({
          name: 'LinkingError',
          code: 'DUPLICATE_INVITATION',
        })
      );
    });

    it('should normalize email to lowercase', async () => {
      mockQueryOne.mockResolvedValueOnce(mockParent);
      mockQueryOne.mockResolvedValueOnce(null); // No existing link
      mockQueryOne.mockResolvedValueOnce(null); // Student not found by email
      mockInsertOne.mockResolvedValueOnce({
        link_id: 'mock-link-id-123',
        parent_id: parentId,
        student_id: null,
        student_email: 'student@example.com',
        status: LinkStatus.Pending,
        created_at: new Date(),
      } as any);

      await sendLinkInvitation(parentId, 'STUDENT@Example.COM');

      // Check that the email used in queries is lowercase
      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('parent_student_links'),
        expect.arrayContaining(['student@example.com'])
      );
    });
  });

  describe('respondToInvitation', () => {
    const linkId = 'link-uuid-1';
    const studentId = 'student-uuid-1';

    const mockPendingLink = {
      link_id: linkId,
      parent_id: 'parent-uuid-1',
      student_id: null,
      student_email: 'student@example.com',
      status: LinkStatus.Pending,
      created_at: new Date(),
    };

    const mockStudent = {
      user_id: studentId,
      name: 'Student User',
      email: 'student@example.com',
      role: Role.Student,
      password_hash: 'hash',
      password_salt: 'salt',
      grade: 10,
      target_score: 30,
      failed_login_attempts: 0,
      locked_until: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    it('should accept a link invitation', async () => {
      const acceptedLink = {
        ...mockPendingLink,
        student_id: studentId,
        status: LinkStatus.Accepted,
      };

      mockQueryOne.mockResolvedValueOnce(mockPendingLink); // Get link
      mockQueryOne.mockResolvedValueOnce(mockStudent); // Get student
      mockUpdateMany.mockResolvedValueOnce(1); // Update link
      mockQueryOne.mockResolvedValueOnce(acceptedLink); // Get updated link

      const result = await respondToInvitation(linkId, studentId, true);

      expect(result.status).toBe(LinkStatus.Accepted);
      expect(result.student_id).toBe(studentId);
      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE parent_student_links'),
        [LinkStatus.Accepted, studentId, linkId]
      );
    });

    it('should reject a link invitation', async () => {
      const rejectedLink = {
        ...mockPendingLink,
        student_id: studentId,
        status: LinkStatus.Rejected,
      };

      mockQueryOne.mockResolvedValueOnce(mockPendingLink); // Get link
      mockQueryOne.mockResolvedValueOnce(mockStudent); // Get student
      mockUpdateMany.mockResolvedValueOnce(1); // Update link
      mockQueryOne.mockResolvedValueOnce(rejectedLink); // Get updated link

      const result = await respondToInvitation(linkId, studentId, false);

      expect(result.status).toBe(LinkStatus.Rejected);
      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE parent_student_links'),
        [LinkStatus.Rejected, studentId, linkId]
      );
    });

    it('should throw when link ID is missing', async () => {
      await expect(respondToInvitation('', studentId, true)).rejects.toThrow(LinkingError);
      await expect(respondToInvitation('', studentId, true)).rejects.toMatchObject({
        code: 'MISSING_LINK_ID',
      });
    });

    it('should throw when student ID is missing', async () => {
      await expect(respondToInvitation(linkId, '', true)).rejects.toThrow(LinkingError);
      await expect(respondToInvitation(linkId, '', true)).rejects.toMatchObject({
        code: 'MISSING_STUDENT_ID',
      });
    });

    it('should throw when link is not found', async () => {
      mockQueryOne.mockResolvedValueOnce(null);

      await expect(respondToInvitation(linkId, studentId, true)).rejects.toThrow(
        expect.objectContaining({
          name: 'LinkingError',
          code: 'LINK_NOT_FOUND',
        })
      );
    });

    it('should throw when link is already responded to', async () => {
      const acceptedLink = { ...mockPendingLink, status: LinkStatus.Accepted };
      mockQueryOne.mockResolvedValueOnce(acceptedLink);

      await expect(respondToInvitation(linkId, studentId, true)).rejects.toThrow(
        expect.objectContaining({
          name: 'LinkingError',
          code: 'ALREADY_RESPONDED',
        })
      );
    });

    it('should throw when student is not found', async () => {
      mockQueryOne.mockResolvedValueOnce(mockPendingLink);
      mockQueryOne.mockResolvedValueOnce(null); // Student not found

      await expect(respondToInvitation(linkId, studentId, true)).rejects.toThrow(
        expect.objectContaining({
          name: 'LinkingError',
          code: 'STUDENT_NOT_FOUND',
        })
      );
    });

    it('should throw when user is not a student', async () => {
      const notStudent = { ...mockStudent, role: Role.Parent };
      mockQueryOne.mockResolvedValueOnce(mockPendingLink);
      mockQueryOne.mockResolvedValueOnce(notStudent);

      await expect(respondToInvitation(linkId, studentId, true)).rejects.toThrow(
        expect.objectContaining({
          name: 'LinkingError',
          code: 'NOT_A_STUDENT',
        })
      );
    });

    it('should throw when student email does not match invitation', async () => {
      const wrongEmailStudent = { ...mockStudent, email: 'other@example.com' };
      mockQueryOne.mockResolvedValueOnce(mockPendingLink);
      mockQueryOne.mockResolvedValueOnce(wrongEmailStudent);

      await expect(respondToInvitation(linkId, studentId, true)).rejects.toThrow(
        expect.objectContaining({
          name: 'LinkingError',
          code: 'EMAIL_MISMATCH',
        })
      );
    });
  });

  describe('hasParentAccess', () => {
    it('should return true when an accepted link exists', async () => {
      mockQueryOne.mockResolvedValueOnce({
        link_id: 'link-1',
        parent_id: 'parent-1',
        student_id: 'student-1',
        status: LinkStatus.Accepted,
      });

      const result = await hasParentAccess('parent-1', 'student-1');
      expect(result).toBe(true);
    });

    it('should return false when no accepted link exists', async () => {
      mockQueryOne.mockResolvedValueOnce(null);

      const result = await hasParentAccess('parent-1', 'student-1');
      expect(result).toBe(false);
    });

    it('should return false for pending links (not accepted)', async () => {
      // The query filters by status = 'accepted', so pending links won't match
      mockQueryOne.mockResolvedValueOnce(null);

      const result = await hasParentAccess('parent-1', 'student-1');
      expect(result).toBe(false);
      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('status = $3'),
        ['parent-1', 'student-1', LinkStatus.Accepted]
      );
    });

    it('should return false when parentId is empty', async () => {
      const result = await hasParentAccess('', 'student-1');
      expect(result).toBe(false);
      expect(mockQueryOne).not.toHaveBeenCalled();
    });

    it('should return false when studentId is empty', async () => {
      const result = await hasParentAccess('parent-1', '');
      expect(result).toBe(false);
      expect(mockQueryOne).not.toHaveBeenCalled();
    });
  });

  describe('getPendingInvitationsForStudent', () => {
    it('should return pending invitations for a student email', async () => {
      const pendingLinks = [
        {
          link_id: 'link-1',
          parent_id: 'parent-1',
          student_id: null,
          student_email: 'student@example.com',
          status: LinkStatus.Pending,
          created_at: new Date(),
        },
        {
          link_id: 'link-2',
          parent_id: 'parent-2',
          student_id: null,
          student_email: 'student@example.com',
          status: LinkStatus.Pending,
          created_at: new Date(),
        },
      ];

      mockQueryMany.mockResolvedValueOnce(pendingLinks as any);

      const result = await getPendingInvitationsForStudent('student@example.com');

      expect(result).toHaveLength(2);
      expect(mockQueryMany).toHaveBeenCalledWith(
        expect.stringContaining('status = $2'),
        ['student@example.com', LinkStatus.Pending]
      );
    });

    it('should return empty array when no pending invitations exist', async () => {
      mockQueryMany.mockResolvedValueOnce([]);

      const result = await getPendingInvitationsForStudent('student@example.com');
      expect(result).toEqual([]);
    });

    it('should return empty array when email is empty', async () => {
      const result = await getPendingInvitationsForStudent('');
      expect(result).toEqual([]);
      expect(mockQueryMany).not.toHaveBeenCalled();
    });
  });

  describe('getLinkedStudents', () => {
    it('should return only accepted links for a parent', async () => {
      const acceptedLinks = [
        {
          link_id: 'link-1',
          parent_id: 'parent-1',
          student_id: 'student-1',
          student_email: 'student1@example.com',
          status: LinkStatus.Accepted,
          created_at: new Date(),
        },
      ];

      mockQueryMany.mockResolvedValueOnce(acceptedLinks as any);

      const result = await getLinkedStudents('parent-1');

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe(LinkStatus.Accepted);
      expect(mockQueryMany).toHaveBeenCalledWith(
        expect.stringContaining('status = $2'),
        ['parent-1', LinkStatus.Accepted]
      );
    });

    it('should return empty array when no accepted links exist', async () => {
      mockQueryMany.mockResolvedValueOnce([]);

      const result = await getLinkedStudents('parent-1');
      expect(result).toEqual([]);
    });

    it('should return empty array when parentId is empty', async () => {
      const result = await getLinkedStudents('');
      expect(result).toEqual([]);
      expect(mockQueryMany).not.toHaveBeenCalled();
    });
  });

  describe('getAllLinksForParent', () => {
    it('should return all links regardless of status', async () => {
      const allLinks = [
        {
          link_id: 'link-1',
          parent_id: 'parent-1',
          student_id: 'student-1',
          student_email: 'student1@example.com',
          status: LinkStatus.Accepted,
          created_at: new Date(),
        },
        {
          link_id: 'link-2',
          parent_id: 'parent-1',
          student_id: null,
          student_email: 'student2@example.com',
          status: LinkStatus.Pending,
          created_at: new Date(),
        },
        {
          link_id: 'link-3',
          parent_id: 'parent-1',
          student_id: 'student-3',
          student_email: 'student3@example.com',
          status: LinkStatus.Rejected,
          created_at: new Date(),
        },
      ];

      mockQueryMany.mockResolvedValueOnce(allLinks as any);

      const result = await getAllLinksForParent('parent-1');

      expect(result).toHaveLength(3);
      expect(mockQueryMany).toHaveBeenCalledWith(
        expect.stringContaining('WHERE parent_id = $1'),
        ['parent-1']
      );
    });

    it('should return empty array when parentId is empty', async () => {
      const result = await getAllLinksForParent('');
      expect(result).toEqual([]);
      expect(mockQueryMany).not.toHaveBeenCalled();
    });
  });
});
