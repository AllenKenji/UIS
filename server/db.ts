import { eq, desc, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { InsertUser, users, households, surveyResponses, InsertHousehold, InsertSurveyResponse, Household, SurveyResponse, exportLayouts, InsertExportLayout, ExportLayout, reportDrafts, InsertReportDraft, ReportDraft, draftComments, InsertDraftComment, DraftComment, InsertLocalAuthCredential, localAuthCredentials } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: Pool | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
      });
      _db = drizzle(_pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
      _pool = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod", "municipality", "barangay"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getLocalCredentialByUsername(username: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get local credential: database not available");
    return undefined;
  }

  const normalized = username.trim().toLowerCase();
  let result;
  try {
    result = await db
      .select()
      .from(localAuthCredentials)
      .where(eq(localAuthCredentials.username, normalized))
      .limit(1);
  } catch (error: any) {
    const code = error?.cause?.code;
    if (code === "ER_NO_SUCH_TABLE" || code === "42P01") {
      console.warn("[LocalAuth] localAuthCredentials table is missing. Run database migrations (pnpm db:push).");
      return undefined;
    }
    throw error;
  }

  return result.length > 0 ? result[0] : undefined;
}

export async function hasLocalAuthSchema(): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    return false;
  }

  try {
    await db.select({ ok: sql<number>`1` }).from(localAuthCredentials).limit(1);
    return true;
  } catch (error: any) {
    const code = error?.cause?.code;
    if (code === "ER_NO_SUCH_TABLE" || code === "42P01") {
      return false;
    }
    throw error;
  }
}

export async function upsertLocalCredential(credential: InsertLocalAuthCredential): Promise<void> {
  if (!credential.userId) {
    throw new Error("userId is required for local credential upsert");
  }

  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db.insert(localAuthCredentials).values({
    ...credential,
    username: credential.username.trim().toLowerCase(),
  }).onConflictDoUpdate({
    target: localAuthCredentials.userId,
    set: {
      username: credential.username.trim().toLowerCase(),
      passwordHash: credential.passwordHash,
      salt: credential.salt,
      isActive: credential.isActive ?? true,
    },
  });
}

export async function updateLocalCredentialPasswordByUserId(
  userId: number,
  passwordHash: string,
  salt: string
): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db
    .update(localAuthCredentials)
    .set({
      passwordHash,
      salt,
    })
    .where(eq(localAuthCredentials.userId, userId));
}

export async function setLocalCredentialActiveByUserId(
  userId: number,
  isActive: boolean
): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db
    .update(localAuthCredentials)
    .set({
      isActive,
    })
    .where(eq(localAuthCredentials.userId, userId));
}

export async function updateLocalCredentialUsernameByUserId(
  userId: number,
  username: string
): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db
    .update(localAuthCredentials)
    .set({
      username: username.trim().toLowerCase(),
    })
    .where(eq(localAuthCredentials.userId, userId));
}

export async function updateUserProfileById(
  userId: number,
  updates: { name: string; email: string | null; role: "admin" | "surveyor" | "supervisor" | "user" }
): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db
    .update(users)
    .set({
      name: updates.name,
      email: updates.email,
      role: updates.role,
    })
    .where(eq(users.id, userId));
}

/** Self-service: a surveyor sets the city/barangay they operate in once
 * (Settings page), which then auto-fills Section A on every survey they
 * submit — see routers.ts's user.updateLocation and SurveyForm.tsx. */
export async function updateUserLocation(
  userId: number,
  updates: { municipality: string; barangay: string }
): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db
    .update(users)
    .set({
      municipality: updates.municipality,
      barangay: updates.barangay,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function listLocalAuthUsers() {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  return await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      openId: users.openId,
      loginMethod: users.loginMethod,
      lastSignedIn: users.lastSignedIn,
      credentialId: localAuthCredentials.id,
      username: localAuthCredentials.username,
      isActive: localAuthCredentials.isActive,
      credentialCreatedAt: localAuthCredentials.createdAt,
    })
    .from(users)
    .innerJoin(localAuthCredentials, eq(localAuthCredentials.userId, users.id))
    .orderBy(desc(users.createdAt));
}

export async function deleteLocalAuthUserById(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db.delete(users).where(eq(users.id, userId));
}

// Household operations
export async function createHousehold(household: InsertHousehold): Promise<Household> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const [inserted] = await db.insert(households).values(household).returning();
  return inserted!;
}

export async function getHouseholdById(id: number): Promise<Household | undefined> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const result = await db.select().from(households).where(eq(households.id, id)).limit(1);
  return result[0];
}

export async function getAllHouseholds(): Promise<Household[]> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  return await db.select().from(households).orderBy(desc(households.createdAt));
}

export async function searchHouseholds(query: string): Promise<Household[]> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const searchPattern = `%${query}%`;
  return await db
    .select()
    .from(households)
    .where(
      or(
        like(households.headOfFamily, searchPattern),
        like(households.barangay, searchPattern),
        like(households.municipality, searchPattern),
        like(households.occupation, searchPattern),
        like(households.civilStatus, searchPattern),
        like(households.education, searchPattern)
      )
    )
    .orderBy(desc(households.createdAt));
}

export async function getHouseholdsByBarangay(barangay: string): Promise<Household[]> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  return await db
    .select()
    .from(households)
    .where(eq(households.barangay, barangay))
    .orderBy(desc(households.createdAt));
}

export async function updateHousehold(id: number, updates: Partial<InsertHousehold>): Promise<Household> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db.update(households).set(updates).where(eq(households.id, id));
  
  const updated = await db.select().from(households).where(eq(households.id, id)).limit(1);
  return updated[0]!;
}

export async function deleteHousehold(id: number): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db.delete(households).where(eq(households.id, id));
}

// Survey response operations
export async function createSurveyResponse(response: InsertSurveyResponse): Promise<SurveyResponse> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const [inserted] = await db.insert(surveyResponses).values(response).returning();
  return inserted!;
}

export async function getSurveyResponseByHouseholdId(householdId: number): Promise<SurveyResponse | undefined> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const result = await db
    .select()
    .from(surveyResponses)
    .where(eq(surveyResponses.householdId, householdId))
    .limit(1);
  
  return result[0];
}

export async function updateSurveyResponse(id: number, updates: Partial<InsertSurveyResponse>): Promise<SurveyResponse> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db.update(surveyResponses).set(updates).where(eq(surveyResponses.id, id));
  
  const updated = await db.select().from(surveyResponses).where(eq(surveyResponses.id, id)).limit(1);
  return updated[0]!;
}

export async function deleteSurveyResponse(id: number): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db.delete(surveyResponses).where(eq(surveyResponses.id, id));
}

// Statistics operations
export async function getHouseholdStatistics() {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const totalHouseholds = await db.select({ count: sql<number>`count(*)` }).from(households);
  const fourPsCount = await db.select({ count: sql<number>`count(*)` }).from(households).where(eq(households.fourPsBeneficiary, true));
  
  return {
    totalHouseholds: Number(totalHouseholds[0]?.count || 0),
    fourPsBeneficiaries: Number(fourPsCount[0]?.count || 0),
  };
}

export async function getBarangayList(): Promise<string[]> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const result = await db
    .selectDistinct({ barangay: households.barangay })
    .from(households)
    .orderBy(households.barangay);
  
  return result.map(r => r.barangay);
}

export async function getIncomeDistribution() {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const allHouseholds = await db.select().from(households);
  
  // Define income ranges
  const ranges = [
    { name: "< 5k", min: 0, max: 5000, value: 0 },
    { name: "5k-10k", min: 5000, max: 10000, value: 0 },
    { name: "10k-20k", min: 10000, max: 20000, value: 0 },
    { name: "20k-50k", min: 20000, max: 50000, value: 0 },
    { name: "> 50k", min: 50000, max: Infinity, value: 0 },
  ];

  // Count households in each range
  allHouseholds.forEach(household => {
    const income = household.monthlyIncome ? parseFloat(household.monthlyIncome) : 0;
    for (const range of ranges) {
      if (income >= range.min && income < range.max) {
        range.value++;
        break;
      }
    }
  });

  return ranges;
}

