import type { Household, SurveyResponse } from "../drizzle/schema";
import { ENV } from "./_core/env";

type BisResidentPayload = {
  fullName: string;
  birthDate: string;
  gender: "Male" | "Female" | "Other";
  civilStatus: "Single" | "Married" | "Widowed" | "Separated";
  contactNumber: string;
  email: string;
  address: {
    houseNumber: string;
    street: string;
    purok?: string;
    barangay: string;
    city: string;
    province: string;
    zipCode?: string;
  };
  householdId: string;
  isHeadOfFamily: true;
  voterStatus: "yes" | "no" | "unknown";
  occupation?: string;
  remarks: string;
};

type SyncResult =
  | { status: "disabled" }
  | { status: "skipped"; reason: string }
  | { status: "exists"; residentId?: string }
  | { status: "created"; residentId?: string };

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function trimToUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizePhone(value: unknown): string | undefined {
  const raw = trimToUndefined(value);
  if (!raw) return undefined;

  const digits = raw.replace(/\D/g, "");
  if (/^09\d{9}$/.test(digits)) {
    return digits;
  }
  if (/^639\d{9}$/.test(digits)) {
    return `0${digits.slice(2)}`;
  }

  return undefined;
}

function normalizeGender(value: unknown): "Male" | "Female" | "Other" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "male") return "Male";
  if (normalized === "female") return "Female";
  return "Other";
}

function normalizeCivilStatus(value: unknown): "Single" | "Married" | "Widowed" | "Separated" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "married") return "Married";
  if (normalized === "widowed") return "Widowed";
  if (normalized === "separated") return "Separated";
  return "Single";
}

function normalizeEmail(value: unknown): string | undefined {
  const email = trimToUndefined(value)?.toLowerCase();
  if (!email) return undefined;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
}

function buildResidentPayload(
  household: Household,
  survey: SurveyResponse,
): BisResidentPayload | null {
  const sectionA = (survey.sectionA ?? {}) as Record<string, unknown>;
  const sectionB = (survey.sectionB ?? {}) as Record<string, unknown>;
  const members = Array.isArray(sectionB.members) ? sectionB.members : [];
  const headMember = members[0] as Record<string, unknown> | undefined;

  const fullName = trimToUndefined(household.headOfFamily) ?? trimToUndefined(headMember?.name);
  const birthDate = trimToUndefined(sectionB.headBirthDate);
  const email = normalizeEmail(sectionA.respondentEmail);
  const contactNumber = normalizePhone(sectionA.respondentContactNumber);
  const houseNumber = trimToUndefined(sectionA.houseNumber);
  const street = trimToUndefined(sectionA.street);
  const purok = trimToUndefined(sectionA.purok);

  if (!fullName || !birthDate || !email || !contactNumber || !houseNumber || !street) {
    const missing = [];
    if (!fullName) missing.push("fullName");
    if (!birthDate) missing.push("birthDate");
    if (!email) missing.push("email");
    if (!contactNumber) missing.push("contactNumber");
    if (!houseNumber) missing.push("houseNumber");
    if (!street) missing.push("street");
    console.warn(`[BIS Sync] Missing required fields: ${missing.join(", ")}`);
    return null;
  }

  const registeredVoter = headMember?.registeredVoter;
  const voterStatus =
    typeof registeredVoter === "boolean"
      ? registeredVoter
        ? "yes"
        : "no"
      : "unknown";

  const originalCivilStatus = trimToUndefined(household.civilStatus) ?? trimToUndefined(headMember?.civilStatus);

  return {
    fullName,
    birthDate,
    gender: normalizeGender(headMember?.sex),
    civilStatus: normalizeCivilStatus(originalCivilStatus),
    contactNumber,
    email,
    address: {
      houseNumber,
      street,
      purok,
      barangay: household.barangay,
      city: household.municipality,
      province: household.province,
      zipCode: trimToUndefined(sectionA.zipCode),
    },
    householdId: trimToUndefined(sectionA.householdNumber) ?? `FDP-HH-${household.id}`,
    isHeadOfFamily: true,
    voterStatus,
    occupation: trimToUndefined(household.occupation) ?? trimToUndefined(headMember?.occupation),
    remarks: originalCivilStatus && originalCivilStatus.toLowerCase() === "cohabiting"
      ? `Imported from FDP survey household ${household.id}. Original civil status: ${originalCivilStatus}.`
      : `Imported from FDP survey household ${household.id}.`,
  };
}

// POST /residents on the BIS side requires an interactive staff login
// (get_current_user + manageResidents) — this server has no such session, so
// a plain unauthenticated call there always 401s. /internal/fdp/provision-resident
// is the service-to-service counterpart (same trust boundary/API key as
// bisAccountProvision.ts's /internal/fdp/provision-account) that does the
// find-or-create in one authenticated call instead.
async function provisionResident(
  payload: BisResidentPayload,
  provisionKey: string,
): Promise<{ id?: string; created: boolean }> {
  const url = new URL("api/internal/fdp/provision-resident", ensureTrailingSlash(ENV.bisApiBaseUrl));
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-fdp-provision-key": provisionKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw new Error(`BIS resident provisioning failed (${response.status} ${response.statusText}): ${detail}`);
  }

  return (await response.json()) as { id?: string; created: boolean };
}

export async function syncSurveyToBisResident(
  household: Household | undefined,
  survey: SurveyResponse | undefined,
): Promise<SyncResult> {
  if (!ENV.bisApiBaseUrl) {
    return { status: "disabled" };
  }

  const provisionKey = String(ENV.bisAccountProvisionApiKey || "").trim();
  if (!provisionKey) {
    return { status: "skipped", reason: "bis_provision_api_key_not_configured" };
  }

  if (!household || !survey) {
    return { status: "skipped", reason: "missing_household_or_survey" };
  }

  const payload = buildResidentPayload(household, survey);
  if (!payload) {
    return { status: "skipped", reason: "missing_required_identity_fields" };
  }

  const result = await provisionResident(payload, provisionKey);
  return result.created
    ? { status: "created", residentId: result.id }
    : { status: "exists", residentId: result.id };
}

export { buildResidentPayload };