import {
  pgEnum,
  pgTable,
  integer,
  text,
  timestamp,
  varchar,
  numeric,
  jsonb,
  boolean,
  serial,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["user", "admin", "surveyor", "supervisor"]);
export const statusEnum = pgEnum("status", ["draft", "submitted", "approved", "returned"]);

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = pgTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: serial("id").primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  /** The surveyor's own assigned city/municipality and barangay — set once
   * in Settings, then used to auto-fill Section A (Identification) on every
   * survey they conduct, since a surveyor only ever works within one. */
  municipality: varchar("municipality", { length: 255 }),
  barangay: varchar("barangay", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Local credentials for standalone username/password authentication.
 * One credential row maps to exactly one user.
 */
export const localAuthCredentials = pgTable("localAuthCredentials", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  salt: varchar("salt", { length: 64 }).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type LocalAuthCredential = typeof localAuthCredentials.$inferSelect;
export type InsertLocalAuthCredential = typeof localAuthCredentials.$inferInsert;

/**
 * Households table - stores basic household information
 */
export const households = pgTable("households", {
  id: serial("id").primaryKey(),
  
  // Location information
  barangay: varchar("barangay", { length: 255 }).notNull(),
  municipality: varchar("municipality", { length: 255 }).notNull(),
  province: varchar("province", { length: 255 }).default("Parañaque").notNull(),
  
  // Head of family information
  headOfFamily: varchar("headOfFamily", { length: 255 }).notNull(),
  age: integer("age"),
  civilStatus: varchar("civilStatus", { length: 100 }),
  occupation: varchar("occupation", { length: 255 }),
  education: varchar("education", { length: 255 }),
  monthlyIncome: numeric("monthlyIncome", { precision: 10, scale: 2 }),
  
  // GPS coordinates
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  
  // Program membership
  fourPsBeneficiary: boolean("fourPsBeneficiary").default(false),
  tupadBeneficiary: boolean("tupadBeneficiary").default(false),
  seniorCitizen: boolean("seniorCitizen").default(false),
  pwdMember: boolean("pwdMember").default(false),
  indigenousPeople: boolean("indigenousPeople").default(false),
  
  // Survey metadata
  surveyedBy: integer("surveyedBy").references(() => users.id),
  surveyedAt: timestamp("surveyedAt").defaultNow().notNull(),
  verificationPhoto: text("verificationPhoto"), // S3 URL
  verificationPhotoKey: varchar("verificationPhotoKey", { length: 512 }), // S3 key
  
  // Status workflow
  status: statusEnum("status").default("submitted").notNull(),
  reviewedBy: integer("reviewedBy").references(() => users.id),
  reviewedAt: timestamp("reviewedAt"),
  returnReason: text("returnReason"), // Reason for returning the survey
  
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Household = typeof households.$inferSelect;
export type InsertHousehold = typeof households.$inferInsert;

/**
 * Survey responses table - stores detailed survey form data
 */
export const surveyResponses = pgTable("surveyResponses", {
  id: serial("id").primaryKey(),
  householdId: integer("householdId").notNull().references(() => households.id, { onDelete: "cascade" }),
  
  // Section A: Household Identification
  sectionA: jsonb("sectionA").$type<{
    householdNumber?: string;
    dateOfInterview?: string;
    enumeratorName?: string;
    supervisorName?: string;
    houseNumber?: string;
    street?: string;
    purok?: string;
    zipCode?: string;
    respondentContactNumber?: string;
    respondentEmail?: string;
  }>(),
  
  // Section B: Household Roster
  sectionB: jsonb("sectionB").$type<{
    headBirthDate?: string;
    members?: Array<{
      name: string;
      relationship: string;
      sex: string;
      age: number;
      civilStatus: string;
      education: string;
      occupation: string;
      registeredVoter?: boolean;  // Is this member a registered voter? (18+ years old)
    }>;
  }>(),
  
  // Section C: Housing Characteristics
  sectionC: jsonb("sectionC").$type<{
    houseType?: string;           // dwelling type: concrete, semi-concrete, light materials, makeshift
    tenureStatus?: string;        // ownership: owned, rented, informal settler, shared, rent-free
    roofMaterial?: string;
    wallMaterial?: string;
    numberOfRooms?: number;
    waterSource?: string;         // piped, deep well, open well, spring, river, rain, bottled, others
    toiletFacility?: string;      // flush/water-sealed, septic tank, open pit, hanging toilet, none
    electricitySource?: string;   // metered electricity, solar, generator, kerosene/lamp, none
    cookingFuel?: string;         // LPG, charcoal, wood, electricity, others
  }>(),
  
  // Section D: Income and Livelihood (kept for backward compatibility)
  sectionD: jsonb("sectionD").$type<{
    primaryIncomeSource?: string;
    monthlyIncome?: number;
    secondaryIncome?: string;
    hasLivelihoodProgram?: boolean;
    experiencedFoodShortage?: boolean;
  }>(),
  
  // Section E: Health and Nutrition
  sectionE: jsonb("sectionE").$type<{
    hasHealthInsurance?: boolean;       // any health insurance (PhilHealth, private, etc.)
    healthInsuranceType?: string;       // PhilHealth, private, HMO, none
    hasPhilHealth?: boolean;            // specifically PhilHealth coverage
    philHealthType?: string;            // member type: employed, self-employed, indigent/sponsored, etc.
    hasChronicIllness?: boolean;
    chronicIllnessDetails?: string;
    hasDisabledMember?: boolean;
    disabilityDetails?: string;
    hasPregnantMember?: boolean;
    pregnantMemberAge?: string;
    childrenNutritionStatus?: string;   // normal, underweight, severely underweight, overweight
    childrenImmunized?: boolean;
    // CBMS Health Mortality & Nutrition Indicators
    childDeaths?: number;               // number of children under 5 who died in the past 12 months
    childDeathDetails?: string;         // cause of death / circumstances
    maternalDeaths?: number;            // number of women who died due to pregnancy-related causes in past 12 months
    maternalDeathDetails?: string;      // cause of death / circumstances
    malnourishedChildren?: number;      // number of children 0-5 who are malnourished (underweight/severely underweight)
    malnourishedChildrenDetails?: string; // names/ages of malnourished children
  }>(),
  
  // Section F: Education
  sectionF: jsonb("sectionF").$type<{
    childrenInSchool?: number;              // children 6-11 attending elementary
    childrenOutOfSchool?: number;           // children 6-11 NOT attending school (CBMS indicator)
    youthInSchool?: number;                 // youth 12-15 attending high school
    youthOutOfSchool?: number;              // youth 12-15 NOT attending high school (CBMS indicator)
    reasonsForNotAttending?: string;
    hasInternetAccess?: boolean;
    digitalDevices?: string[];              // laptop, phone, tablet, etc.
    informationSources?: string[];          // radio, TV, internet, newspaper, etc.
  }>(),
  
  // Section G: Social Protection
  sectionG: jsonb("sectionG").$type<{
    fourPsBeneficiary?: boolean;
    tupadBeneficiary?: boolean;
    magsakabataanRecipient?: boolean;
    soloParent?: boolean;
    otherPrograms?: string[];
  }>(),
  
  // Section H: Disaster Preparedness & Peace/Order
  sectionH: jsonb("sectionH").$type<{
    hasEmergencyKit?: boolean;
    hasEvacuationPlan?: boolean;            // household has a family evacuation plan (CBMS indicator)
    evacuationCenterAccessible?: boolean;   // knows/can access nearest evacuation center
    disasterExperience?: string;            // type of disaster experienced in last 5 years
    memberOfCommunityOrg?: boolean;
    // CBMS Peace & Order Indicators
    victimOfCrime?: boolean;               // any household member was a victim of crime in past 12 months
    crimeTypes?: string[];                 // types of crime (theft, physical assault, robbery, etc.)
    maleVictims?: number;                  // number of male victims
    femaleVictims?: number;                // number of female victims
    crimeReported?: boolean;               // was the crime reported to authorities?
    reportedTo?: string;                   // barangay, police, DSWD, etc.
    crimeDetails?: string;                 // additional details
  }>(),
  
  // Section I: Agricultural Activities & Livelihood
  sectionI: jsonb("sectionI").$type<{
    hasAgriculturalLand?: boolean;          // owns or tills agricultural land (CBMS indicator)
    landArea?: number;                      // in hectares
    cropsPlanted?: string[];
    hasLivestock?: boolean;
    livestockDetails?: string;
    hasBackyardGarden?: boolean;
    gardenDetails?: string;
    hasSavings?: boolean;
    hasLoanAccess?: boolean;
  }>(),
  
  // Section J: Access to Services
  sectionJ: jsonb("sectionJ").$type<{
    distanceToHealthCenter?: number;
    distanceToSchool?: number;
    distanceToMarket?: number;
    transportationMode?: string;
  }>(),
  
  // Section K: Household Needs and Priorities
  sectionK: jsonb("sectionK").$type<{
    primaryNeeds?: string[];
    priorityPrograms?: string[];
    additionalComments?: string;
  }>(),
  
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type SurveyResponse = typeof surveyResponses.$inferSelect;
export type InsertSurveyResponse = typeof surveyResponses.$inferInsert;

/**
 * Custom report templates table - stores user-defined report configurations
 */
export const reportTemplates = pgTable("reportTemplates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  
  // Field selection - array of field names to include in the report
  selectedFields: jsonb("selectedFields").$type<string[]>().notNull(),
  
  // Filter configuration
  filters: jsonb("filters").$type<{
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
  }>(),
  
  // Created by user
  createdBy: integer("createdBy").references(() => users.id),
  
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type ReportTemplate = typeof reportTemplates.$inferSelect;
export type InsertReportTemplate = typeof reportTemplates.$inferInsert;

/**
 * Custom export layouts table - stores user-defined export format configurations
 */
export const exportLayouts = pgTable("exportLayouts", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  
  // Layout type: 'executive', 'detailed', 'field', or 'custom'
  layoutType: varchar("layoutType", { length: 50 }).notNull(),
  
  // Format preferences
  preferences: jsonb("preferences").$type<{
    includeCharts?: boolean;
    includeMetrics?: boolean;
    includeNarrative?: boolean;
    fontSize?: 'small' | 'medium' | 'large';
    orientation?: 'portrait' | 'landscape';
    pageSize?: 'A4' | 'Letter' | 'Legal';
    headerText?: string;
    footerText?: string;
    includeTimestamp?: boolean;
    includePageNumbers?: boolean;
  }>(),
  
  // Created by user
  createdBy: integer("createdBy").references(() => users.id),
  
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type ExportLayout = typeof exportLayouts.$inferSelect;
export type InsertExportLayout = typeof exportLayouts.$inferInsert;

/**
 * Report drafts table - stores shareable report configurations
 */
export const reportDrafts = pgTable("reportDrafts", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  
  // Unique share token for generating shareable links
  shareToken: varchar("shareToken", { length: 64 }).notNull().unique(),
  
  // Report configuration
  selectedFields: jsonb("selectedFields").$type<string[]>().notNull(),
  filters: jsonb("filters").$type<{
    barangay?: string;
    municipality?: string;
    status?: string;
    minIncome?: number;
    maxIncome?: number;
    minAge?: number;
    maxAge?: number;
    fourPsBeneficiary?: boolean;
    tupadBeneficiary?: boolean;
  }>(),
  
  // Layout selection (either predefined or custom layout ID)
  exportLayout: varchar("exportLayout", { length: 50 }).notNull(),
  customLayoutId: integer("customLayoutId").references(() => exportLayouts.id),
  
  // Draft metadata
  isPublic: boolean("isPublic").default(false).notNull(),
  viewCount: integer("viewCount").default(0).notNull(),
  lastViewedAt: timestamp("lastViewedAt"),
  
  // Created by user
  createdBy: integer("createdBy").references(() => users.id),
  
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type ReportDraft = typeof reportDrafts.$inferSelect;
export type InsertReportDraft = typeof reportDrafts.$inferInsert;

/**
 * Draft comments table - stores comments on report drafts for team collaboration
 */
export const draftComments = pgTable("draftComments", {
  id: serial("id").primaryKey(),
  
  // Reference to the draft
  draftId: integer("draftId").references(() => reportDrafts.id, { onDelete: "cascade" }).notNull(),
  
  // Comment content
  content: text("content").notNull(),
  
  // Comment author
  authorId: integer("authorId").references(() => users.id).notNull(),
  
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type DraftComment = typeof draftComments.$inferSelect;
export type InsertDraftComment = typeof draftComments.$inferInsert;

/**
 * CBMS threshold configurations - stores per-indicator alert thresholds
 */
export const cbmsThresholds = pgTable("cbmsThresholds", {
  id: serial("id").primaryKey(),

  // The indicator key (e.g. "belowPoverty", "informalSettlers")
  indicatorKey: varchar("indicatorKey", { length: 100 }).notNull().unique(),

  // Human-readable indicator name
  indicatorName: varchar("indicatorName", { length: 200 }).notNull(),

  // CBMS baseline percentage for this indicator
  baselinePct: numeric("baselinePct", { precision: 6, scale: 2 }).notNull(),

  // Alert fires when live % EXCEEDS baseline by this many percentage points
  warnThresholdPct: numeric("warnThresholdPct", { precision: 6, scale: 2 }).default("5.00").notNull(),

  // Alert fires at critical level when live % exceeds baseline by this many pp
  criticalThresholdPct: numeric("criticalThresholdPct", { precision: 6, scale: 2 }).default("10.00").notNull(),

  // Whether this threshold is active
  isActive: boolean("isActive").default(true).notNull(),

  // Who last updated this threshold
  updatedBy: integer("updatedBy").references(() => users.id),

  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type CbmsThreshold = typeof cbmsThresholds.$inferSelect;
export type InsertCbmsThreshold = typeof cbmsThresholds.$inferInsert;
