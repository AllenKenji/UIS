import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "./db";
import { computeCBMSIndicators, CBMS_BASELINE } from "./db";
import { households, surveyResponses } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function cleanupTestHouseholds(ids: number[]) {
  const db = await getDb();
  if (!db || ids.length === 0) return;
  for (const id of ids) {
    await db.delete(surveyResponses).where(eq(surveyResponses.householdId, id));
    await db.delete(households).where(eq(households.id, id));
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("CBMS Baseline Constants", () => {
  it("should have correct total households baseline", () => {
    expect(CBMS_BASELINE.totalHouseholds).toBe(3141);
  });

  it("should have correct poverty threshold", () => {
    expect(CBMS_BASELINE.povertyThreshold).toBe(10481);
  });

  it("should have correct below poverty percentage", () => {
    expect(CBMS_BASELINE.belowPovertyPct).toBe(22.13);
  });

  it("should have correct informal settlers percentage", () => {
    expect(CBMS_BASELINE.informalSettlersPct).toBe(33.52);
  });

  it("should have correct without safe water percentage", () => {
    expect(CBMS_BASELINE.withoutSafeWaterPct).toBe(30.0);
  });

  it("should have correct electricity percentage", () => {
    expect(CBMS_BASELINE.withElectricityPct).toBe(96.63);
  });

  it("should have correct PhilHealth percentage", () => {
    expect(CBMS_BASELINE.withPhilHealthPct).toBe(59.0);
  });
});

describe("computeCBMSIndicators", () => {
  let testHouseholdIds: number[] = [];

  beforeAll(async () => {
    const db = await getDb();
    if (!db) return;

    // Insert test households with "approved" status
    const testHouseholds = [
      {
        householdId: "CBMS-TEST-001",
        headOfFamily: "Test Head 1",
        barangay: "Magsaysay",
        municipality: "San Pedro",
        province: "Laguna",
        status: "approved" as const,
        monthlyIncome: "5000", // below poverty threshold
      },
      {
        householdId: "CBMS-TEST-002",
        headOfFamily: "Test Head 2",
        barangay: "Magsaysay",
        municipality: "San Pedro",
        province: "Laguna",
        status: "approved" as const,
        monthlyIncome: "25000", // above poverty threshold
        fourPsBeneficiary: true,
        seniorCitizen: true,
      },
      {
        householdId: "CBMS-TEST-003",
        headOfFamily: "Test Head 3",
        barangay: "Magsaysay",
        municipality: "San Pedro",
        province: "Laguna",
        status: "submitted" as const, // NOT approved — should be excluded
        monthlyIncome: "3000",
      },
    ];

    for (const hh of testHouseholds) {
      const [inserted] = await db.insert(households).values(hh).returning({ id: households.id });
      testHouseholdIds.push(inserted!.id);
    }

    // Insert survey responses for approved households
    const approvedIds = testHouseholdIds.slice(0, 2);

    await db.insert(surveyResponses).values({
      householdId: approvedIds[0],
      sectionC: {
        waterSource: "open well",        // unsafe water
        toiletFacility: "none",          // unsanitary
        houseType: "informal settler",   // informal settler
        electricitySource: "none",       // no electricity
      },
      sectionE: { hasHealthInsurance: false },
      sectionH: { hasEvacuationPlan: false },
      sectionI: { hasAgriculturalLand: false },
    });

    await db.insert(surveyResponses).values({
      householdId: approvedIds[1],
      sectionC: {
        waterSource: "level 3 piped water",  // safe water
        toiletFacility: "water-sealed toilet", // sanitary
        houseType: "owned house",              // not informal settler
        electricitySource: "Meralco",          // with electricity
      },
      sectionE: { hasHealthInsurance: true },
      sectionH: { hasEvacuationPlan: true },
      sectionI: { hasAgriculturalLand: true },
    });
  });

  afterAll(async () => {
    await cleanupTestHouseholds(testHouseholdIds);
  });

  it("should return only approved households in computation", async () => {
    const db = await getDb();
    if (!db) return;

    const result = await computeCBMSIndicators();
    // The result should include our 2 approved test households (plus any existing approved ones)
    expect(result.totalApprovedHouseholds).toBeGreaterThanOrEqual(2);
  });

  it("should return indicators array with correct structure", async () => {
    const result = await computeCBMSIndicators();
    expect(Array.isArray(result.indicators)).toBe(true);
    expect(result.indicators.length).toBeGreaterThan(0);

    // Check structure of first indicator
    const first = result.indicators[0];
    expect(first).toHaveProperty("indicator");
    expect(first).toHaveProperty("category");
    expect(first).toHaveProperty("surveyCount");
    expect(first).toHaveProperty("surveyPct");
    expect(first).toHaveProperty("baselineCount");
    expect(first).toHaveProperty("baselinePct");
    expect(first).toHaveProperty("trend");
    expect(first).toHaveProperty("trendDiff");
    expect(first).toHaveProperty("totalSurveyed");
  });

  it("should include all expected indicator names", async () => {
    const result = await computeCBMSIndicators();
    const indicatorNames = result.indicators.map((i) => i.indicator);

    expect(indicatorNames).toContain("Below Poverty Threshold");
    expect(indicatorNames).toContain("Without Safe Water Source");
    expect(indicatorNames).toContain("Informal Settlers");
    expect(indicatorNames).toContain("Without Health Insurance");
    expect(indicatorNames).toContain("With Electricity");
    expect(indicatorNames).toContain("4Ps Beneficiaries");
    expect(indicatorNames).toContain("Senior Citizens");
    expect(indicatorNames).toContain("With Evacuation Plan");
    expect(indicatorNames).toContain("With Agricultural Land");
  });

  it("should have valid trend values", async () => {
    const result = await computeCBMSIndicators();
    const validTrends = ["improved", "worsened", "same", "no_baseline"];

    for (const ind of result.indicators) {
      expect(validTrends).toContain(ind.trend);
    }
  });

  it("should have surveyPct between 0 and 100", async () => {
    const result = await computeCBMSIndicators();
    for (const ind of result.indicators) {
      expect(ind.surveyPct).toBeGreaterThanOrEqual(0);
      expect(ind.surveyPct).toBeLessThanOrEqual(100);
    }
  });

  it("should have surveyCount not exceeding totalApprovedHouseholds", async () => {
    const result = await computeCBMSIndicators();
    for (const ind of result.indicators) {
      expect(ind.surveyCount).toBeGreaterThanOrEqual(0);
      expect(ind.surveyCount).toBeLessThanOrEqual(result.totalApprovedHouseholds);
    }
  });

  it("should have a valid computedAt timestamp", async () => {
    const result = await computeCBMSIndicators();
    expect(result.computedAt).toBeInstanceOf(Date);
    expect(result.computedAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("should count 4Ps beneficiaries correctly from household field", async () => {
    const result = await computeCBMSIndicators();
    const fourPs = result.indicators.find((i) => i.indicator === "4Ps Beneficiaries");
    expect(fourPs).toBeDefined();
    // Our test data has 1 approved household with fourPsBeneficiary = true
    expect(fourPs!.surveyCount).toBeGreaterThanOrEqual(1);
  });

  it("should count senior citizens correctly from household field", async () => {
    const result = await computeCBMSIndicators();
    const seniors = result.indicators.find((i) => i.indicator === "Senior Citizens");
    expect(seniors).toBeDefined();
    // Our test data has 1 approved household with seniorCitizen = true
    expect(seniors!.surveyCount).toBeGreaterThanOrEqual(1);
  });

  it("should correctly identify below poverty threshold households", async () => {
    const result = await computeCBMSIndicators();
    const poverty = result.indicators.find((i) => i.indicator === "Below Poverty Threshold");
    expect(poverty).toBeDefined();
    // CBMS-TEST-001 has income 5000 < 10481 threshold
    expect(poverty!.surveyCount).toBeGreaterThanOrEqual(1);
  });
});
