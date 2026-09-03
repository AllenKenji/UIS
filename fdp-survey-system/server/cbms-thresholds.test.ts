import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  seedDefaultThresholds,
  getThresholds,
  upsertThreshold,
  evaluateThresholdAlerts,
  DEFAULT_THRESHOLDS,
} from "./db";
import { getDb } from "./db";
import { cbmsThresholds } from "../drizzle/schema";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function cleanThresholds() {
  const db = await getDb();
  if (!db) return;
  await db.delete(cbmsThresholds);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("CBMS Threshold System", () => {
  beforeAll(async () => {
    await cleanThresholds();
  });

  afterAll(async () => {
    await cleanThresholds();
  });

  // ── seedDefaultThresholds ────────────────────────────────────────────────

  describe("seedDefaultThresholds", () => {
    it("should seed all default thresholds when table is empty", async () => {
      await seedDefaultThresholds();
      const rows = await getThresholds();
      expect(rows.length).toBe(DEFAULT_THRESHOLDS.length);
    });

    it("should not duplicate thresholds on repeated calls", async () => {
      await seedDefaultThresholds(); // second call
      const rows = await getThresholds();
      expect(rows.length).toBe(DEFAULT_THRESHOLDS.length);
    });

    it("should seed all expected indicator keys", async () => {
      const rows = await getThresholds();
      const keys = rows.map(r => r.indicatorKey);
      for (const t of DEFAULT_THRESHOLDS) {
        expect(keys).toContain(t.indicatorKey);
      }
    });

    it("should set isActive to true for all seeded thresholds", async () => {
      const rows = await getThresholds();
      for (const row of rows) {
        expect(row.isActive).toBe(true);
      }
    });
  });

  // ── getThresholds ────────────────────────────────────────────────────────

  describe("getThresholds", () => {
    it("should return rows with correct structure", async () => {
      const rows = await getThresholds();
      expect(rows.length).toBeGreaterThan(0);
      const first = rows[0];
      expect(first).toHaveProperty("id");
      expect(first).toHaveProperty("indicatorKey");
      expect(first).toHaveProperty("indicatorName");
      expect(first).toHaveProperty("baselinePct");
      expect(first).toHaveProperty("warnThresholdPct");
      expect(first).toHaveProperty("criticalThresholdPct");
      expect(first).toHaveProperty("isActive");
    });

    it("should return rows ordered by indicatorName", async () => {
      const rows = await getThresholds();
      const names = rows.map(r => r.indicatorName);
      const sorted = [...names].sort((a, b) => a.localeCompare(b));
      expect(names).toEqual(sorted);
    });
  });

  // ── upsertThreshold ──────────────────────────────────────────────────────

  describe("upsertThreshold", () => {
    it("should update warn and critical thresholds for an existing key", async () => {
      await upsertThreshold({
        indicatorKey: "belowPoverty",
        warnThresholdPct: 7.5,
        criticalThresholdPct: 15,
        isActive: true,
      });
      const rows = await getThresholds();
      const row = rows.find(r => r.indicatorKey === "belowPoverty");
      expect(row).toBeDefined();
      expect(parseFloat(row!.warnThresholdPct)).toBe(7.5);
      expect(parseFloat(row!.criticalThresholdPct)).toBe(15);
    });

    it("should allow disabling a threshold", async () => {
      await upsertThreshold({
        indicatorKey: "belowPoverty",
        warnThresholdPct: 7.5,
        criticalThresholdPct: 15,
        isActive: false,
      });
      const rows = await getThresholds();
      const row = rows.find(r => r.indicatorKey === "belowPoverty");
      expect(row?.isActive).toBe(false);
    });

    it("should re-enable a disabled threshold", async () => {
      await upsertThreshold({
        indicatorKey: "belowPoverty",
        warnThresholdPct: 5,
        criticalThresholdPct: 10,
        isActive: true,
      });
      const rows = await getThresholds();
      const row = rows.find(r => r.indicatorKey === "belowPoverty");
      expect(row?.isActive).toBe(true);
    });
  });

  // ── evaluateThresholdAlerts ──────────────────────────────────────────────

  describe("evaluateThresholdAlerts", () => {
    it("should return the correct structure", async () => {
      const result = await evaluateThresholdAlerts();
      expect(result).toHaveProperty("alerts");
      expect(result).toHaveProperty("totalActive");
      expect(result).toHaveProperty("warnings");
      expect(result).toHaveProperty("criticals");
      expect(result).toHaveProperty("computedAt");
      expect(Array.isArray(result.alerts)).toBe(true);
    });

    it("should have warnings + criticals equal to alerts.length", async () => {
      const result = await evaluateThresholdAlerts();
      expect(result.warnings + result.criticals).toBe(result.alerts.length);
    });

    it("should only include warning or critical alerts (no ok level)", async () => {
      const result = await evaluateThresholdAlerts();
      for (const alert of result.alerts) {
        expect(["warning", "critical"]).toContain(alert.level);
      }
    });

    it("should include required fields in each alert", async () => {
      const result = await evaluateThresholdAlerts();
      for (const alert of result.alerts) {
        expect(alert).toHaveProperty("indicatorKey");
        expect(alert).toHaveProperty("indicatorName");
        expect(alert).toHaveProperty("baselinePct");
        expect(alert).toHaveProperty("livePct");
        expect(alert).toHaveProperty("warnThresholdPct");
        expect(alert).toHaveProperty("criticalThresholdPct");
        expect(alert).toHaveProperty("deviation");
        expect(alert).toHaveProperty("level");
        expect(alert).toHaveProperty("message");
      }
    });

    it("should not include alerts for inactive thresholds", async () => {
      // Disable a single threshold to keep the test fast
      await upsertThreshold({
        indicatorKey: "belowPoverty",
        warnThresholdPct: 5,
        criticalThresholdPct: 10,
        isActive: false,
      });

      const rows = await getThresholds();
      const activeCount = rows.filter(r => r.isActive).length;
      const result = await evaluateThresholdAlerts();
      expect(result.totalActive).toBe(activeCount);

      // Re-enable
      await upsertThreshold({
        indicatorKey: "belowPoverty",
        warnThresholdPct: 5,
        criticalThresholdPct: 10,
        isActive: true,
      });
    }, 15000);

    it("should have a valid computedAt timestamp", async () => {
      const result = await evaluateThresholdAlerts();
      expect(result.computedAt).toBeInstanceOf(Date);
      expect(result.computedAt.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it("should have totalActive equal to number of active thresholds", async () => {
      const rows = await getThresholds();
      // Count active rows from the DB (isActive is stored as 0/1 in MySQL)
      const activeCount = rows.filter(r => r.isActive === true || (r.isActive as unknown as number) === 1).length;
      const result = await evaluateThresholdAlerts();
      expect(result.totalActive).toBe(activeCount);
    });
  });
});