export async function getBarangayPerformance() {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const allHouseholds = await db.select().from(households);

  // Group households by barangay
  const barangayMap = new Map<string, {
    totalSurveys: number;
    completeSurveys: number;
    errorSurveys: number;
  }>();

  allHouseholds.forEach(household => {
    const barangay = household.barangay;
    if (!barangayMap.has(barangay)) {
      barangayMap.set(barangay, { totalSurveys: 0, completeSurveys: 0, errorSurveys: 0 });
    }
    const stats = barangayMap.get(barangay)!;
    stats.totalSurveys++;

    // Check if survey is complete (has all required fields)
    const isComplete = !!
      household.headOfFamily &&
      household.barangay &&
      household.municipality &&
      household.age &&
      household.civilStatus &&
      household.occupation;
    
    if (isComplete) {
      stats.completeSurveys++;
    }

    // Check for data quality issues (errors)
    const hasError = 
      !household.headOfFamily ||
      !household.barangay ||
      (household.monthlyIncome && parseFloat(household.monthlyIncome) > 200000) ||
      (household.monthlyIncome && parseFloat(household.monthlyIncome) < 0);
    
    if (hasError) {
      stats.errorSurveys++;
    }
  });

  // Calculate metrics for each barangay
  const performance = Array.from(barangayMap.entries()).map(([barangay, stats]) => {
    const completionRate = stats.totalSurveys > 0
      ? Math.round((stats.completeSurveys / stats.totalSurveys) * 100)
      : 0;
    
    const errorRate = stats.totalSurveys > 0
      ? Math.round((stats.errorSurveys / stats.totalSurveys) * 100)
      : 0;
    
    // Quality score: weighted average of completion rate and inverse error rate
    const qualityScore = Math.round(
      (completionRate * 0.6) + ((100 - errorRate) * 0.4)
    );

    return {
      barangay,
      totalSurveys: stats.totalSurveys,
      completionRate,
      errorRate,
      qualityScore,
    };
  });

  return performance;
}

// Status workflow operations
export async function updateHouseholdStatus(
  id: number,
  status: "draft" | "submitted" | "approved" | "returned",
  reviewedBy: number,
  returnReason?: string
): Promise<Household> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const updates: Partial<InsertHousehold> & { reviewedBy?: number; reviewedAt?: Date; returnReason?: string | null } = {
    status,
    reviewedBy,
    reviewedAt: new Date(),
  };

  if (status === "returned" && returnReason) {
    updates.returnReason = returnReason;
  } else if (status === "approved") {
    updates.returnReason = null; // Clear return reason on approval
  }

  await db.update(households).set(updates).where(eq(households.id, id));
  
  const updated = await db.select().from(households).where(eq(households.id, id)).limit(1);
  return updated[0]!;
}

export async function getHouseholdStatusHistory(id: number) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const household = await db.select().from(households).where(eq(households.id, id)).limit(1);
  
  if (!household[0]) {
    return [];
  }

  const h = household[0];
  const history: Array<{
    date: Date;
    status: string;
    action: string;
    user: string;
    details?: string;
  }> = [];

  // Initial submission
  history.push({
    date: h.surveyedAt,
    status: "submitted",
    action: "Survey Submitted",
    user: "Surveyor",
    details: `Initial survey submission by surveyor`,
  });

  // Status changes
  if (h.status === "approved" && h.reviewedAt) {
    history.push({
      date: h.reviewedAt,
      status: "approved",
      action: "Survey Approved",
      user: "Supervisor",
      details: "Survey data validated and approved",
    });
  } else if (h.status === "returned" && h.reviewedAt) {
    history.push({
      date: h.reviewedAt,
      status: "returned",
      action: "Survey Returned",
      user: "Supervisor",
      details: h.returnReason || "Survey returned for corrections",
    });
  }

  return history.sort((a, b) => b.date.getTime() - a.date.getTime());
}

// Status statistics operations
export async function getStatusStatistics() {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const allHouseholds = await db.select().from(households);

  const stats = {
    total: allHouseholds.length,
    draft: allHouseholds.filter(h => h.status === "draft").length,
    submitted: allHouseholds.filter(h => h.status === "submitted").length,
    approved: allHouseholds.filter(h => h.status === "approved").length,
    returned: allHouseholds.filter(h => h.status === "returned").length,
  };

  // Calculate approval rate
  const totalReviewed = stats.approved + stats.returned;
  const approvalRate = totalReviewed > 0 
    ? Math.round((stats.approved / totalReviewed) * 100) 
    : 0;

  return {
    ...stats,
    approvalRate,
    pendingReview: stats.submitted,
  };
}

export async function getApprovalTrends() {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const allHouseholds = await db.select().from(households);

  // Group by month for the last 6 months
  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const monthlyData: Record<string, { approved: number; returned: number; submitted: number }> = {};

  // Initialize months
  for (let i = 0; i < 6; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    monthlyData[monthKey] = { approved: 0, returned: 0, submitted: 0 };
  }

  // Count surveys by status and month
  allHouseholds.forEach(household => {
    const reviewDate = household.reviewedAt || household.createdAt;
    if (reviewDate >= sixMonthsAgo) {
      const monthKey = new Date(reviewDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      if (monthlyData[monthKey]) {
        if (household.status === "approved") {
          monthlyData[monthKey].approved++;
        } else if (household.status === "returned") {
          monthlyData[monthKey].returned++;
        } else if (household.status === "submitted") {
          monthlyData[monthKey].submitted++;
        }
      }
    }
  });

  // Convert to array and calculate approval rates
  const trends = Object.entries(monthlyData)
    .map(([month, data]) => {
      const totalReviewed = data.approved + data.returned;
      const approvalRate = totalReviewed > 0 
        ? Math.round((data.approved / totalReviewed) * 100) 
        : 0;
      
      return {
        month,
        monthDate: new Date(month), // Add date for sorting
        approved: data.approved,
        returned: data.returned,
        submitted: data.submitted,
        approvalRate,
      };
    })
    .sort((a, b) => b.monthDate.getTime() - a.monthDate.getTime()) // Sort by date descending
    .map(({ monthDate, ...rest }) => rest); // Remove the temporary date field

  return trends;
}

export async function getAverageReviewTime() {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const reviewedHouseholds = await db
    .select()
    .from(households)
    .where(sql`${households.reviewedAt} IS NOT NULL`);

  if (reviewedHouseholds.length === 0) {
    return 0;
  }

  const totalHours = reviewedHouseholds.reduce((sum, household) => {
    const submittedAt = new Date(household.surveyedAt).getTime();
    const reviewedAt = new Date(household.reviewedAt!).getTime();
    const hours = (reviewedAt - submittedAt) / (1000 * 60 * 60);
    return sum + hours;
  }, 0);

  return Math.round(totalHours / reviewedHouseholds.length);
}

// ==================== Custom Report Templates ====================

import { reportTemplates } from "../drizzle/schema";
import { and, gte, lte, inArray } from "drizzle-orm";

export async function createReportTemplate(data: {
  name: string;
  description?: string;
  selectedFields: string[];
  filters: any;
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const [inserted] = await db.insert(reportTemplates).values(data).returning();
  return inserted!;
}

export async function getReportTemplateById(id: number) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const [template] = await db.select().from(reportTemplates).where(eq(reportTemplates.id, id));
  return template;
}

export async function getReportTemplatesByUser(userId: number) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  return db.select().from(reportTemplates).where(eq(reportTemplates.createdBy, userId)).orderBy(desc(reportTemplates.createdAt));
}

export async function updateReportTemplate(id: number, data: {
  name?: string;
  description?: string;
  selectedFields?: string[];
  filters?: any;
}) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db.update(reportTemplates).set(data).where(eq(reportTemplates.id, id));
  
  const updated = await db.select().from(reportTemplates).where(eq(reportTemplates.id, id)).limit(1);
  return updated[0]!;
}

export async function deleteReportTemplate(id: number) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db.delete(reportTemplates).where(eq(reportTemplates.id, id));
}

