import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";

describe("Status Workflow", () => {
  let testHouseholdId: number;
  let testUserId: number;

  // Mock context for authenticated user
  const mockContext = {
    user: {
      id: 1,
      openId: "test-user",
      name: "Test Supervisor",
      email: "supervisor@test.com",
      role: "supervisor" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      loginMethod: "test",
    },
    req: {} as any,
    res: {} as any,
  };

  const caller = appRouter.createCaller(mockContext);

  beforeAll(async () => {
    // Create a test household with submitted status
    const household = await caller.households.create({
      barangay: "Test Barangay",
      municipality: "Test Municipality",
      province: "Parañaque",
      headOfFamily: "Test Family Head",
      age: 45,
      civilStatus: "Married",
      occupation: "Farmer",
      education: "High School",
      monthlyIncome: 10000,
      latitude: 17.6132,
      longitude: 121.7270,
      fourPsBeneficiary: true,
      tupadBeneficiary: false,
      seniorCitizen: false,
      pwdMember: false,
      indigenousPeople: false,
      status: "submitted",
    });

    testHouseholdId = household.id;
    testUserId = mockContext.user.id;
  });

  describe("Status transitions", () => {
    it("should approve a submitted survey", async () => {
      const result = await caller.households.approve({ id: testHouseholdId });

      expect(result.status).toBe("approved");
      expect(result.reviewedBy).toBe(testUserId);
      expect(result.reviewedAt).toBeDefined();
      expect(result.returnReason).toBeNull();
    });

    it("should return a survey with a reason", async () => {
      // First, set it back to submitted
      await db.updateHouseholdStatus(testHouseholdId, "submitted", testUserId);

      const returnReason = "Missing verification photo";
      const result = await caller.households.return({
        id: testHouseholdId,
        reason: returnReason,
      });

      expect(result.status).toBe("returned");
      expect(result.reviewedBy).toBe(testUserId);
      expect(result.reviewedAt).toBeDefined();
      expect(result.returnReason).toBe(returnReason);
    });

    it("should update status with custom status and reason", async () => {
      const result = await caller.households.updateStatus({
        id: testHouseholdId,
        status: "approved",
        returnReason: undefined,
      });

      expect(result.status).toBe("approved");
      expect(result.reviewedBy).toBe(testUserId);
      expect(result.returnReason).toBeNull();
    });

    it("should allow re-approval after return", async () => {
      // Return the survey
      await caller.households.return({
        id: testHouseholdId,
        reason: "Needs corrections",
      });

      // Approve it again
      const result = await caller.households.approve({ id: testHouseholdId });

      expect(result.status).toBe("approved");
      expect(result.returnReason).toBeNull();
    });
  });

  describe("Status history", () => {
    it("should retrieve status history for a household", async () => {
      const history = await caller.households.getStatusHistory({
        id: testHouseholdId,
      });

      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);

      // Check that history entries have required fields
      history.forEach((entry) => {
        expect(entry).toHaveProperty("date");
        expect(entry).toHaveProperty("status");
        expect(entry).toHaveProperty("action");
        expect(entry).toHaveProperty("user");
      });
    });

    it("should show submission as the first history entry", async () => {
      const history = await caller.households.getStatusHistory({
        id: testHouseholdId,
      });

      const submissionEntry = history.find((h) => h.status === "submitted");
      expect(submissionEntry).toBeDefined();
      expect(submissionEntry?.action).toBe("Survey Submitted");
    });

    it("should show approval in history when approved", async () => {
      // Ensure it's approved
      await caller.households.approve({ id: testHouseholdId });

      const history = await caller.households.getStatusHistory({
        id: testHouseholdId,
      });

      const approvalEntry = history.find((h) => h.status === "approved");
      expect(approvalEntry).toBeDefined();
      expect(approvalEntry?.action).toBe("Survey Approved");
    });

    it("should show return reason in history when returned", async () => {
      const returnReason = "GPS coordinates are incorrect";
      await caller.households.return({
        id: testHouseholdId,
        reason: returnReason,
      });

      const history = await caller.households.getStatusHistory({
        id: testHouseholdId,
      });

      const returnEntry = history.find((h) => h.status === "returned");
      expect(returnEntry).toBeDefined();
      expect(returnEntry?.action).toBe("Survey Returned");
      expect(returnEntry?.details).toContain(returnReason);
    });
  });

  describe("List filtering by status", () => {
    it("should list all households with their status", async () => {
      const households = await caller.households.list();

      expect(Array.isArray(households)).toBe(true);
      expect(households.length).toBeGreaterThan(0);

      // Check that each household has a status field
      households.forEach((household) => {
        expect(household).toHaveProperty("status");
        expect(["draft", "submitted", "approved", "returned"]).toContain(
          household.status
        );
      });
    });

    it("should include status in household details", async () => {
      const household = await caller.households.get({ id: testHouseholdId });

      expect(household).toBeDefined();
      expect(household?.status).toBeDefined();
      expect(["draft", "submitted", "approved", "returned"]).toContain(
        household?.status
      );
    });
  });

  describe("Database helper functions", () => {
    it("should update household status directly via db helper", async () => {
      const result = await db.updateHouseholdStatus(
        testHouseholdId,
        "submitted",
        testUserId
      );

      expect(result.status).toBe("submitted");
      expect(result.reviewedBy).toBe(testUserId);
    });

    it("should clear return reason when approving", async () => {
      // First return with a reason
      await db.updateHouseholdStatus(
        testHouseholdId,
        "returned",
        testUserId,
        "Test reason"
      );

      // Then approve
      const result = await db.updateHouseholdStatus(
        testHouseholdId,
        "approved",
        testUserId
      );

      expect(result.status).toBe("approved");
      expect(result.returnReason).toBeNull();
    });

    it("should set return reason when returning", async () => {
      const reason = "Data validation failed";
      const result = await db.updateHouseholdStatus(
        testHouseholdId,
        "returned",
        testUserId,
        reason
      );

      expect(result.status).toBe("returned");
      expect(result.returnReason).toBe(reason);
    });
  });
});
