import { describe, it, expect, beforeAll } from "vitest";
import * as db from "./db";

describe("Custom Report Templates", () => {
  let testUserId: number;
  let testTemplateId: number;

  beforeAll(async () => {
    // Create a test user
    await db.upsertUser({
      openId: "test-user-report-templates",
      name: "Test User",
      email: "test@example.com",
      role: "admin",
    });

    const user = await db.getUserByOpenId("test-user-report-templates");
    if (!user) throw new Error("Failed to create test user");
    testUserId = user.id;
  });

  it("should create a custom report template", async () => {
    const template = await db.createReportTemplate({
      name: "Test Report Template",
      description: "A test template for unit testing",
      selectedFields: ["headOfFamily", "barangay", "age", "monthlyIncome"],
      filters: {
        barangay: ["Test Barangay"],
        minIncome: 5000,
        maxIncome: 20000,
      },
      createdBy: testUserId,
    });

    expect(template).toBeDefined();
    expect(template.name).toBe("Test Report Template");
    expect(template.selectedFields).toEqual(["headOfFamily", "barangay", "age", "monthlyIncome"]);
    expect(template.filters).toEqual({
      barangay: ["Test Barangay"],
      minIncome: 5000,
      maxIncome: 20000,
    });
    expect(template.createdBy).toBe(testUserId);

    testTemplateId = template.id;
  });

  it("should retrieve a template by ID", async () => {
    const template = await db.getReportTemplateById(testTemplateId);

    expect(template).toBeDefined();
    expect(template?.name).toBe("Test Report Template");
    expect(template?.selectedFields).toEqual(["headOfFamily", "barangay", "age", "monthlyIncome"]);
  });

  it("should retrieve all templates for a user", async () => {
    // Create another template
    await db.createReportTemplate({
      name: "Second Test Template",
      description: "Another test template",
      selectedFields: ["headOfFamily", "status"],
      filters: {
        status: ["approved"],
      },
      createdBy: testUserId,
    });

    const templates = await db.getReportTemplatesByUser(testUserId);

    expect(templates).toBeDefined();
    expect(templates.length).toBeGreaterThanOrEqual(2);
    expect(templates.some(t => t.name === "Test Report Template")).toBe(true);
    expect(templates.some(t => t.name === "Second Test Template")).toBe(true);
  });

  it("should update a template", async () => {
    const updated = await db.updateReportTemplate(testTemplateId, {
      name: "Updated Test Template",
      description: "Updated description",
      selectedFields: ["headOfFamily", "barangay", "status"],
    });

    expect(updated).toBeDefined();
    expect(updated.name).toBe("Updated Test Template");
    expect(updated.description).toBe("Updated description");
    expect(updated.selectedFields).toEqual(["headOfFamily", "barangay", "status"]);
  });

  it("should filter households by barangay", async () => {
    // Create test households
    const household1 = await db.createHousehold({
      barangay: "Barangay A",
      municipality: "Test Municipality",
      province: "Parañaque",
      headOfFamily: "Test Family A",
      age: 35,
      monthlyIncome: "10000",
      status: "approved",
    });

    const household2 = await db.createHousehold({
      barangay: "Barangay B",
      municipality: "Test Municipality",
      province: "Parañaque",
      headOfFamily: "Test Family B",
      age: 40,
      monthlyIncome: "15000",
      status: "submitted",
    });

    const filtered = await db.getFilteredHouseholds({
      barangay: ["Barangay A"],
    });

    expect(filtered).toBeDefined();
    expect(filtered.some(h => h.id === household1.id)).toBe(true);
    expect(filtered.some(h => h.id === household2.id)).toBe(false);

    // Cleanup
    await db.deleteHousehold(household1.id);
    await db.deleteHousehold(household2.id);
  });

  it("should filter households by income range", async () => {
    const household1 = await db.createHousehold({
      barangay: "Test Barangay",
      municipality: "Test Municipality",
      province: "Parañaque",
      headOfFamily: "Low Income Family",
      age: 30,
      monthlyIncome: "3000",
      status: "approved",
    });

    const household2 = await db.createHousehold({
      barangay: "Test Barangay",
      municipality: "Test Municipality",
      province: "Parañaque",
      headOfFamily: "High Income Family",
      age: 45,
      monthlyIncome: "50000",
      status: "approved",
    });

    const filtered = await db.getFilteredHouseholds({
      minIncome: 5000,
      maxIncome: 20000,
    });

    expect(filtered).toBeDefined();
    expect(filtered.some(h => h.id === household1.id)).toBe(false);
    expect(filtered.some(h => h.id === household2.id)).toBe(false);

    // Cleanup
    await db.deleteHousehold(household1.id);
    await db.deleteHousehold(household2.id);
  });

  it("should filter households by age range", async () => {
    const household1 = await db.createHousehold({
      barangay: "Test Barangay",
      municipality: "Test Municipality",
      province: "Parañaque",
      headOfFamily: "Young Family",
      age: 25,
      monthlyIncome: "10000",
      status: "approved",
    });

    const household2 = await db.createHousehold({
      barangay: "Test Barangay",
      municipality: "Test Municipality",
      province: "Parañaque",
      headOfFamily: "Senior Family",
      age: 65,
      monthlyIncome: "10000",
      status: "approved",
    });

    const filtered = await db.getFilteredHouseholds({
      minAge: 30,
      maxAge: 60,
    });

    expect(filtered).toBeDefined();
    expect(filtered.some(h => h.id === household1.id)).toBe(false);
    expect(filtered.some(h => h.id === household2.id)).toBe(false);

    // Cleanup
    await db.deleteHousehold(household1.id);
    await db.deleteHousehold(household2.id);
  });

  it("should filter households by program enrollment", async () => {
    const household1 = await db.createHousehold({
      barangay: "Test Barangay",
      municipality: "Test Municipality",
      province: "Parañaque",
      headOfFamily: "4Ps Family",
      age: 35,
      monthlyIncome: "8000",
      fourPsBeneficiary: true,
      status: "approved",
    });

    const household2 = await db.createHousehold({
      barangay: "Test Barangay",
      municipality: "Test Municipality",
      province: "Parañaque",
      headOfFamily: "Non-4Ps Family",
      age: 40,
      monthlyIncome: "12000",
      fourPsBeneficiary: false,
      status: "approved",
    });

    const filtered = await db.getFilteredHouseholds({
      fourPsBeneficiary: true,
    });

    expect(filtered).toBeDefined();
    expect(filtered.some(h => h.id === household1.id)).toBe(true);
    expect(filtered.some(h => h.id === household2.id)).toBe(false);

    // Cleanup
    await db.deleteHousehold(household1.id);
    await db.deleteHousehold(household2.id);
  });

  it("should filter households by status", async () => {
    const household1 = await db.createHousehold({
      barangay: "Test Barangay",
      municipality: "Test Municipality",
      province: "Parañaque",
      headOfFamily: "Approved Family",
      age: 35,
      monthlyIncome: "10000",
      status: "approved",
    });

    const household2 = await db.createHousehold({
      barangay: "Test Barangay",
      municipality: "Test Municipality",
      province: "Parañaque",
      headOfFamily: "Submitted Family",
      age: 40,
      monthlyIncome: "12000",
      status: "submitted",
    });

    const filtered = await db.getFilteredHouseholds({
      status: ["approved"],
    });

    expect(filtered).toBeDefined();
    expect(filtered.some(h => h.id === household1.id)).toBe(true);
    expect(filtered.some(h => h.id === household2.id)).toBe(false);

    // Cleanup
    await db.deleteHousehold(household1.id);
    await db.deleteHousehold(household2.id);
  });

  it("should apply multiple filters simultaneously", async () => {
    const household1 = await db.createHousehold({
      barangay: "Target Barangay",
      municipality: "Test Municipality",
      province: "Parañaque",
      headOfFamily: "Matching Family",
      age: 35,
      monthlyIncome: "10000",
      fourPsBeneficiary: true,
      status: "approved",
    });

    const household2 = await db.createHousehold({
      barangay: "Other Barangay",
      municipality: "Test Municipality",
      province: "Parañaque",
      headOfFamily: "Non-Matching Family",
      age: 35,
      monthlyIncome: "10000",
      fourPsBeneficiary: true,
      status: "approved",
    });

    const filtered = await db.getFilteredHouseholds({
      barangay: ["Target Barangay"],
      fourPsBeneficiary: true,
      status: ["approved"],
    });

    expect(filtered).toBeDefined();
    expect(filtered.some(h => h.id === household1.id)).toBe(true);
    expect(filtered.some(h => h.id === household2.id)).toBe(false);

    // Cleanup
    await db.deleteHousehold(household1.id);
    await db.deleteHousehold(household2.id);
  });

  it("should delete a template", async () => {
    await db.deleteReportTemplate(testTemplateId);

    const template = await db.getReportTemplateById(testTemplateId);
    expect(template).toBeUndefined();
  });
});