export async function getFilteredHouseholds(filters: {
  barangay?: string[];
  municipality?: string[];
  status?: string[];
  dateFrom?: string;
  dateTo?: string;
  minIncome?: number;
  maxIncome?: number;
  minAge?: number;
  maxAge?: number;
  fourPsBeneficiary?: boolean;
  tupadBeneficiary?: boolean;
  seniorCitizen?: boolean;
  pwdMember?: boolean;
  indigenousPeople?: boolean;
}) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const conditions: any[] = [];
  
  if (filters.barangay && filters.barangay.length > 0) {
    conditions.push(inArray(households.barangay, filters.barangay));
  }
  
  if (filters.municipality && filters.municipality.length > 0) {
    conditions.push(inArray(households.municipality, filters.municipality));
  }
  
  if (filters.status && filters.status.length > 0) {
    conditions.push(inArray(households.status, filters.status as any));
  }
  
  if (filters.dateFrom) {
    conditions.push(gte(households.createdAt, new Date(filters.dateFrom)));
  }
  
  if (filters.dateTo) {
    conditions.push(lte(households.createdAt, new Date(filters.dateTo)));
  }
  
  if (filters.minIncome !== undefined) {
    conditions.push(gte(households.monthlyIncome, filters.minIncome.toString()));
  }
  
  if (filters.maxIncome !== undefined) {
    conditions.push(lte(households.monthlyIncome, filters.maxIncome.toString()));
  }
  
  if (filters.minAge !== undefined) {
    conditions.push(gte(households.age, filters.minAge));
  }
  
  if (filters.maxAge !== undefined) {
    conditions.push(lte(households.age, filters.maxAge));
  }
  
  if (filters.fourPsBeneficiary !== undefined) {
    conditions.push(eq(households.fourPsBeneficiary, filters.fourPsBeneficiary));
  }
  
  if (filters.tupadBeneficiary !== undefined) {
    conditions.push(eq(households.tupadBeneficiary, filters.tupadBeneficiary));
  }
  
  if (filters.seniorCitizen !== undefined) {
    conditions.push(eq(households.seniorCitizen, filters.seniorCitizen));
  }
  
  if (filters.pwdMember !== undefined) {
    conditions.push(eq(households.pwdMember, filters.pwdMember));
  }
  
  if (filters.indigenousPeople !== undefined) {
    conditions.push(eq(households.indigenousPeople, filters.indigenousPeople));
  }
  
  if (conditions.length > 0) {
    return db.select().from(households).where(and(...conditions));
  }
  
  return db.select().from(households);
}

// ============================================================================
// Custom Export Layouts
// ============================================================================

export async function createExportLayout(data: InsertExportLayout): Promise<ExportLayout> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const [inserted] = await db.insert(exportLayouts).values(data).returning();
  return inserted!;
}

export async function getExportLayouts(userId: number): Promise<ExportLayout[]> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  return await db
    .select()
    .from(exportLayouts)
    .where(eq(exportLayouts.createdBy, userId))
    .orderBy(desc(exportLayouts.createdAt));
}

export async function getExportLayoutById(id: number, userId: number): Promise<ExportLayout | undefined> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const [layout] = await db
    .select()
    .from(exportLayouts)
    .where(and(eq(exportLayouts.id, id), eq(exportLayouts.createdBy, userId)));
  return layout;
}

export async function updateExportLayout(
  id: number,
  userId: number,
  data: Partial<InsertExportLayout>
): Promise<ExportLayout> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db
    .update(exportLayouts)
    .set(data)
    .where(and(eq(exportLayouts.id, id), eq(exportLayouts.createdBy, userId)));

  const updated = await db.select().from(exportLayouts).where(eq(exportLayouts.id, id)).limit(1);
  return updated[0]!;
}

export async function deleteExportLayout(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db
    .delete(exportLayouts)
    .where(and(eq(exportLayouts.id, id), eq(exportLayouts.createdBy, userId)));
}


// ============================================================================
// Report Drafts
// ============================================================================

export async function createReportDraft(data: {
  name: string;
  description?: string;
  shareToken: string;
  selectedFields: string[];
  filters?: any;
  exportLayout: string;
  customLayoutId?: number;
  isPublic?: boolean;
  createdBy: number;
}): Promise<ReportDraft> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const [inserted] = await db.insert(reportDrafts).values(data).returning();
  return inserted!;
}

export async function getReportDrafts(userId: number): Promise<ReportDraft[]> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  return db.select().from(reportDrafts)
    .where(eq(reportDrafts.createdBy, userId))
    .orderBy(desc(reportDrafts.createdAt));
}

export async function getReportDraftById(id: number, userId: number): Promise<ReportDraft | undefined> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const [draft] = await db.select().from(reportDrafts)
    .where(and(
      eq(reportDrafts.id, id),
      eq(reportDrafts.createdBy, userId)
    ));
  return draft;
}

export async function getReportDraftByToken(token: string): Promise<ReportDraft | undefined> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const [draft] = await db.select().from(reportDrafts)
    .where(eq(reportDrafts.shareToken, token));
  
  if (draft) {
    // Increment view count and update lastViewedAt
    await db.update(reportDrafts)
      .set({ 
        viewCount: draft.viewCount + 1,
        lastViewedAt: new Date()
      })
      .where(eq(reportDrafts.id, draft.id));
    
    // Return updated draft
    const [updatedDraft] = await db.select().from(reportDrafts)
      .where(eq(reportDrafts.id, draft.id));
    return updatedDraft;
  }
  
  return draft;
}

export async function updateReportDraft(
  id: number,
  userId: number,
  data: {
    name?: string;
    description?: string;
    selectedFields?: string[];
    filters?: any;
    exportLayout?: string;
    customLayoutId?: number;
    isPublic?: boolean;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db.update(reportDrafts)
    .set(data)
    .where(and(
      eq(reportDrafts.id, id),
      eq(reportDrafts.createdBy, userId)
    ));
}

export async function deleteReportDraft(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db.delete(reportDrafts)
    .where(and(
      eq(reportDrafts.id, id),
      eq(reportDrafts.createdBy, userId)
    ));
}

// ============================================================================
// Draft Comments
// ============================================================================

export async function createDraftComment(data: InsertDraftComment): Promise<DraftComment> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const [comment] = await db.insert(draftComments).values(data).returning();
  return comment;
}

export async function getDraftComments(draftId: number): Promise<(DraftComment & { authorName: string | null })[]> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const comments = await db
    .select({
      id: draftComments.id,
      draftId: draftComments.draftId,
      content: draftComments.content,
      authorId: draftComments.authorId,
      authorName: users.name,
      createdAt: draftComments.createdAt,
      updatedAt: draftComments.updatedAt,
    })
    .from(draftComments)
    .leftJoin(users, eq(draftComments.authorId, users.id))
    .where(eq(draftComments.draftId, draftId))
    .orderBy(draftComments.createdAt);
  
  return comments;
}

export async function updateDraftComment(
  id: number,
  authorId: number,
  content: string
): Promise<DraftComment | undefined> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const result = await db.update(draftComments)
    .set({ content })
    .where(sql`${draftComments.id} = ${id} AND ${draftComments.authorId} = ${authorId}`);
  
  // Only return the comment if the update was successful
  if (result[0].affectedRows === 0) {
    return undefined;
  }
  
  const [comment] = await db.select().from(draftComments)
    .where(eq(draftComments.id, id));
  
  return comment;
}

export async function deleteDraftComment(id: number, authorId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const result = await db.delete(draftComments)
    .where(sql`${draftComments.id} = ${id} AND ${draftComments.authorId} = ${authorId}`);
  
  return result[0].affectedRows > 0;
}

// ============================================================================
// CBMS 13+1 Core Indicators — Dynamic Computation from Survey Data
// ============================================================================

// CBMS baseline figures from Barangay Magsaysay PPTX presentation
export const CBMS_BASELINE = {
  totalHouseholds: 3141,
  totalPopulation: 10137,
  // Indicator 1: Survival
  infantMortalityRate: 0,          // per 1,000 live births
  // Indicator 2: Nutrition
  malnourishedChildren: 17,        // count 0-5 yrs
  malnourishedPct: 1.6,
  // Indicator 3: Health
  withPhilHealth: 1853,
  withPhilHealthPct: 59.0,
  withoutHealthInsurance: 1288,
  withoutHealthInsurancePct: 41.0,
  // Indicator 4: Water & Sanitation
  withSafeWater: 2198,
  withSafeWaterPct: 70.0,
  withoutSafeWater: 943,
  withoutSafeWaterPct: 30.0,
  withSanitaryToilet: 2755,
  withSanitaryToiletPct: 87.71,
  // Indicator 5: Shelter
  informalSettlers: 1053,
  informalSettlersPct: 33.52,
  // Indicator 6: Peace & Order
  crimeVictims: 0,
  // Indicator 7: Income
  belowPovertyThreshold: 695,
  belowPovertyPct: 22.13,
  belowFoodThreshold: 0,
  // Indicator 8: Employment
  unemployed: 0,
  // Indicator 9: Education
  outOfSchool6to11: 0,
  outOfSchool12to15: 131,
  outOfSchool12to15Pct: 17.10,
  // Indicator 10: Social Protection
  fourPsBeneficiaries: 0,
  seniorCitizens: 147,
  soloParents: 401,
  pwd: 0,
  // Indicator 11: Electricity
  withElectricity: 3035,
  withElectricityPct: 96.63,
  // Indicator 12: Disaster Preparedness
  withEvacuationPlan: 0,
  // Indicator 13: Agricultural
  withAgriculturalLand: 0,
  // Civic Participation: Registered Voters (from COMELEC baseline)
  registeredVoters: 6445,
  eligibleVoters: 6937,       // total population 18+ years old
  registeredVotersPct: 92.91,
  // Poverty threshold (monthly income in PHP)
  povertyThreshold: 10481,
};

