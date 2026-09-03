import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import * as db from "../db";
import { ENV } from "./env";

const SCRYPT_KEYLEN = 64;

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function hashPassword(password: string, salt?: string): { salt: string; hash: string } {
  const resolvedSalt = salt ?? randomBytes(16).toString("hex");
  const hashBuffer = scryptSync(password, resolvedSalt, SCRYPT_KEYLEN);
  return {
    salt: resolvedSalt,
    hash: hashBuffer.toString("hex"),
  };
}

export function verifyPassword(password: string, salt: string, expectedHashHex: string): boolean {
  const actualHashBuffer = scryptSync(password, salt, SCRYPT_KEYLEN);
  const expectedHashBuffer = Buffer.from(expectedHashHex, "hex");

  if (expectedHashBuffer.length !== actualHashBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedHashBuffer, actualHashBuffer);
}

export async function ensureDefaultLocalAdmin(): Promise<void> {
  if (!ENV.localAuthBootstrapEnabled) return;

  const hasSchema = await db.hasLocalAuthSchema();
  if (!hasSchema) {
    console.warn("[LocalAuth] Skipping local auth bootstrap because localAuthCredentials table is missing. Run: pnpm db:push");
    return;
  }

  const username = normalizeUsername(ENV.localAuthDefaultUsername);
  if (!username) {
    console.warn("[LocalAuth] LOCAL_AUTH_DEFAULT_USERNAME is empty; skipping bootstrap");
    return;
  }

  const existingCredential = await db.getLocalCredentialByUsername(username);
  if (existingCredential) return;

  await db.upsertUser({
    openId: `local:${username}`,
    name: ENV.localAuthDefaultName,
    loginMethod: "local-password",
    role: ENV.localAuthDefaultRole,
    lastSignedIn: new Date(),
  });

  const user = await db.getUserByOpenId(`local:${username}`);
  if (!user) {
    throw new Error("Failed to create default local auth user");
  }

  const { salt, hash } = hashPassword(ENV.localAuthDefaultPassword);
  await db.upsertLocalCredential({
    userId: user.id,
    username,
    passwordHash: hash,
    salt,
    isActive: true,
  });

  if (ENV.localAuthDefaultPassword === "admin123") {
    console.warn("[LocalAuth] Default admin credentials created with fallback password. Set LOCAL_AUTH_DEFAULT_PASSWORD immediately.");
  }

  console.log(`[LocalAuth] Bootstrapped standalone account: ${username}`);
}
