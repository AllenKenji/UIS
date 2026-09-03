import { ENV } from "./_core/env";

const BIS_SYNC_ROLES = new Set(["surveyor", "supervisor"]);

type ProvisionBisAccountInput = {
  name: string;
  username: string;
  password: string;
  role: "admin" | "surveyor" | "supervisor" | "user";
  requestedBy?: string;
};

function isLikelyEmail(value: string): boolean {
  const email = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function buildProvisionUrl(): string {
  const explicit = String(ENV.bisAccountProvisionUrl || "").trim();
  if (explicit) return explicit;

  const base = String(ENV.bisApiBaseUrl || "").trim();
  if (!base) return "";

  return new URL("api/internal/fdp/provision-account", base.endsWith("/") ? base : `${base}/`).toString();
}

export async function provisionBisAccountFromFdp(input: ProvisionBisAccountInput): Promise<void> {
  const strictSync = ENV.bisAccountProvisionRequired;
  if (!BIS_SYNC_ROLES.has(input.role)) {
    return;
  }

  if (!isLikelyEmail(input.username)) {
    const detail = `Skipping BIS account sync because username is not a valid email: ${input.username}`;
    if (strictSync) {
      throw new Error(detail);
    }
    console.warn(`[BIS Account Sync] ${detail}`);
    return;
  }

  const provisionUrl = buildProvisionUrl();
  const provisionKey = String(ENV.bisAccountProvisionApiKey || "").trim();
  if (!provisionUrl || !provisionKey) {
    const detail = "BIS account sync is not configured. Set BIS_ACCOUNT_PROVISION_URL (or BIS_API_BASE_URL) and BIS_ACCOUNT_PROVISION_API_KEY.";
    if (strictSync) {
      throw new Error(detail);
    }
    console.warn(`[BIS Account Sync] ${detail}`);
    return;
  }

  const response = await fetch(provisionUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-fdp-provision-key": provisionKey,
    },
    body: JSON.stringify({
      name: input.name,
      email: input.username.trim().toLowerCase(),
      password: input.password,
      role: input.role,
      requestedBy: input.requestedBy,
    }),
  });

  if (response.ok) {
    return;
  }

  const detail = await response.text();
  const message = `BIS account sync failed (${response.status} ${response.statusText}): ${detail}`;
  if (strictSync) {
    throw new Error(message);
  }

  console.warn(`[BIS Account Sync] ${message}`);
}