export type CBMSIndicatorResult = {
  indicator: string;
  category: string;
  surveyCount: number;
  surveyPct: number;
  baselineCount: number;
  baselinePct: number;
  totalSurveyed: number;
  trend: "improved" | "worsened" | "same" | "no_baseline";
  trendDiff: number; // positive = worsened (more affected), negative = improved
};

export type CBMSSummary = {
  totalApprovedHouseholds: number;
  totalMembers: number;
  totalMale: number;
  totalFemale: number;

  // Demographic age group breakdowns (member counts)
  demography: {
    under1: number;
    under5: number;
    age0to5: number;
    age6to11: number;
    age6to12: number;
    age12to15: number;
    age13to16: number;
    age6to15: number;
    age6to16: number;
    age10plus: number;
    laborForce: number;  // 15–64 years old
  };

  // Health indicators
  health: {
    childMortality: number;       // households with child death under 5
    maternalMortality: number;    // households with maternal death
    malnourishedChildren: number; // children 0–5 malnourished
    withPhilHealth: number;
    withoutHealthInsurance: number;
  };

  // Housing indicators
  housing: {
    makeshiftHousing: number;     // households with makeshift roof or wall
    informalSettlers: number;
    bothMakeshiftAndInformal: number;
  };

  // Water & sanitation
  water: {
    withoutSafeWater: number;
    withoutSanitaryToilet: number;
  };

  // Education indicators
  education: {
    outOfSchool6to11: number;     // children 6–11 not in elementary
    outOfSchool12to15: number;    // youth 12–15 not in high school
    outOfSchool6to15: number;     // combined 6–15 not in school
    illiterate10plus: number;     // illiterate members 10+
  };

  // Income & livelihood
  income: {
    belowPoverty: number;
    belowFoodThreshold: number;
    experiencedFoodShortage: number;
    unemployed: number;           // members of labor force who are unemployed
    soloParents: number;
    fourPsBeneficiaries: number;
  };

  // Peace & order
  peaceAndOrder: {
    victimHouseholds: number;
    totalVictims: number;
    maleVictims: number;
    femaleVictims: number;
    crimeTypeBreakdown: Record<string, number>;  // count per crime type
    crimeReportedCount: number;                  // households that reported the crime
    crimeReportingRate: number;                  // % of victim households that reported
    barangayCrimeData: Array<{                   // per-barangay crime breakdown
      barangay: string;
      totalHouseholds: number;
      victimHouseholds: number;
      victimRate: number;                        // % of households that are victims
      totalVictims: number;
      maleVictims: number;
      femaleVictims: number;
      crimeTypes: string[];                      // distinct crime types reported
    }>;
  };

  // Other indicators
  other: {
    withElectricity: number;
    pwdCount: number;
    seniorCitizens: number;
    withEvacuationPlan: number;
    withAgriculturalLand: number;
  };

  eligibleVoterCount: number;    // members aged 18+ across all approved households
  registeredVoterCount: number;  // members marked as registered voters
  computedAt: Date;
  indicators: CBMSIndicatorResult[];

  // Per-barangay breakdowns for Demography, Health, Housing tabs
  barangayBreakdowns: Array<{
    barangay: string;
    totalHouseholds: number;
    totalMembers: number;
    totalMale: number;
    totalFemale: number;
    // Demography
    under5: number;
    age6to11: number;
    age12to15: number;
    laborForce: number;
    seniorCitizens: number;
    // Health
    childMortality: number;
    maternalMortality: number;
    malnourishedChildren: number;
    withPhilHealth: number;
    withoutHealthInsurance: number;
    // Housing
    makeshiftHousing: number;
    informalSettlers: number;
    // Water
    withoutSafeWater: number;
    withoutSanitaryToilet: number;
    // Education
    outOfSchool6to11: number;
    outOfSchool12to15: number;
    // Income
    belowPoverty: number;
    belowFoodThreshold: number;
    foodShortage: number;
    unemployed: number;
    soloParents: number;
    fourPsBeneficiaries: number;
    // Other
    withElectricity: number;
    pwdCount: number;
    withEvacuationPlan: number;
    withAgriculturalLand: number;
    registeredVoters: number;
    eligibleVoters: number;
  }>;
};

/**
 * Compute CBMS 13+1 Core Indicators dynamically from approved survey data.
 * Maps survey fields to each CBMS indicator and compares against PPTX baseline.
 */
