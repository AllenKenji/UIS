import { describe, expect, it, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

describe("households API", () => {
  beforeAll(async () => {
    // Ensure test user exists in database
    await db.upsertUser({
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "user",
    });
  });
  it("creates a household with valid data", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.households.create({
      barangay: "Test Barangay",
      municipality: "Test Municipality",
      province: "Parañaque",
      headOfFamily: "Juan Dela Cruz",
      age: 45,
      civilStatus: "Married",
      occupation: "Farmer",
      education: "High School",
      monthlyIncome: 15000,
      latitude: 17.6132,
      longitude: 121.7270,
      fourPsBeneficiary: true,
      tupadBeneficiary: false,
      seniorCitizen: false,
      pwdMember: false,
      indigenousPeople: false,
    });

    expect(result).toBeDefined();
    expect(result.id).toBeGreaterThan(0);
    expect(result.headOfFamily).toBe("Juan Dela Cruz");
    expect(result.barangay).toBe("Test Barangay");
  });

  it("retrieves household statistics", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const stats = await caller.households.statistics();

    expect(stats).toBeDefined();
    expect(stats.totalHouseholds).toBeGreaterThanOrEqual(0);
    expect(stats.fourPsBeneficiaries).toBeGreaterThanOrEqual(0);
  });

  it("lists all barangays", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const barangays = await caller.households.barangayList();

    expect(Array.isArray(barangays)).toBe(true);
  });

  it("retrieves income distribution", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const distribution = await caller.households.incomeDistribution();

    expect(Array.isArray(distribution)).toBe(true);
    expect(distribution.length).toBe(5); // 5 income ranges
    expect(distribution[0]).toHaveProperty("name");
    expect(distribution[0]).toHaveProperty("value");
  });

  it("searches households by keyword", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // First create a test household
    await caller.households.create({
      barangay: "Search Test",
      municipality: "Test City",
      province: "Parañaque",
      headOfFamily: "Maria Santos",
      age: 35,
      occupation: "Teacher",
    });

    // Then search for it
    const results = await caller.households.search({
      query: "Teacher",
    });

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });
});

describe("surveys API", () => {
  beforeAll(async () => {
    // Ensure test user exists in database
    await db.upsertUser({
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "user",
    });
  });
  it("creates a survey response for a household", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // First create a household
    const household = await caller.households.create({
      barangay: "Survey Test",
      municipality: "Test City",
      province: "Parañaque",
      headOfFamily: "Pedro Reyes",
    });

    // Then create a survey response
    const survey = await caller.surveys.create({
      householdId: household.id,
      sectionA: { location: "Test Location" },
      sectionB: { members: [{ name: "Pedro Reyes", age: 40 }] },
    });

    expect(survey).toBeDefined();
    expect(survey.id).toBeGreaterThan(0);
    expect(survey.householdId).toBe(household.id);
  });

  it("retrieves survey by household ID", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create household and survey
    const household = await caller.households.create({
      barangay: "Retrieve Test",
      municipality: "Test City",
      province: "Parañaque",
      headOfFamily: "Ana Garcia",
    });

    await caller.surveys.create({
      householdId: household.id,
      sectionA: { test: "data" },
    });

    // Retrieve the survey
    const survey = await caller.surveys.getByHouseholdId({
      householdId: household.id,
    });

    expect(survey).toBeDefined();
    expect(survey?.householdId).toBe(household.id);
  });
});
