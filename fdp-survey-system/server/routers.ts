import {
  clearSessionCookieVariants,
  setCanonicalSessionCookie,
} from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import { syncSurveyToBisResident } from "./bisSync";
import { hashPassword, normalizeUsername, verifyPassword } from "./_core/localAuth";
import { sdk } from "./_core/sdk";
import { ENV } from "./_core/env";
import { ONE_YEAR_MS } from "@shared/const";
import { provisionBisAccountFromFdp } from "./bisAccountProvision";

const BIS_PRESENCE_SYNC_ROLES = new Set(["surveyor", "supervisor"]);

function resolveBisPresenceUrl(): string {
  const baseUrl = String(ENV.bisApiBaseUrl || "").trim();
  if (!baseUrl) return "";
  return new URL(
    "api/internal/fdp/presence",
    baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`
  ).toString();
}

function resolveBisUid(openId: string | null | undefined): string | null {
  const normalized = String(openId || "").trim();
  if (!normalized.startsWith("bis:")) {
    return null;
  }
  return normalized.slice(4) || null;
}

function resolveBisEmail(user: { openId: string; email?: string | null }): string {
  const directEmail = String(user.email || "").trim().toLowerCase();
  if (directEmail) {
    return directEmail;
  }

  const normalizedOpenId = String(user.openId || "").trim();
  if (normalizedOpenId.startsWith("local:")) {
    const localUsername = normalizedOpenId.slice(6).trim().toLowerCase();
    if (localUsername.includes("@")) {
      return localUsername;
    }
  }

  return "";
}

async function syncBisPresenceLease(
  user: { openId: string; role: string; email?: string | null; name?: string | null },
  input: { sessionId: string; online: boolean }
): Promise<boolean> {
  const role = String(user.role || "").trim().toLowerCase();
  if (!BIS_PRESENCE_SYNC_ROLES.has(role)) {
    return false;
  }

  const uid = resolveBisUid(user.openId);
  const email = resolveBisEmail(user);
  const name = String(user.name || "").trim();
  const presenceUrl = resolveBisPresenceUrl();
  const provisionKey = String(ENV.bisAccountProvisionApiKey || "").trim();
  if ((!uid && !email) || !presenceUrl || !provisionKey) {
    return false;
  }

  try {
    const response = await fetch(presenceUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-fdp-provision-key": provisionKey,
      },
      body: JSON.stringify({
        uid,
        email,
        name,
        role,
        sessionId: input.sessionId,
        online: input.online,
      }),
    });

    if (!response.ok) {
      console.warn(`[BIS Presence] Sync failed (${response.status} ${response.statusText})`);
      return false;
    }

    return true;
  } catch (error) {
    console.warn("[BIS Presence] Sync failed", error);
    return false;
  }
}

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    // Self-service: a surveyor sets the city/barangay they operate in once
    // (Settings page) — Section A of every survey they submit auto-fills
    // from this instead of asking them to pick it again each time.
    updateLocation: protectedProcedure
      .input(
        z.object({
          municipality: z.string().min(1),
          barangay: z.string().min(1),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await db.updateUserLocation(ctx.user.id, input);
        return { success: true } as const;
      }),
    syncBisPresence: protectedProcedure
      .input(
        z.object({
          sessionId: z.string().min(1),
          online: z.boolean(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const synced = await syncBisPresenceLease(ctx.user, input);
        return { success: synced } as const;
      }),
    login: publicProcedure
      .input(
        z.object({
          username: z.string().min(3),
          password: z.string().min(6),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!ENV.localAuthEnabled) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Local auth is disabled" });
        }

        const hasSchema = await db.hasLocalAuthSchema();
        if (!hasSchema) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Local auth database schema is missing. Run: pnpm db:push",
          });
        }

        const username = normalizeUsername(input.username);
        const credential = await db.getLocalCredentialByUsername(username);

        if (!credential || !credential.isActive) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid username or password" });
        }

        const isValidPassword = verifyPassword(input.password, credential.salt, credential.passwordHash);
        if (!isValidPassword) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid username or password" });
        }

        const user = await db.getUserById(credential.userId);
        if (!user) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Account is unavailable" });
        }

        await db.upsertUser({
          openId: user.openId,
          lastSignedIn: new Date(),
        });

        const sessionToken = await sdk.createSessionToken(user.openId, {
          name: user.name ?? username,
          expiresInMs: ONE_YEAR_MS,
        });

        setCanonicalSessionCookie(ctx.req, ctx.res, sessionToken);

        return {
          success: true,
          user,
        } as const;
      }),
    register: publicProcedure
      .input(
        z.object({
          name: z.string().min(2),
          username: z.string().min(3),
          password: z.string().min(6),
          role: z.enum(["admin", "surveyor", "supervisor", "user"]).default("surveyor"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user || ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can register new users" });
        }

        if (!ENV.localAuthEnabled) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Local auth is disabled" });
        }

        const hasSchema = await db.hasLocalAuthSchema();
        if (!hasSchema) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Local auth database schema is missing. Run: pnpm db:push",
          });
        }

        const username = normalizeUsername(input.username);
        const existing = await db.getLocalCredentialByUsername(username);
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "Username already exists" });
        }

        const openId = `local:${username}`;
        await db.upsertUser({
          openId,
          name: input.name,
          loginMethod: "local-password",
          role: input.role,
          lastSignedIn: new Date(),
        });

        const user = await db.getUserByOpenId(openId);
        if (!user) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create user" });
        }

        const { salt, hash } = hashPassword(input.password);
        await db.upsertLocalCredential({
          userId: user.id,
          username,
          passwordHash: hash,
          salt,
          isActive: true,
        });

        await provisionBisAccountFromFdp({
          name: input.name,
          username,
          password: input.password,
          role: input.role,
          requestedBy: ctx.user.openId,
        });

        return {
          success: true,
          user,
        } as const;
      }),
    listLocalUsers: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can view users" });
      }

      if (!ENV.localAuthEnabled) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Local auth is disabled" });
      }

      const hasSchema = await db.hasLocalAuthSchema();
      if (!hasSchema) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Local auth database schema is missing. Run: pnpm db:push",
        });
      }

      return await db.listLocalAuthUsers();
    }),
    resetLocalUserPassword: protectedProcedure
      .input(
        z.object({
          userId: z.number().int().positive(),
          newPassword: z.string().min(6),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can reset passwords" });
        }

        if (!ENV.localAuthEnabled) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Local auth is disabled" });
        }

        const hasSchema = await db.hasLocalAuthSchema();
        if (!hasSchema) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Local auth database schema is missing. Run: pnpm db:push",
          });
        }

        const localUsers = await db.listLocalAuthUsers();
        const target = localUsers.find((user) => user.id === input.userId);
        if (!target) {
          throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        }

        const { salt, hash } = hashPassword(input.newPassword);
        await db.updateLocalCredentialPasswordByUserId(input.userId, hash, salt);

        return { success: true } as const;
      }),
    setLocalUserActive: protectedProcedure
      .input(
        z.object({
          userId: z.number().int().positive(),
          isActive: z.boolean(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can change user status" });
        }

        if (!ENV.localAuthEnabled) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Local auth is disabled" });
        }

        const hasSchema = await db.hasLocalAuthSchema();
        if (!hasSchema) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Local auth database schema is missing. Run: pnpm db:push",
          });
        }

        if (ctx.user.id === input.userId && !input.isActive) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You cannot deactivate your own account" });
        }

        const localUsers = await db.listLocalAuthUsers();
        const target = localUsers.find((user) => user.id === input.userId);
        if (!target) {
          throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        }

        await db.setLocalCredentialActiveByUserId(input.userId, input.isActive);
        return { success: true } as const;
      }),
    deleteLocalUser: protectedProcedure
      .input(
        z.object({
          userId: z.number().int().positive(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can delete users" });
        }

        if (!ENV.localAuthEnabled) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Local auth is disabled" });
        }

        const hasSchema = await db.hasLocalAuthSchema();
        if (!hasSchema) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Local auth database schema is missing. Run: pnpm db:push",
          });
        }

        if (ctx.user.id === input.userId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You cannot delete your own account" });
        }

        const localUsers = await db.listLocalAuthUsers();
        const target = localUsers.find((user) => user.id === input.userId);
        if (!target) {
          throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        }

        await db.deleteLocalAuthUserById(input.userId);

        return { success: true } as const;
      }),
    updateLocalUserDetails: protectedProcedure
      .input(
        z.object({
          userId: z.number().int().positive(),
          name: z.string().min(2),
          email: z.string().email().optional().nullable(),
          username: z.string().min(3),
          role: z.enum(["admin", "surveyor", "supervisor", "user"]),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can edit user details" });
        }

        if (!ENV.localAuthEnabled) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Local auth is disabled" });
        }

        const hasSchema = await db.hasLocalAuthSchema();
        if (!hasSchema) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Local auth database schema is missing. Run: pnpm db:push",
          });
        }

        const localUsers = await db.listLocalAuthUsers();
        const target = localUsers.find((user) => user.id === input.userId);
        if (!target) {
          throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        }

        if (ctx.user.id === input.userId && input.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "You cannot remove your own admin role" });
        }

        const normalizedUsername = normalizeUsername(input.username);
        const existing = await db.getLocalCredentialByUsername(normalizedUsername);
        if (existing && existing.userId !== input.userId) {
          throw new TRPCError({ code: "CONFLICT", message: "Username already exists" });
        }

        await db.updateUserProfileById(input.userId, {
          name: input.name.trim(),
          email: input.email ? input.email.trim().toLowerCase() : null,
          role: input.role,
        });

        if ((target.username ?? "").toLowerCase() !== normalizedUsername) {
          await db.updateLocalCredentialUsernameByUserId(input.userId, normalizedUsername);
        }

        return { success: true } as const;
      }),
    logout: publicProcedure
      .input(
        z.object({
          sessionId: z.string().min(1),
        }).optional()
      )
      .mutation(async ({ input, ctx }) => {
      if (ctx.user && input?.sessionId) {
        await syncBisPresenceLease(ctx.user, {
          sessionId: input.sessionId,
          online: false,
        });
      }

      clearSessionCookieVariants(ctx.req, ctx.res);

      return {
        success: true,
      } as const;
    }),
  }),

  households: router({
    list: publicProcedure.query(async () => {
      return await db.getAllHouseholds();
    }),

    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getHouseholdById(input.id);
      }),

    search: publicProcedure
      .input(z.object({ query: z.string() }))
      .query(async ({ input }) => {
        if (!input.query.trim()) {
          return await db.getAllHouseholds();
        }
        return await db.searchHouseholds(input.query);
      }),

    getByBarangay: publicProcedure
      .input(z.object({ barangay: z.string() }))
      .query(async ({ input }) => {
        return await db.getHouseholdsByBarangay(input.barangay);
      }),

    create: protectedProcedure
      .input(
        z.object({
          barangay: z.string(),
          municipality: z.string(),
          province: z.string().default("Parañaque"),
          headOfFamily: z.string(),
          age: z.number().optional(),
          civilStatus: z.string().optional(),
          occupation: z.string().optional(),
          education: z.string().optional(),
          monthlyIncome: z.number().optional(),
          latitude: z.number().optional(),
          longitude: z.number().optional(),
          fourPsBeneficiary: z.boolean().default(false),
          tupadBeneficiary: z.boolean().default(false),
          seniorCitizen: z.boolean().default(false),
          pwdMember: z.boolean().default(false),
          indigenousPeople: z.boolean().default(false),
          verificationPhoto: z.string().optional(),
          verificationPhotoKey: z.string().optional(),
          status: z.enum(["draft", "submitted", "approved", "returned"]).default("submitted"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Convert number fields to strings for decimal columns
        const householdData: any = { ...input };
        if (householdData.monthlyIncome !== undefined) {
          householdData.monthlyIncome = householdData.monthlyIncome.toString();
        }
        if (householdData.latitude !== undefined) {
          householdData.latitude = householdData.latitude.toString();
        }
        if (householdData.longitude !== undefined) {
          householdData.longitude = householdData.longitude.toString();
        }
        return await db.createHousehold({
          ...householdData,
          surveyedBy: ctx.user.id,
        });
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          data: z.object({
            barangay: z.string().optional(),
            municipality: z.string().optional(),
            headOfFamily: z.string().optional(),
            age: z.number().optional(),
            civilStatus: z.string().optional(),
            occupation: z.string().optional(),
            education: z.string().optional(),
            monthlyIncome: z.number().optional(),
            latitude: z.number().optional(),
            longitude: z.number().optional(),
            fourPsBeneficiary: z.boolean().optional(),
            tupadBeneficiary: z.boolean().optional(),
            seniorCitizen: z.boolean().optional(),
            pwdMember: z.boolean().optional(),
            indigenousPeople: z.boolean().optional(),
            verificationPhoto: z.string().optional(),
            verificationPhotoKey: z.string().optional(),
            status: z.enum(["draft", "submitted", "approved", "returned"]).optional(),
          }),
        })
      )
      .mutation(async ({ input }) => {
        // Convert number fields to strings for decimal columns
        const updates: any = { ...input.data };
        if (updates.monthlyIncome !== undefined) {
          updates.monthlyIncome = updates.monthlyIncome.toString();
        }
        if (updates.latitude !== undefined) {
          updates.latitude = updates.latitude.toString();
        }
        if (updates.longitude !== undefined) {
          updates.longitude = updates.longitude.toString();
        }
        return await db.updateHousehold(input.id, updates);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        // Only admin can delete households
        if (ctx.user.role !== "admin") {
          throw new Error("Only admins can delete surveys");
        }
        await db.deleteHousehold(input.id);
        return { success: true };
      }),

    statistics: publicProcedure.query(async () => {
      return await db.getHouseholdStatistics();
    }),

    barangayList: publicProcedure.query(async () => {
      return await db.getBarangayList();
    }),

    incomeDistribution: publicProcedure.query(async () => {
      return await db.getIncomeDistribution();
    }),

    barangayPerformance: publicProcedure.query(async () => {
      return await db.getBarangayPerformance();
    }),

    // Status workflow endpoints
    updateStatus: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["draft", "submitted", "approved", "returned"]),
          returnReason: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        return await db.updateHouseholdStatus(
          input.id,
          input.status,
          ctx.user.id,
          input.returnReason
        );
      }),

    approve: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const household = await db.updateHouseholdStatus(input.id, "approved", ctx.user.id);
        try {
          const survey = await db.getSurveyResponseByHouseholdId(household.id);
          await syncSurveyToBisResident(household, survey);
        } catch (error) {
          console.warn("[BIS Sync] Failed to provision resident on approval:", error);
        }
        return household;
      }),

    return: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          reason: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        return await db.updateHouseholdStatus(
          input.id,
          "returned",
          ctx.user.id,
          input.reason
        );
      }),

    getStatusHistory: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getHouseholdStatusHistory(input.id);
      }),

    statusStatistics: publicProcedure.query(async () => {
      return await db.getStatusStatistics();
    }),

    approvalTrends: publicProcedure.query(async () => {
      return await db.getApprovalTrends();
    }),

    averageReviewTime: publicProcedure.query(async () => {
      return await db.getAverageReviewTime();
    }),
  }),

  surveys: router({
    getByHouseholdId: publicProcedure
      .input(z.object({ householdId: z.number() }))
      .query(async ({ input }) => {
        return await db.getSurveyResponseByHouseholdId(input.householdId);
      }),

    create: protectedProcedure
      .input(
        z.object({
          householdId: z.number(),
          sectionA: z.any().optional(),
          sectionB: z.any().optional(),
          sectionC: z.any().optional(),
          sectionD: z.any().optional(),
          sectionE: z.any().optional(),
          sectionF: z.any().optional(),
          sectionG: z.any().optional(),
          sectionH: z.any().optional(),
          sectionI: z.any().optional(),
          sectionJ: z.any().optional(),
          sectionK: z.any().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const survey = await db.createSurveyResponse(input);
        try {
          const household = await db.getHouseholdById(input.householdId);
          const syncResult = await syncSurveyToBisResident(household, survey);
          if (syncResult.status === "skipped") {
            console.warn(`[BIS Sync] Skipped for household ${household?.id}: ${syncResult.reason}`);
          } else if (syncResult.status === "created") {
            console.info(`[BIS Sync] ✅ Created resident ${syncResult.residentId} for household ${household?.id}`);
          } else if (syncResult.status === "exists") {
            console.info(`[BIS Sync] Resident already exists: ${syncResult.residentId}`);
          }
        } catch (error) {
          console.error("[BIS Sync] Failed to provision resident on survey submit:", error);
        }
        return survey;
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          data: z.object({
            sectionA: z.any().optional(),
            sectionB: z.any().optional(),
            sectionC: z.any().optional(),
            sectionD: z.any().optional(),
            sectionE: z.any().optional(),
            sectionF: z.any().optional(),
            sectionG: z.any().optional(),
            sectionH: z.any().optional(),
            sectionI: z.any().optional(),
            sectionJ: z.any().optional(),
            sectionK: z.any().optional(),
          }),
        })
      )
      .mutation(async ({ input }) => {
        return await db.updateSurveyResponse(input.id, input.data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        // Only admin can delete surveys
        if (ctx.user.role !== "admin") {
          throw new Error("Only admins can delete surveys");
        }
        await db.deleteSurveyResponse(input.id);
        return { success: true };
      }),
  }),

  reportTemplates: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new Error("Unauthorized");
      return await db.getReportTemplatesByUser(ctx.user.id);
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getReportTemplateById(input.id);
      }),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string(),
          description: z.string().optional(),
          selectedFields: z.array(z.string()),
          filters: z.object({
            barangay: z.array(z.string()).optional(),
            municipality: z.array(z.string()).optional(),
            status: z.array(z.string()).optional(),
            dateFrom: z.string().optional(),
            dateTo: z.string().optional(),
            minIncome: z.number().optional(),
            maxIncome: z.number().optional(),
            minAge: z.number().optional(),
            maxAge: z.number().optional(),
            fourPsBeneficiary: z.boolean().optional(),
            tupadBeneficiary: z.boolean().optional(),
            seniorCitizen: z.boolean().optional(),
            pwdMember: z.boolean().optional(),
            indigenousPeople: z.boolean().optional(),
          }),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Unauthorized");
        return await db.createReportTemplate({
          ...input,
          createdBy: ctx.user.id,
        });
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          description: z.string().optional(),
          selectedFields: z.array(z.string()).optional(),
          filters: z.object({
            barangay: z.array(z.string()).optional(),
            municipality: z.array(z.string()).optional(),
            status: z.array(z.string()).optional(),
            dateFrom: z.string().optional(),
            dateTo: z.string().optional(),
            minIncome: z.number().optional(),
            maxIncome: z.number().optional(),
            minAge: z.number().optional(),
            maxAge: z.number().optional(),
            fourPsBeneficiary: z.boolean().optional(),
            tupadBeneficiary: z.boolean().optional(),
            seniorCitizen: z.boolean().optional(),
            pwdMember: z.boolean().optional(),
            indigenousPeople: z.boolean().optional(),
          }).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...updates } = input;
        return await db.updateReportTemplate(id, updates);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteReportTemplate(input.id);
        return { success: true };
      }),

    getFilteredData: publicProcedure
      .input(
        z.object({
          barangay: z.array(z.string()).optional(),
          municipality: z.array(z.string()).optional(),
          status: z.array(z.string()).optional(),
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
          minIncome: z.number().optional(),
          maxIncome: z.number().optional(),
          minAge: z.number().optional(),
          maxAge: z.number().optional(),
          fourPsBeneficiary: z.boolean().optional(),
          tupadBeneficiary: z.boolean().optional(),
          seniorCitizen: z.boolean().optional(),
          pwdMember: z.boolean().optional(),
          indigenousPeople: z.boolean().optional(),
        })
      )
      .query(async ({ input }) => {
        return await db.getFilteredHouseholds(input);
      }),
  }),

  exportLayouts: router({
    create: protectedProcedure
      .input(
        z.object({
          name: z.string(),
          description: z.string().optional(),
          layoutType: z.string(),
          preferences: z.any().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        return await db.createExportLayout({
          ...input,
          createdBy: ctx.user.id,
        });
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getExportLayouts(ctx.user.id);
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        return await db.getExportLayoutById(input.id, ctx.user.id);
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          description: z.string().optional(),
          layoutType: z.string().optional(),
          preferences: z.any().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        return await db.updateExportLayout(id, ctx.user.id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteExportLayout(input.id, ctx.user.id);
        return { success: true };
      }),
  }),

  reportDrafts: router({
    create: protectedProcedure
      .input(
        z.object({
          name: z.string(),
          description: z.string().optional(),
          selectedFields: z.array(z.string()),
          filters: z.any().optional(),
          exportLayout: z.string(),
          customLayoutId: z.number().optional(),
          isPublic: z.boolean().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Generate unique share token
        const shareToken = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
        
        const draft = await db.createReportDraft({
          ...input,
          shareToken,
          createdBy: ctx.user.id,
        });
        
        return draft;
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getReportDrafts(ctx.user.id);
    }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        return db.getReportDraftById(input.id, ctx.user.id);
      }),

    getByToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        return db.getReportDraftByToken(input.token);
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          description: z.string().optional(),
          selectedFields: z.array(z.string()).optional(),
          filters: z.any().optional(),
          exportLayout: z.string().optional(),
          customLayoutId: z.number().optional(),
          isPublic: z.boolean().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        await db.updateReportDraft(id, ctx.user.id, data);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await db.deleteReportDraft(input.id, ctx.user.id);
        return { success: true };
      }),
  }),

  draftComments: router({
    create: protectedProcedure
      .input(
        z.object({
          draftId: z.number(),
          content: z.string().min(1),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const comment = await db.createDraftComment({
          draftId: input.draftId,
          content: input.content,
          authorId: ctx.user.id,
        });
        return comment;
      }),

    list: protectedProcedure
      .input(z.object({ draftId: z.number() }))
      .query(async ({ input }) => {
        return await db.getDraftComments(input.draftId);
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          content: z.string().min(1),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const comment = await db.updateDraftComment(
          input.id,
          ctx.user.id,
          input.content
        );
        return comment;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const success = await db.deleteDraftComment(input.id, ctx.user.id);
        return { success };
      }),
  }),

  upload: router({
    photo: protectedProcedure
      .input(
        z.object({
          fileData: z.string(), // base64 encoded
          fileName: z.string(),
          mimeType: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const fileKey = `households/${ctx.user.id}/${Date.now()}-${input.fileName}`;
        const dataUrl = `data:${input.mimeType};base64,${input.fileData}`;

        return {
          url: dataUrl,
          key: fileKey,
        };
      }),
  }),

  cbms: router({
    // Compute live CBMS indicators from approved survey data
    indicators: protectedProcedure.query(async () => {
      return await db.computeCBMSIndicators();
    }),

    // Return static baseline figures from the PPTX presentation
    baseline: publicProcedure.query(() => {
      return db.CBMS_BASELINE;
    }),

    // Get all threshold configurations
    thresholds: protectedProcedure.query(async () => {
      await db.seedDefaultThresholds();
      return await db.getThresholds();
    }),

    // Update a single threshold configuration
    updateThreshold: protectedProcedure
      .input(
        z.object({
          indicatorKey: z.string(),
          warnThresholdPct: z.number().min(0).max(100),
          criticalThresholdPct: z.number().min(0).max(100),
          isActive: z.boolean(),
        }).refine(
          (data) => data.warnThresholdPct < data.criticalThresholdPct,
          {
            message: "Warning threshold must be lower than critical threshold",
            path: ["warnThresholdPct"],
          }
        )
      )
      .mutation(async ({ input, ctx }) => {
        return await db.upsertThreshold({
          ...input,
          updatedBy: ctx.user.id,
        });
      }),

    // Evaluate live indicators against thresholds and return active alerts
    alerts: protectedProcedure.query(async () => {
      await db.seedDefaultThresholds();
      return await db.evaluateThresholdAlerts();
    }),
  }),
});

export type AppRouter = typeof appRouter;