export async function computeCBMSIndicators(): Promise<CBMSSummary> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  // Fetch all approved households
  const approvedHouseholds = await db
    .select()
    .from(households)
    .where(eq(households.status, "approved"));

  // Fetch all survey responses for approved households
  const householdIds = approvedHouseholds.map((h) => h.id);
  let responses: SurveyResponse[] = [];
  if (householdIds.length > 0) {
    responses = await db
      .select()
      .from(surveyResponses)
      .where(inArray(surveyResponses.householdId, householdIds));
  }

  // Build a map of householdId -> surveyResponse for quick lookup
  const responseMap = new Map<number, SurveyResponse>();
  for (const r of responses) {
    responseMap.set(r.householdId, r);
  }

  const total = approvedHouseholds.length;

  // Helper to build an indicator result
  function makeIndicator(
    indicator: string,
    category: string,
    surveyCount: number,
    baselineCount: number,
    baselinePct: number,
    invertTrend = false // if true, higher survey value = improved (e.g., electricity)
  ): CBMSIndicatorResult {
    const surveyPct = total > 0 ? Math.round((surveyCount / total) * 1000) / 10 : 0;
    const trendDiff = Math.round((surveyPct - baselinePct) * 10) / 10;
    let trend: CBMSIndicatorResult["trend"] = "same";
    if (baselinePct === 0 && baselineCount === 0) {
      trend = "no_baseline";
    } else if (Math.abs(trendDiff) < 0.5) {
      trend = "same";
    } else if (invertTrend) {
      trend = trendDiff > 0 ? "improved" : "worsened";
    } else {
      trend = trendDiff > 0 ? "worsened" : "improved";
    }
    return {
      indicator,
      category,
      surveyCount,
      surveyPct,
      baselineCount,
      baselinePct,
      totalSurveyed: total,
      trend,
      trendDiff,
    };
  }

  // ── Indicator 3: Health — without health insurance ──────────────────────────
  // Checks sectionE.hasHealthInsurance (set by the Health section of the survey form)
  const withoutInsurance = approvedHouseholds.filter((h) => {
    const r = responseMap.get(h.id);
    if (r?.sectionE) {
      // Explicit false means they answered "No" to health insurance question
      return r.sectionE.hasHealthInsurance === false;
    }
    return false;
  }).length;

  // ── Indicator 4a: Water — without safe water source ─────────────────────────
  const unsafeWaterSources = ["open well", "river", "spring", "rain", "unprotected well", "none"];
  const withoutSafeWater = approvedHouseholds.filter((h) => {
    const r = responseMap.get(h.id);
    if (r?.sectionC?.waterSource) {
      return unsafeWaterSources.some((s) =>
        r.sectionC!.waterSource!.toLowerCase().includes(s)
      );
    }
    return false;
  }).length;

  // ── Indicator 4b: Sanitation — without sanitary toilet ──────────────────────
  // Checks sectionC.toiletFacility — values: flush/water-sealed, septic tank, open pit, hanging toilet, none
  // "Without sanitary toilet" = open pit, hanging toilet, or none
  const unsanitaryToilets = ["none", "open pit", "hanging toilet", "open defecation", "pit latrine without cover"];
  const withoutSanitaryToilet = approvedHouseholds.filter((h) => {
    const r = responseMap.get(h.id);
    if (r?.sectionC?.toiletFacility) {
      return unsanitaryToilets.some((s) =>
        r.sectionC!.toiletFacility!.toLowerCase().includes(s)
      );
    }
    return false;
  }).length;

  // ── Indicator 5: Shelter — informal settlers ────────────────────────────────
  // Checks sectionC.tenureStatus (dedicated tenure field, not houseType)
  // Values: owned, rented, informal settler, shared, rent-free
  const informalTenureValues = ["informal", "squatter", "rent-free", "illegal"];
  const informalSettlers = approvedHouseholds.filter((h) => {
    const r = responseMap.get(h.id);
    if (r?.sectionC?.tenureStatus) {
      return informalTenureValues.some((s) =>
        r.sectionC!.tenureStatus!.toLowerCase().includes(s)
      );
    }
    // Fallback: also check houseType for backward compatibility
    if (r?.sectionC?.houseType) {
      return informalTenureValues.some((s) =>
        r.sectionC!.houseType!.toLowerCase().includes(s)
      );
    }
    return false;
  }).length;

  // ── Indicator 7: Income — below poverty threshold ───────────────────────────
  const POVERTY_THRESHOLD = CBMS_BASELINE.povertyThreshold;
  const belowPoverty = approvedHouseholds.filter((h) => {
    const income = h.monthlyIncome ? parseFloat(h.monthlyIncome.toString()) : null;
    if (income !== null) return income < POVERTY_THRESHOLD;
    // Fallback: check sectionD
    const r = responseMap.get(h.id);
    if (r?.sectionD?.monthlyIncome !== undefined) {
      return r.sectionD.monthlyIncome < POVERTY_THRESHOLD;
    }
    return false;
  }).length;

  // ── Indicator 6: Education — out-of-school youth (12-15 years old) ──────────
  // Checks sectionF.youthOutOfSchool (youth 12-15 NOT attending high school)
  // Also includes sectionF.childrenOutOfSchool (children 6-11 not in elementary)
  const outOfSchool = approvedHouseholds.reduce((sum, h) => {
    const r = responseMap.get(h.id);
    let count = 0;
    // Primary: youth 12-15 out of school (the main CBMS indicator)
    if (r?.sectionF?.youthOutOfSchool) {
      count += r.sectionF.youthOutOfSchool;
    }
    // Also count children 6-11 out of school
    if (r?.sectionF?.childrenOutOfSchool) {
      count += r.sectionF.childrenOutOfSchool;
    }
    return sum + count;
  }, 0);

  // ── Indicator 11: Electricity ────────────────────────────────────────────────
  // Checks sectionC.electricitySource — values: metered electricity, solar, generator, kerosene/lamp, none
  // "With electricity" = metered electricity, solar, or generator (not kerosene/lamp or none)
  const electricSources = ["metered", "electricity", "solar", "generator"];
  const withElectricity = approvedHouseholds.filter((h) => {
    const r = responseMap.get(h.id);
    if (r?.sectionC?.electricitySource) {
      const src = r.sectionC.electricitySource.toLowerCase();
      if (src === "none" || src === "no electricity" || src === "kerosene" || src === "lamp" || src === "") {
        return false;
      }
      return electricSources.some((s) => src.includes(s));
    }
    return false;
  }).length;

  // ── Indicator 10: Social Protection ─────────────────────────────────────────
  const fourPsCount = approvedHouseholds.filter((h) => h.fourPsBeneficiary).length;
  const seniorCount = approvedHouseholds.filter((h) => h.seniorCitizen).length;
  const pwdCount = approvedHouseholds.filter((h) => h.pwdMember).length;

  // ── Indicator 12: Disaster Preparedness ─────────────────────────────────────
  const withEvacPlan = approvedHouseholds.filter((h) => {
    const r = responseMap.get(h.id);
    return r?.sectionH?.hasEvacuationPlan === true;
  }).length;

  // ── Indicator 13: Agricultural ───────────────────────────────────────────────
  const withAgriLand = approvedHouseholds.filter((h) => {
    const r = responseMap.get(h.id);
    return r?.sectionI?.hasAgriculturalLand === true;
  }).length;

  // ── Indicator 3 (PhilHealth) ─────────────────────────────────────────────────
  // Checks sectionE.hasPhilHealth (specific PhilHealth field) or healthInsuranceType includes "philhealth"
  const withPhilHealth = approvedHouseholds.filter((h) => {
    const r = responseMap.get(h.id);
    if (r?.sectionE) {
      // Check dedicated PhilHealth field first
      if (r.sectionE.hasPhilHealth === true) return true;
      // Fallback: check if healthInsuranceType is PhilHealth
      if (r.sectionE.healthInsuranceType?.toLowerCase().includes("philhealth")) return true;
      // Legacy fallback: if hasHealthInsurance is true and no specific type, assume PhilHealth
      if (r.sectionE.hasHealthInsurance === true && !r.sectionE.healthInsuranceType) return true;
    }
    return false;
  }).length;

  // ── All members flattened from sectionB rosters ────────────────────────────
  // Build a flat array of all members across all approved households
  interface MemberRecord {
    age: number;
    sex: string;
    registeredVoter?: boolean;
    occupation?: string;
    education?: string;
  }
  const allMembers: MemberRecord[] = [];
  for (const h of approvedHouseholds) {
    const r = responseMap.get(h.id);
    if (r?.sectionB?.members && r.sectionB.members.length > 0) {
      for (const m of r.sectionB.members) {
        allMembers.push({
          age: m.age ?? 0,
          sex: (m.sex ?? "").toLowerCase(),
          registeredVoter: m.registeredVoter,
          occupation: m.occupation,
          education: m.education,
        });
      }
    } else {
      // Fallback: count head of family from households table
      allMembers.push({
        age: h.age ?? 0,
        sex: "unknown",
      });
    }
  }

  const totalMembers = allMembers.length;
  const totalMale = allMembers.filter(m => m.sex === "male" || m.sex === "m").length;
  const totalFemale = allMembers.filter(m => m.sex === "female" || m.sex === "f").length;

  // ── Demographic age group breakdowns ─────────────────────────────────────────
  const demography = {
    under1:    allMembers.filter(m => m.age < 1).length,
    under5:    allMembers.filter(m => m.age < 5).length,
    age0to5:   allMembers.filter(m => m.age >= 0 && m.age <= 5).length,
    age6to11:  allMembers.filter(m => m.age >= 6 && m.age <= 11).length,
    age6to12:  allMembers.filter(m => m.age >= 6 && m.age <= 12).length,
    age12to15: allMembers.filter(m => m.age >= 12 && m.age <= 15).length,
    age13to16: allMembers.filter(m => m.age >= 13 && m.age <= 16).length,
    age6to15:  allMembers.filter(m => m.age >= 6 && m.age <= 15).length,
    age6to16:  allMembers.filter(m => m.age >= 6 && m.age <= 16).length,
    age10plus: allMembers.filter(m => m.age >= 10).length,
    laborForce: allMembers.filter(m => m.age >= 15 && m.age <= 64).length,
  };

  // ── Health: child mortality, maternal mortality, malnourishment ──────────────
  // sectionE fields: childDeaths (number), maternalDeaths (number), malnourishedChildren (number)
  // These are not yet in the schema but we check gracefully
  const childMortality = approvedHouseholds.filter(h => {
    const r = responseMap.get(h.id);
    return (r?.sectionE as any)?.childDeaths > 0;
  }).length;
  const maternalMortality = approvedHouseholds.filter(h => {
    const r = responseMap.get(h.id);
    return (r?.sectionE as any)?.maternalDeaths > 0;
  }).length;
  const malnourishedChildren = approvedHouseholds.reduce((sum, h) => {
    const r = responseMap.get(h.id);
    const val = (r?.sectionE as any)?.malnourishedChildren;
    return sum + (typeof val === "number" ? val : 0);
  }, 0);

  // ── Housing: makeshift, informal, both ───────────────────────────────────────
  const makeshiftMaterials = ["makeshift", "salvaged", "scrap", "bamboo", "cogon", "nipa"];
  const makeshiftHousing = approvedHouseholds.filter(h => {
    const r = responseMap.get(h.id);
    const roof = (r?.sectionC?.roofMaterial ?? "").toLowerCase();
    const wall = (r?.sectionC?.wallMaterial ?? "").toLowerCase();
    const houseType = (r?.sectionC?.houseType ?? "").toLowerCase();
    return makeshiftMaterials.some(s => roof.includes(s) || wall.includes(s) || houseType.includes(s));
  }).length;
  const bothMakeshiftAndInformal = approvedHouseholds.filter(h => {
    const r = responseMap.get(h.id);
    const isMakeshift = makeshiftMaterials.some(s =>
      (r?.sectionC?.roofMaterial ?? "").toLowerCase().includes(s) ||
      (r?.sectionC?.wallMaterial ?? "").toLowerCase().includes(s)
    );
    const isInformal = informalTenureValues.some(s =>
      (r?.sectionC?.tenureStatus ?? "").toLowerCase().includes(s)
    );
    return isMakeshift && isInformal;
  }).length;

  // ── Education: out-of-school by age group, illiteracy ────────────────────────
  const outOfSchool6to11 = approvedHouseholds.reduce((sum, h) => {
    const r = responseMap.get(h.id);
    return sum + (r?.sectionF?.childrenOutOfSchool ?? 0);
  }, 0);
  const outOfSchool12to15 = approvedHouseholds.reduce((sum, h) => {
    const r = responseMap.get(h.id);
    return sum + (r?.sectionF?.youthOutOfSchool ?? 0);
  }, 0);
  const outOfSchool6to15 = outOfSchool6to11 + outOfSchool12to15;
  const illiterate10plus = approvedHouseholds.reduce((sum, h) => {
    const r = responseMap.get(h.id);
    const val = (r?.sectionF as any)?.illiterateCount;
    return sum + (typeof val === "number" ? val : 0);
  }, 0);

  // ── Income: food threshold, food shortage, unemployment, solo parents ─────────
  const FOOD_THRESHOLD = 6329;
  const belowFoodThreshold = approvedHouseholds.filter(h => {
    const income = h.monthlyIncome ? parseFloat(h.monthlyIncome.toString()) : null;
    if (income !== null) return income < FOOD_THRESHOLD;
    const r = responseMap.get(h.id);
    return (r?.sectionD?.monthlyIncome ?? Infinity) < FOOD_THRESHOLD;
  }).length;
  const experiencedFoodShortage = approvedHouseholds.filter(h => {
    const r = responseMap.get(h.id);
    return r?.sectionD?.experiencedFoodShortage === true;
  }).length;
  const unemployedMembers = approvedHouseholds.reduce((sum, h) => {
    const r = responseMap.get(h.id);
    const val = (r?.sectionD as any)?.unemployedMembers;
    return sum + (typeof val === "number" ? val : 0);
  }, 0);
  const soloParents = approvedHouseholds.filter(h => {
    const r = responseMap.get(h.id);
    return r?.sectionG?.soloParent === true;
  }).length;
  // ── Peace & Order: victim households, victims by gender, crime types, reporting rate ───
  const victimHouseholdsList = approvedHouseholds.filter(h => {
    const r = responseMap.get(h.id);
    return r?.sectionH?.victimOfCrime === true;
  });
  const victimHouseholds = victimHouseholdsList.length;
  const maleVictims = approvedHouseholds.reduce((sum, h) => {
    const r = responseMap.get(h.id);
    const val = r?.sectionH?.maleVictims;
    return sum + (typeof val === "number" ? val : 0);
  }, 0);
  const femaleVictims = approvedHouseholds.reduce((sum, h) => {
    const r = responseMap.get(h.id);
    const val = r?.sectionH?.femaleVictims;
    return sum + (typeof val === "number" ? val : 0);
  }, 0);
  const totalVictims = maleVictims + femaleVictims > 0 ? maleVictims + femaleVictims : victimHouseholds;
  // Crime type breakdown
  const crimeTypeBreakdown: Record<string, number> = {};
  victimHouseholdsList.forEach(h => {
    const r = responseMap.get(h.id);
    const types = r?.sectionH?.crimeTypes;
    if (Array.isArray(types)) {
      types.forEach(t => {
        crimeTypeBreakdown[t] = (crimeTypeBreakdown[t] || 0) + 1;
      });
    }
  });
  // Crime reporting rate
  const crimeReportedCount = victimHouseholdsList.filter(h => {
    const r = responseMap.get(h.id);
    return r?.sectionH?.crimeReported === true;
  }).length;
  const crimeReportingRate = victimHouseholds > 0
    ? Math.round((crimeReportedCount / victimHouseholds) * 100)
    : 0;
  // Barangay-level crime aggregation for hotspot map
  const barangayMap = new Map<string, {
    totalHouseholds: number;
    victimHouseholds: number;
    totalVictims: number;
    maleVictims: number;
    femaleVictims: number;
    crimeTypesSet: Set<string>;
  }>();
  approvedHouseholds.forEach(h => {
    const brgy = h.barangay || "Unknown";
    if (!barangayMap.has(brgy)) {
      barangayMap.set(brgy, { totalHouseholds: 0, victimHouseholds: 0, totalVictims: 0, maleVictims: 0, femaleVictims: 0, crimeTypesSet: new Set() });
    }
    const entry = barangayMap.get(brgy)!;
    entry.totalHouseholds++;
    const r = responseMap.get(h.id);
    if (r?.sectionH?.victimOfCrime === true) {
      entry.victimHouseholds++;
      const mv = typeof r.sectionH.maleVictims === "number" ? r.sectionH.maleVictims : 0;
      const fv = typeof r.sectionH.femaleVictims === "number" ? r.sectionH.femaleVictims : 0;
      entry.maleVictims += mv;
      entry.femaleVictims += fv;
      entry.totalVictims += mv + fv > 0 ? mv + fv : 1;
      if (Array.isArray(r.sectionH.crimeTypes)) {
        r.sectionH.crimeTypes.forEach(t => entry.crimeTypesSet.add(t));
      }
    }
  });
  const barangayCrimeData = Array.from(barangayMap.entries())
    .map(([barangay, data]) => ({
      barangay,
      totalHouseholds: data.totalHouseholds,
      victimHouseholds: data.victimHouseholds,
      victimRate: data.totalHouseholds > 0
        ? Math.round((data.victimHouseholds / data.totalHouseholds) * 1000) / 10
        : 0,
      totalVictims: data.totalVictims,
      maleVictims: data.maleVictims,
      femaleVictims: data.femaleVictims,
      crimeTypes: Array.from(data.crimeTypesSet),
    }))
    .sort((a, b) => b.victimRate - a.victimRate);
  // ── Per-Barangay Breakdowns for Demography, Health, Housing, etc. ───────────
  const brgyBreakdownMap = new Map<string, {
    totalHouseholds: number;
    totalMembers: number;
    totalMale: number;
    totalFemale: number;
    under5: number;
    age6to11: number;
    age12to15: number;
    laborForce: number;
    seniorCitizens: number;
    childMortality: number;
    maternalMortality: number;
    malnourishedChildren: number;
    withPhilHealth: number;
    withoutHealthInsurance: number;
    makeshiftHousing: number;
    informalSettlers: number;
    withoutSafeWater: number;
    withoutSanitaryToilet: number;
    outOfSchool6to11: number;
    outOfSchool12to15: number;
    belowPoverty: number;
    belowFoodThreshold: number;
    foodShortage: number;
    unemployed: number;
    soloParents: number;
    fourPsBeneficiaries: number;
    withElectricity: number;
    pwdCount: number;
    withEvacuationPlan: number;
    withAgriculturalLand: number;
    registeredVoters: number;
    eligibleVoters: number;
  }>();

  approvedHouseholds.forEach(h => {
    const brgy = h.barangay || "Unknown";
    if (!brgyBreakdownMap.has(brgy)) {
      brgyBreakdownMap.set(brgy, {
        totalHouseholds: 0, totalMembers: 0, totalMale: 0, totalFemale: 0,
        under5: 0, age6to11: 0, age12to15: 0, laborForce: 0, seniorCitizens: 0,
        childMortality: 0, maternalMortality: 0, malnourishedChildren: 0,
        withPhilHealth: 0, withoutHealthInsurance: 0,
        makeshiftHousing: 0, informalSettlers: 0,
        withoutSafeWater: 0, withoutSanitaryToilet: 0,
        outOfSchool6to11: 0, outOfSchool12to15: 0,
        belowPoverty: 0, belowFoodThreshold: 0,
        foodShortage: 0, unemployed: 0, soloParents: 0, fourPsBeneficiaries: 0,
        withElectricity: 0, pwdCount: 0, withEvacuationPlan: 0, withAgriculturalLand: 0,
        registeredVoters: 0, eligibleVoters: 0,
      });
    }
    const b = brgyBreakdownMap.get(brgy)!;
    b.totalHouseholds++;
    const r = responseMap.get(h.id);
    // Members
    const members = r?.sectionB?.members ?? [];
    b.totalMembers += members.length;
    members.forEach(m => {
      const age = typeof m.age === "number" ? m.age : 0;
      const sex = (m.sex || "").toLowerCase();
      if (sex === "male" || sex === "m") b.totalMale++;
      else if (sex === "female" || sex === "f") b.totalFemale++;
      if (age < 5) b.under5++;
      if (age >= 6 && age <= 11) b.age6to11++;
      if (age >= 12 && age <= 15) b.age12to15++;
      if (age >= 15 && age <= 64) b.laborForce++;
      if (age >= 60) b.seniorCitizens++;
      if (age >= 18) b.eligibleVoters++;
      if (m.registeredVoter === true && age >= 18) b.registeredVoters++;
    });
    // Health
    const sE = r?.sectionE;
    if (sE) {
      if (typeof sE.childDeaths === "number" && sE.childDeaths > 0) b.childMortality++;
      if (typeof sE.maternalDeaths === "number" && sE.maternalDeaths > 0) b.maternalMortality++;
      if (typeof sE.malnourishedChildren === "number") b.malnourishedChildren += sE.malnourishedChildren;
      if (sE.hasPhilHealth === true) b.withPhilHealth++;
      if (sE.hasHealthInsurance === false) b.withoutHealthInsurance++;
    }
    // Housing
    const sC = r?.sectionC;
    if (sC) {
      const roof = (sC.roofMaterial || "").toLowerCase();
      const wall = (sC.wallMaterial || "").toLowerCase();
      const MAKESHIFT = ["makeshift", "salvaged", "cogon", "nipa", "bamboo", "wood"];
      if (MAKESHIFT.some(m => roof.includes(m)) || MAKESHIFT.some(m => wall.includes(m))) b.makeshiftHousing++;
      const tenure = (sC.tenureStatus || "").toLowerCase();
      if (tenure.includes("informal") || tenure.includes("squatter") || tenure === "rent-free") b.informalSettlers++;
      const water = (sC.waterSource || "").toLowerCase();
      const SAFE_WATER = ["piped", "deep well", "protected", "bottled", "refilling", "spring"];
      if (!SAFE_WATER.some(s => water.includes(s))) b.withoutSafeWater++;
      const toilet = (sC.toiletFacility || "").toLowerCase();
      const UNSANITARY = ["open pit", "hanging", "none", "no toilet"];
      if (UNSANITARY.some(u => toilet.includes(u)) || toilet === "") b.withoutSanitaryToilet++;
      const elec = (sC.electricitySource || "").toLowerCase();
      const ELECTRIC = ["metered", "solar", "generator", "electricity"];
      if (ELECTRIC.some(e => elec.includes(e))) b.withElectricity++;
    }
    // Education
    const sF = r?.sectionF;
    if (sF) {
      if (typeof sF.childrenOutOfSchool === "number") b.outOfSchool6to11 += sF.childrenOutOfSchool;
      if (typeof sF.youthOutOfSchool === "number") b.outOfSchool12to15 += sF.youthOutOfSchool;
    }
    // Income
    const sD = r?.sectionD;
    if (sD) {
      const income = typeof sD.monthlyIncome === "number" ? sD.monthlyIncome
        : typeof h.monthlyIncome === "number" ? h.monthlyIncome : null;
      if (income !== null && income < 9064) b.belowPoverty++;
      if (income !== null && income < 6329) b.belowFoodThreshold++;
      if (sD.experiencedFoodShortage === true) b.foodShortage++;
      const unemployedVal = typeof (sD as any).unemployedMembers === "number" ? (sD as any).unemployedMembers : 0;
      b.unemployed += unemployedVal;
    }
    // Solo parents & 4Ps
    const sG = r?.sectionG;
    if (sG?.soloParent === true) b.soloParents++;
    if (h.fourPsBeneficiary === true) b.fourPsBeneficiaries++;
    // Disaster
    const sH = r?.sectionH;
    if (sH?.hasEvacuationPlan === true) b.withEvacuationPlan++;
    // Agriculture
    const sI = r?.sectionI;
    if (sI?.hasAgriculturalLand === true) b.withAgriculturalLand++;
    // PWD (count from member roster)
    if (sE?.hasDisabledMember === true) b.pwdCount++;
  });

  const barangayBreakdowns = Array.from(brgyBreakdownMap.entries())
    .map(([barangay, d]) => ({ barangay, ...d }))
    .sort((a, b) => a.barangay.localeCompare(b.barangay));

  // ── Civic Participation: Registered Voters ─────────────────────────────────
  // Counts members across all approved households who are marked as registered voters
  // Only applies to members 18 years old and above
  const registeredVoterCount = approvedHouseholds.reduce((sum, h) => {
    const r = responseMap.get(h.id);
    if (r?.sectionB?.members) {
      return sum + r.sectionB.members.filter(
        (m) => m.registeredVoter === true && m.age >= 18
      ).length;
    }
    return sum;
  }, 0);

  // Count total eligible voters (18+ years old) across all approved households
  const eligibleVoterCount = approvedHouseholds.reduce((sum, h) => {
    const r = responseMap.get(h.id);
    if (r?.sectionB?.members) {
      return sum + r.sectionB.members.filter((m) => m.age >= 18).length;
    }
    return sum;
  }, 0);

  const indicators: CBMSIndicatorResult[] = [
    makeIndicator("Below Poverty Threshold", "Income & Livelihood", belowPoverty, CBMS_BASELINE.belowPovertyThreshold, CBMS_BASELINE.belowPovertyPct),
    makeIndicator("Without Safe Water Source", "Water & Sanitation", withoutSafeWater, CBMS_BASELINE.withoutSafeWater, CBMS_BASELINE.withoutSafeWaterPct),
    makeIndicator("Without Sanitary Toilet", "Water & Sanitation", withoutSanitaryToilet, total - Math.round(total * CBMS_BASELINE.withSanitaryToiletPct / 100), Math.round((100 - CBMS_BASELINE.withSanitaryToiletPct) * 100) / 100),
    makeIndicator("Informal Settlers", "Shelter", informalSettlers, CBMS_BASELINE.informalSettlers, CBMS_BASELINE.informalSettlersPct),
    makeIndicator("Without Health Insurance", "Health", withoutInsurance, CBMS_BASELINE.withoutHealthInsurance, CBMS_BASELINE.withoutHealthInsurancePct),
    makeIndicator("With PhilHealth Coverage", "Health", withPhilHealth, CBMS_BASELINE.withPhilHealth, CBMS_BASELINE.withPhilHealthPct, true),
    makeIndicator("With Electricity", "Basic Services", withElectricity, CBMS_BASELINE.withElectricity, CBMS_BASELINE.withElectricityPct, true),
    makeIndicator("4Ps Beneficiaries", "Social Protection", fourPsCount, CBMS_BASELINE.fourPsBeneficiaries, 0),
    makeIndicator("Senior Citizens", "Demographics", seniorCount, CBMS_BASELINE.seniorCitizens, Math.round((CBMS_BASELINE.seniorCitizens / CBMS_BASELINE.totalHouseholds) * 1000) / 10, true),
    makeIndicator("PWD Members", "Demographics", pwdCount, CBMS_BASELINE.pwd, 0),
    makeIndicator("With Evacuation Plan", "Disaster Preparedness", withEvacPlan, CBMS_BASELINE.withEvacuationPlan, 0, true),
    makeIndicator("With Agricultural Land", "Agriculture", withAgriLand, CBMS_BASELINE.withAgriculturalLand, 0, true),
    makeIndicator("Out-of-School Children", "Education", outOfSchool, CBMS_BASELINE.outOfSchool12to15, CBMS_BASELINE.outOfSchool12to15Pct),
    makeIndicator("Registered Voters", "Civic Participation", registeredVoterCount, CBMS_BASELINE.registeredVoters, CBMS_BASELINE.registeredVotersPct, true),
  ];
  return {
    totalApprovedHouseholds: total,
    totalMembers,
    totalMale,
    totalFemale,
    demography,
    health: {
      childMortality,
      maternalMortality,
      malnourishedChildren,
      withPhilHealth,
      withoutHealthInsurance: withoutInsurance,
    },
    housing: {
      makeshiftHousing,
      informalSettlers,
      bothMakeshiftAndInformal,
    },
    water: {
      withoutSafeWater,
      withoutSanitaryToilet,
    },
    education: {
      outOfSchool6to11,
      outOfSchool12to15,
      outOfSchool6to15,
      illiterate10plus,
    },
    income: {
      belowPoverty,
      belowFoodThreshold,
      experiencedFoodShortage,
      unemployed: unemployedMembers,
      soloParents,
      fourPsBeneficiaries: fourPsCount,
    },
    peaceAndOrder: {
      victimHouseholds,
      totalVictims,
      maleVictims,
      femaleVictims,
      crimeTypeBreakdown,
      crimeReportedCount,
      crimeReportingRate,
      barangayCrimeData,
    },
    other: {
      withElectricity,
      pwdCount,
      seniorCitizens: seniorCount,
      withEvacuationPlan: withEvacPlan,
      withAgriculturalLand: withAgriLand,
    },
    eligibleVoterCount,
    registeredVoterCount,
    computedAt: new Date(),
    indicators,
    barangayBreakdowns,
  };
}

