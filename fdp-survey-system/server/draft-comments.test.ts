import { describe, it, expect, beforeAll } from "vitest";
import * as db from "./db";

describe("Draft Comments", () => {
  let testUserId: number;
  let testDraftId: number;
  let testCommentId: number;

  beforeAll(async () => {
    // Create a test user
    await db.upsertUser({
      openId: "test-user-comments",
      name: "Test User",
      email: "test@example.com",
    });

    const user = await db.getUserByOpenId("test-user-comments");
    testUserId = user!.id;

    // Create a test draft
    const draft = await db.createReportDraft({
      name: "Test Draft for Comments",
      shareToken: `test-draft-${Date.now()}-${Math.random()}`,
      selectedFields: ["headOfFamily"],
      exportLayout: "executive",
      createdBy: testUserId,
    });
    testDraftId = draft.id;
  });

  describe("createDraftComment", () => {
    it("should create a new comment", async () => {
      const comment = await db.createDraftComment({
        draftId: testDraftId,
        content: "This is a test comment",
        authorId: testUserId,
      });

      expect(comment).toBeDefined();
      expect(comment.draftId).toBe(testDraftId);
      expect(comment.content).toBe("This is a test comment");
      expect(comment.authorId).toBe(testUserId);
      testCommentId = comment.id;
    });
  });

  describe("getDraftComments", () => {
    it("should return all comments for a draft", async () => {
      // Create another comment
      await db.createDraftComment({
        draftId: testDraftId,
        content: "Second comment",
        authorId: testUserId,
      });

      const comments = await db.getDraftComments(testDraftId);
      expect(comments.length).toBeGreaterThanOrEqual(2);
      expect(comments[0].authorName).toBe("Test User");
    });

    it("should return empty array for draft with no comments", async () => {
      const draft = await db.createReportDraft({
        name: "Draft Without Comments",
        shareToken: `no-comments-${Date.now()}-${Math.random()}`,
        selectedFields: ["headOfFamily"],
        exportLayout: "executive",
        createdBy: testUserId,
      });

      const comments = await db.getDraftComments(draft.id);
      expect(comments).toEqual([]);
    });
  });

  describe("updateDraftComment", () => {
    it("should update comment content", async () => {
      const updated = await db.updateDraftComment(
        testCommentId,
        testUserId,
        "Updated comment content"
      );

      expect(updated).toBeDefined();
      expect(updated?.content).toBe("Updated comment content");
    });

    it("should not update comment from different user", async () => {
      // Create another user
      await db.upsertUser({
        openId: "test-user-2-comments",
        name: "Test User 2",
        email: "test2@example.com",
      });

      const user2 = await db.getUserByOpenId("test-user-2-comments");
      const updated = await db.updateDraftComment(
        testCommentId,
        user2!.id,
        "Unauthorized update"
      );

      // Should return undefined since user doesn't own the comment
      expect(updated).toBeUndefined();
    });
  });

  describe("deleteDraftComment", () => {
    it("should delete a comment", async () => {
      const comment = await db.createDraftComment({
        draftId: testDraftId,
        content: "Comment to delete",
        authorId: testUserId,
      });

      const success = await db.deleteDraftComment(comment.id, testUserId);
      expect(success).toBe(true);

      const comments = await db.getDraftComments(testDraftId);
      expect(comments.find(c => c.id === comment.id)).toBeUndefined();
    });

    it("should not delete comment from different user", async () => {
      const user2 = await db.getUserByOpenId("test-user-2-comments");
      const success = await db.deleteDraftComment(testCommentId, user2!.id);
      expect(success).toBe(false);
    });
  });
});
