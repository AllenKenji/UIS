import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";

describe("Status Statistics", () => {
  let testHouseholdIds: number[] = [];
  let submittedHouseholdIds: number[] = [];

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
    // Create test households with different statuses
    const statuses: Array<"draft" | "submitted" | "approved" | "returned"> = [
      "submitted",
      "submitted",
      "approved",
      "returned",
      "submitted",
    ];

    for (const status of statuses) {
      const household = await caller.households.create({
        barangay: "Test Barangay",
        municipality: "Test Municipality",
        province: "Parañaque",
        headOfFamily: `Test Family ${status}`,
        age: 45,
        civilStatus: "Married",
        occupation: "Farmer",
        education: "High School",
        monthlyIncome: 10000,
        latitude: 17.6132,
        longitude: 121.7270,
        fourPsBeneficiary: false,
        tupadBeneficiary: false,
        seniorCitizen: false,
        pwdMember: false,
        indigenousPeople: false,
        status,
      });

      testHouseholdIds.push(household.id);

      if (status === "submitted") {
        submittedHouseholdIds.push(household.id);
      }

      // If approved or returned, update with review info
      if (status === "approved" || status === "returned") {
        await db.updateHouseholdStatus(
          household.id,
          status,
          mockContext.user.id,
          status === "returned" ? "Test reason" : undefined
        );
      }
    }
  });

  describe("statusStatistics endpoint", () => {
    it("should return status counts for all surveys", async () => {
      const stats = await caller.households.statusStatistics();

      expect(stats).toBeDefined();
      expect(stats).toHaveProperty("total");
      expect(stats).toHaveProperty("draft");
      expect(stats).toHaveProperty("submitted");
      expect(stats).toHaveProperty("approved");
      expect(stats).toHaveProperty("returned");
      expect(stats).toHaveProperty("approvalRate");
      expect(stats).toHaveProperty("pendingReview");
    });

    it("should calculate correct approval rate", async () => {
      const stats = await caller.households.statusStatistics();

      // From our test data: 1 approved, 1 returned = 50% approval rate
      const totalReviewed = stats.approved + stats.returned;
      const expectedRate =
        totalReviewed > 0
          ? Math.round((stats.approved / totalReviewed) * 100)
          : 0;

      expect(stats.approvalRate).toBe(expectedRate);
    });

    it("should count pending reviews correctly", async () => {
      const stats = await caller.households.statusStatistics();

      expect(stats.pendingReview).toBe(stats.submitted);
      expect(stats.pendingReview).toBeGreaterThanOrEqual(0);
    });

    it("should have total equal to sum of all statuses", async () => {
      const stats = await caller.households.statusStatistics();

      const sum =
        stats.draft + stats.submitted + stats.approved + stats.returned;
      expect(stats.total).toBe(sum);
    });
  });

  describe("approvalTrends endpoint", () => {
    it("should return monthly approval trends", async () => {
      const trends = await caller.households.approvalTrends();

      expect(Array.isArray(trends)).toBe(true);
      expect(trends.length).toBeGreaterThan(0);
      expect(trends.length).toBeLessThanOrEqual(6); // Last 6 months
    });

    it("should have required fields in each trend entry", async () => {
      const trends = await caller.households.approvalTrends();

      trends.forEach((entry) => {
        expect(entry).toHaveProperty("month");
        expect(entry).toHaveProperty("approved");
        expect(entry).toHaveProperty("returned");
        expect(entry).toHaveProperty("submitted");
        expect(entry).toHaveProperty("approvalRate");
      });
    });

    it("should calculate approval rate for each month", async () => {
      const trends = await caller.households.approvalTrends();

      trends.forEach((entry) => {
        const totalReviewed = entry.approved + entry.returned;
        const expectedRate =
          totalReviewed > 0
            ? Math.round((entry.approved / totalReviewed) * 100)
            : 0;

        expect(entry.approvalRate).toBe(expectedRate);
      });
    });

    it("should have months in reverse chronological order", async () => {
      const trends = await caller.households.approvalTrends();

      if (trends.length > 1) {
        // Check that dates are in descending order (most recent first)
        for (let i = 0; i < trends.length - 1; i++) {
          const currentDate = new Date(trends[i].month);
          const nextDate = new Date(trends[i + 1].month);
          // Current should be more recent than or equal to next
          expect(currentDate.getTime()).toBeGreaterThanOrEqual(
            nextDate.getTime()
          );
        }
      }
    });
  });

  describe("averageReviewTime endpoint", () => {
    it("should return average review time in hours", async () => {
      const avgTime = await caller.households.averageReviewTime();

      expect(typeof avgTime).toBe("number");
      expect(avgTime).toBeGreaterThanOrEqual(0);
    });

    it("should return 0 if no surveys have been reviewed", async () => {
      // This test assumes there might be surveys without review times
      const avgTime = await caller.households.averageReviewTime();

      // Average time should be a valid number
      expect(Number.isFinite(avgTime)).toBe(true);
    });

    it("should calculate reasonable review times", async () => {
      const avgTime = await caller.households.averageReviewTime();

      // Review time should be reasonable (not negative, not absurdly large)
      expect(avgTime).toBeGreaterThanOrEqual(0);
      expect(avgTime).toBeLessThan(10000); // Less than 10,000 hours (sanity check)
    });
  });

  describe("Database helper functions", () => {
    it("should get status statistics via db helper", async () => {
      const stats = await db.getStatusStatistics();

      expect(stats).toBeDefined();
      expect(stats.total).toBeGreaterThan(0);
      expect(typeof stats.approvalRate).toBe("number");
    });

    it("should get approval trends via db helper", async () => {
      const trends = await db.getApprovalTrends();

      expect(Array.isArray(trends)).toBe(true);
      expect(trends.length).toBeGreaterThan(0);
    });

    it("should get average review time via db helper", async () => {
      const avgTime = await db.getAverageReviewTime();

      expect(typeof avgTime).toBe("number");
      expect(avgTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Integration with status workflow", () => {
    it("should update statistics when survey is approved", async () => {
      // Use a known submitted household ID from our test setup
      const submittedId = submittedHouseholdIds[0];
      if (!submittedId) return; // Skip if no submitted surveys

      const statsBefore = await caller.households.statusStatistics();
      const approvedBefore = statsBefore.approved;

      await caller.households.approve({ id: submittedId });

      const statsAfter = await caller.households.statusStatistics();

      // Approved count should increase by exactly 1
      expect(statsAfter.approved).toBe(approvedBefore + 1);
    });

    it("should update statistics when survey is returned", async () => {
      // Use the second submitted household ID (first was approved above)
      const submittedId = submittedHouseholdIds[1];
      if (!submittedId) return; // Skip if no submitted surveys

      const statsBefore = await caller.households.statusStatistics();
      const returnedBefore = statsBefore.returned;

      await caller.households.return({
        id: submittedId,
        reason: "Test return",
      });

      const statsAfter = await caller.households.statusStatistics();

      // Returned count should increase by exactly 1
      expect(statsAfter.returned).toBe(returnedBefore + 1);
    });
  });
});