// ── CBMS Threshold Configurations ────────────────────────────────────────────

import { cbmsThresholds } from "../drizzle/schema";

// Default thresholds seeded from CBMS baseline data
export const DEFAULT_THRESHOLDS = [
  { indicatorKey: "belowPoverty",        indicatorName: "Below Poverty Threshold",   baselinePct: 22.13, warnThresholdPct: 5,  criticalThresholdPct: 10 },
  { indicatorKey: "withoutSafeWater",    indicatorName: "Without Safe Water Source",  baselinePct: 30.00, warnThresholdPct: 5,  criticalThresholdPct: 10 },
  { indicatorKey: "withoutToilet",       indicatorName: "Without Sanitary Toilet",    baselinePct: 15.00, warnThresholdPct: 5,  criticalThresholdPct: 10 },
  { indicatorKey: "informalSettlers",    indicatorName: "Informal Settlers",          baselinePct: 33.52, warnThresholdPct: 5,  criticalThresholdPct: 10 },
  { indicatorKey: "withoutInsurance",    indicatorName: "Without Health Insurance",   baselinePct: 41.00, warnThresholdPct: 5,  criticalThresholdPct: 10 },
  { indicatorKey: "withPhilHealth",      indicatorName: "With PhilHealth Coverage",   baselinePct: 59.00, warnThresholdPct: 5,  criticalThresholdPct: 10 },
  { indicatorKey: "withElectricity",     indicatorName: "With Electricity",           baselinePct: 96.63, warnThresholdPct: 3,  criticalThresholdPct: 7  },
  { indicatorKey: "fourPs",              indicatorName: "4Ps Beneficiaries",          baselinePct: 10.00, warnThresholdPct: 5,  criticalThresholdPct: 10 },
  { indicatorKey: "seniorCitizens",      indicatorName: "Senior Citizens",            baselinePct: 8.00,  warnThresholdPct: 5,  criticalThresholdPct: 10 },
  { indicatorKey: "pwd",                 indicatorName: "PWD Members",                baselinePct: 3.00,  warnThresholdPct: 3,  criticalThresholdPct: 7  },
  { indicatorKey: "withEvacPlan",        indicatorName: "With Evacuation Plan",       baselinePct: 40.00, warnThresholdPct: 5,  criticalThresholdPct: 10 },
  { indicatorKey: "withAgriLand",        indicatorName: "With Agricultural Land",     baselinePct: 5.00,  warnThresholdPct: 3,  criticalThresholdPct: 7  },
  { indicatorKey: "outOfSchool",         indicatorName: "Out-of-School Children",     baselinePct: 17.10, warnThresholdPct: 5,  criticalThresholdPct: 10 },
];

