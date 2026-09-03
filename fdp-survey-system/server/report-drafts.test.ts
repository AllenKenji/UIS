import { describe, it, expect, beforeEach } from "vitest";
import * as db from "./db";

describe("Report Drafts", () => {
  let testUserId: number;
  let testDraftId: number;

  beforeEach(async () => {
    // Create a test user
    await db.upsertUser({
      openId: "test-draft-user",
      name: "Draft Test User",
      email: "draft@test.com",
    });
    const user = await db.getUserByOpenId("test-draft-user");
    testUserId = user!.id;
  });

  describe("createReportDraft", () => {
    it("should create a new report draft", async () => {
      const token = `test-token-${Date.now()}-${Math.random()}`;
      const draft = await db.createReportDraft({
        name: "Test Draft",
        description: "Test draft description",
        shareToken: token,
        selectedFields: ["headOfFamily", "barangay", "monthlyIncome"],
        filters: {
          barangay: "Test Barangay",
          minIncome: 5000,
        },
        exportLayout: "executive",
        createdBy: testUserId,
      });

      expect(draft).toBeDefined();
      expect(draft.name).toBe("Test Draft");
      expect(draft.shareToken).toBe(token);
      expect(draft.selectedFields).toEqual(["headOfFamily", "barangay", "monthlyIncome"]);
      testDraftId = draft.id;
    });

    it("should create draft with custom layout", async () => {
      const draft = await db.createReportDraft({
        name: "Custom Layout Draft",
        shareToken: `test-token-custom-${Date.now()}-${Math.random()}`,
        selectedFields: ["headOfFamily"],
        exportLayout: "custom",
        customLayoutId: 1,
        createdBy: testUserId,
      });

      expect(draft.exportLayout).toBe("custom");
      expect(draft.customLayoutId).toBe(1);
    });
  });

  describe("getReportDrafts", () => {
    it("should return all drafts for a user", async () => {
      await db.createReportDraft({
        name: "Draft 1",
        shareToken: `token-1-${Date.now()}-${Math.random()}`,
        selectedFields: ["headOfFamily"],
        exportLayout: "executive",
        createdBy: testUserId,
      });

      await db.createReportDraft({
        name: "Draft 2",
        shareToken: `token-2-${Date.now()}-${Math.random()}`,
        selectedFields: ["barangay"],
        exportLayout: "detailed",
        createdBy: testUserId,
      });

      const drafts = await db.getReportDrafts(testUserId);
      expect(drafts.length).toBeGreaterThanOrEqual(2);
      expect(drafts.some(d => d.name === "Draft 1")).toBe(true);
      expect(drafts.some(d => d.name === "Draft 2")).toBe(true);
    });
  });

  describe("getReportDraftById", () => {
    it("should return draft by id", async () => {
      const created = await db.createReportDraft({
        name: "Get By ID Test",
        shareToken: `token-get-id-${Date.now()}-${Math.random()}`,
        selectedFields: ["headOfFamily"],
        exportLayout: "executive",
        createdBy: testUserId,
      });

      const draft = await db.getReportDraftById(created.id, testUserId);
      expect(draft).toBeDefined();
      expect(draft?.name).toBe("Get By ID Test");
    });

    it("should return undefined for non-existent draft", async () => {
      const draft = await db.getReportDraftById(999999, testUserId);
      expect(draft).toBeUndefined();
    });
  });

  describe("getReportDraftByToken", () => {
    it("should return draft by share token", async () => {
      const token = `unique-token-${Date.now()}-${Math.random()}`;
      await db.createReportDraft({
        name: "Token Test",
        shareToken: token,
        selectedFields: ["headOfFamily"],
        exportLayout: "executive",
        createdBy: testUserId,
      });

      const draft = await db.getReportDraftByToken(token);
      expect(draft).toBeDefined();
      expect(draft?.name).toBe("Token Test");
    });

    it("should increment view count when accessed by token", async () => {
      const token = `view-count-token-${Date.now()}-${Math.random()}`;
      await db.createReportDraft({
        name: "View Count Test",
        shareToken: token,
        selectedFields: ["headOfFamily"],
        exportLayout: "executive",
        createdBy: testUserId,
      });

      const draft1 = await db.getReportDraftByToken(token);
      expect(draft1?.viewCount).toBe(1);

      const draft2 = await db.getReportDraftByToken(token);
      expect(draft2?.viewCount).toBe(2);
    });

    it("should update lastViewedAt when accessed", async () => {
      const token = `last-viewed-token-${Date.now()}-${Math.random()}`;
      await db.createReportDraft({
        name: "Last Viewed Test",
        shareToken: token,
        selectedFields: ["headOfFamily"],
        exportLayout: "executive",
        createdBy: testUserId,
      });

      const draft = await db.getReportDraftByToken(token);
      expect(draft?.lastViewedAt).not.toBeNull();
    });
  });

  describe("updateReportDraft", () => {
    it("should update draft name and description", async () => {
      const created = await db.createReportDraft({
        name: "Original Name",
        description: "Original Description",
        shareToken: `update-token-${Date.now()}-${Math.random()}`,
        selectedFields: ["headOfFamily"],
        exportLayout: "executive",
        createdBy: testUserId,
      });

      await db.updateReportDraft(created.id, testUserId, {
        name: "Updated Name",
        description: "Updated Description",
      });

      const updated = await db.getReportDraftById(created.id, testUserId);
      expect(updated?.name).toBe("Updated Name");
      expect(updated?.description).toBe("Updated Description");
    });

    it("should update selected fields and filters", async () => {
      const created = await db.createReportDraft({
        name: "Update Fields Test",
        shareToken: `update-fields-token-${Date.now()}-${Math.random()}`,
        selectedFields: ["headOfFamily"],
        filters: { barangay: "Old Barangay" },
        exportLayout: "executive",
        createdBy: testUserId,
      });

      await db.updateReportDraft(created.id, testUserId, {
        selectedFields: ["headOfFamily", "barangay", "monthlyIncome"],
        filters: { barangay: "New Barangay", minIncome: 10000 },
      });

      const updated = await db.getReportDraftById(created.id, testUserId);
      expect(updated?.selectedFields).toEqual(["headOfFamily", "barangay", "monthlyIncome"]);
      expect(updated?.filters).toEqual({ barangay: "New Barangay", minIncome: 10000 });
    });
  });

  describe("deleteReportDraft", () => {
    it("should delete a draft", async () => {
      const created = await db.createReportDraft({
        name: "Delete Test",
        shareToken: "delete-token",
        selectedFields: ["headOfFamily"],
        exportLayout: "executive",
        createdBy: testUserId,
      });

      await db.deleteReportDraft(created.id, testUserId);

      const deleted = await db.getReportDraftById(created.id, testUserId);
      expect(deleted).toBeUndefined();
    });
  });
});