export type AlertLevel = "ok" | "warning" | "critical";

export interface CBMSAlert {
  indicatorKey: string;
  indicatorName: string;
  baselinePct: number;
  livePct: number;
  warnThresholdPct: number;
  criticalThresholdPct: number;
  deviation: number;          // livePct - baselinePct (positive = worse)
  level: AlertLevel;
  message: string;
}

/**
 * Seed default thresholds if the table is empty.
 */
export async function seedDefaultThresholds(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select({ id: cbmsThresholds.id }).from(cbmsThresholds).limit(1);
  if (existing.length > 0) return; // already seeded

  for (const t of DEFAULT_THRESHOLDS) {
    await db.insert(cbmsThresholds).values({
      indicatorKey: t.indicatorKey,
      indicatorName: t.indicatorName,
      baselinePct: String(t.baselinePct),
      warnThresholdPct: String(t.warnThresholdPct),
      criticalThresholdPct: String(t.criticalThresholdPct),
      isActive: true,
    });
  }
}

/**
 * Get all threshold configurations.
 */
export async function getThresholds() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(cbmsThresholds).orderBy(cbmsThresholds.indicatorName);
}

/**
 * Upsert a single threshold configuration.
 */
export async function upsertThreshold(data: {
  indicatorKey: string;
  warnThresholdPct: number;
  criticalThresholdPct: number;
  isActive: boolean;
  updatedBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(cbmsThresholds)
    .set({
      warnThresholdPct: String(data.warnThresholdPct),
      criticalThresholdPct: String(data.criticalThresholdPct),
      isActive: data.isActive,
      updatedBy: data.updatedBy ?? null,
    })
    .where(eq(cbmsThresholds.indicatorKey, data.indicatorKey));
  return db
    .select()
    .from(cbmsThresholds)
    .where(eq(cbmsThresholds.indicatorKey, data.indicatorKey))
    .limit(1);
}

// Map from indicator name (as returned by computeCBMSIndicators) → indicatorKey
const INDICATOR_NAME_TO_KEY: Record<string, string> = {
  "Below Poverty Threshold":   "belowPoverty",
  "Without Safe Water Source": "withoutSafeWater",
  "Without Sanitary Toilet":   "withoutToilet",
  "Informal Settlers":         "informalSettlers",
  "Without Health Insurance":  "withoutInsurance",
  "With PhilHealth Coverage":  "withPhilHealth",
  "With Electricity":          "withElectricity",
  "4Ps Beneficiaries":         "fourPs",
  "Senior Citizens":           "seniorCitizens",
  "PWD Members":               "pwd",
  "With Evacuation Plan":      "withEvacPlan",
  "With Agricultural Land":    "withAgriLand",
  "Out-of-School Children":    "outOfSchool",
};

/**
 * Evaluate live CBMS indicators against configured thresholds.
 * Returns only indicators that are in WARNING or CRITICAL state.
 */
export async function evaluateThresholdAlerts(): Promise<{
  alerts: CBMSAlert[];
  totalActive: number;
  warnings: number;
  criticals: number;
  computedAt: Date;
}> {
  // Ensure defaults are seeded
  await seedDefaultThresholds();

  const [thresholds, liveData] = await Promise.all([
    getThresholds(),
    computeCBMSIndicators(),
  ]);

  const thresholdMap = new Map(thresholds.map(t => [t.indicatorKey, t]));
  const alerts: CBMSAlert[] = [];

  for (const ind of liveData.indicators) {
    const key = INDICATOR_NAME_TO_KEY[ind.indicator];
    if (!key) continue;

    const threshold = thresholdMap.get(key);
    if (!threshold || !threshold.isActive) continue;

    const baselinePct = Number(threshold.baselinePct);
    const warnPct = Number(threshold.warnThresholdPct);
    const critPct = Number(threshold.criticalThresholdPct);
    const livePct = ind.surveyPct;

    // For "positive" indicators (higher = better), deviation is baseline - live
    // For "negative" indicators (lower = better), deviation is live - baseline
    // We use the trend from computeCBMSIndicators: "worsened" means deviation is positive
    const deviation = ind.trend === "worsened" ? Math.abs(ind.trendDiff) : -Math.abs(ind.trendDiff);

    let level: AlertLevel = "ok";
    if (deviation >= critPct) level = "critical";
    else if (deviation >= warnPct) level = "warning";

    if (level !== "ok") {
      alerts.push({
        indicatorKey: key,
        indicatorName: ind.indicator,
        baselinePct,
        livePct,
        warnThresholdPct: warnPct,
        criticalThresholdPct: critPct,
        deviation: Math.round(deviation * 10) / 10,
        level,
        message:
          level === "critical"
            ? `CRITICAL: ${ind.indicator} is ${deviation.toFixed(1)}pp above threshold (baseline ${baselinePct}%, live ${livePct}%)`
            : `WARNING: ${ind.indicator} is ${deviation.toFixed(1)}pp above warning threshold (baseline ${baselinePct}%, live ${livePct}%)`,
      });
    }
  }

  const warnings = alerts.filter(a => a.level === "warning").length;
  const criticals = alerts.filter(a => a.level === "critical").length;

  return {
    alerts,
    totalActive: thresholds.filter(t => t.isActive).length,
    warnings,
    criticals,
    computedAt: liveData.computedAt,
  };
}
