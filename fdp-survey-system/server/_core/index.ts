import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createHmac, timingSafeEqual } from "crypto";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { ensureDefaultLocalAdmin, hashPassword, normalizeUsername } from "./localAuth";
import { ENV } from "./env";
import * as db from "../db";
import { ONE_YEAR_MS } from "@shared/const";
import { clearSessionCookieVariants, setCanonicalSessionCookie } from "./cookies";
import { sdk } from "./sdk";

type SurveyHandoffPayload = {
  uid: string;
  email: string;
  name: string;
  role: string;
  iat: number;
  exp: number;
  // The BIS account's own registered barangay/city, if it has one (every
  // role but super_admin does) — lets the handoff auto-fill Section A's
  // location instead of asking the person to set it again in Settings.
  municipality?: string;
  barangay?: string;
};

const normalizeBasePath = (value: string | undefined) => {
  const raw = (value || "/survey").trim();
  if (!raw || raw === "/") return "";
  const withLeading = raw.startsWith("/") ? raw : `/${raw}`;
  return withLeading.endsWith("/") ? withLeading.slice(0, -1) : withLeading;
};

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

const base64UrlEncode = (value: Buffer | string) => Buffer.from(value).toString("base64url");

const base64UrlDecode = (value: string) => Buffer.from(value, "base64url");

const getSurveyHandoffSecret = () => ENV.surveyHandoffSecret;

const encodeSurveyHandoff = (payload: SurveyHandoffPayload) => {
  const payloadBytes = Buffer.from(JSON.stringify(payload), "utf-8");
  const encodedPayload = base64UrlEncode(payloadBytes);
  const signature = createHmac("sha256", getSurveyHandoffSecret())
    .update(encodedPayload)
    .digest();

  return `${encodedPayload}.${base64UrlEncode(signature)}`;
};

const decodeSurveyHandoff = (token: string): SurveyHandoffPayload | null => {
  const [encodedPayload, encodedSignature] = token.split(".");
  if (!encodedPayload || !encodedSignature) {
    return null;
  }

  const expectedSignature = createHmac("sha256", getSurveyHandoffSecret())
    .update(encodedPayload)
    .digest();
  const receivedSignature = base64UrlDecode(encodedSignature);

  if (receivedSignature.length !== expectedSignature.length) {
    return null;
  }

  if (!timingSafeEqual(receivedSignature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf-8")) as Partial<SurveyHandoffPayload>;
    if (
      typeof payload.uid !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.name !== "string" ||
      typeof payload.role !== "string" ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number" ||
      (payload.municipality !== undefined && typeof payload.municipality !== "string") ||
      (payload.barangay !== undefined && typeof payload.barangay !== "string")
    ) {
      return null;
    }

    if (Date.now() > payload.exp * 1000) {
      return null;
    }

    return payload as SurveyHandoffPayload;
  } catch {
    return null;
  }
};

async function startServer() {
  await ensureDefaultLocalAdmin();
  const appBasePath = normalizeBasePath(process.env.APP_BASE_PATH);

  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.post(`${appBasePath}/api/internal/bis/provision-user`, async (req, res) => {
    try {
      const providedKey = String(req.header("x-bis-provision-key") || "").trim();
      const expectedKey = String(ENV.bisProvisionApiKey || "").trim();

      if (!expectedKey || providedKey !== expectedKey) {
        res.status(403).json({ detail: "Forbidden" });
        return;
      }

      if (!ENV.localAuthEnabled) {
        res.status(409).json({ detail: "Local auth is disabled" });
        return;
      }

      const hasSchema = await db.hasLocalAuthSchema();
      if (!hasSchema) {
        res.status(409).json({ detail: "Local auth schema is missing" });
        return;
      }

      const payload = req.body ?? {};
      const externalId = String(payload.externalId || "").trim();
      const name = String(payload.name || "").trim();
      const email = String(payload.email || "").trim().toLowerCase();
      const password = String(payload.password || "");
      const role = String(payload.role || "").trim().toLowerCase();

      if (!externalId || !name || !email || !password) {
        res.status(400).json({ detail: "externalId, name, email, and password are required" });
        return;
      }

      if (password.length < 6) {
        res.status(400).json({ detail: "Password must be at least 6 characters" });
        return;
      }

      if (!["surveyor", "supervisor"].includes(role)) {
        res.status(400).json({ detail: "Only surveyor or supervisor roles are allowed" });
        return;
      }

      const openId = `bis:${externalId}`;
      await db.upsertUser({
        openId,
        name,
        email,
        loginMethod: "local-password",
        role: role as "surveyor" | "supervisor",
        lastSignedIn: new Date(),
      });

      const user = await db.getUserByOpenId(openId);
      if (!user) {
        res.status(500).json({ detail: "Failed to create or fetch provisioned user" });
        return;
      }

      const usernameCandidate = normalizeUsername(email);
      const existingUsername = await db.getLocalCredentialByUsername(usernameCandidate);
      if (existingUsername && existingUsername.userId !== user.id) {
        res.status(409).json({ detail: "Username already exists in FDP" });
        return;
      }

      const { salt, hash } = hashPassword(password);
      await db.upsertLocalCredential({
        userId: user.id,
        username: usernameCandidate,
        passwordHash: hash,
        salt,
        isActive: true,
      });

      res.status(200).json({
        success: true,
        user: {
          id: user.id,
          openId,
          role,
          username: usernameCandidate,
          email,
        },
      });
    } catch (err) {
      console.error("[BIS Provision] Failed to provision FDP user", err);
      res.status(500).json({ detail: "Failed to provision FDP user" });
    }
  });

  app.get(`${appBasePath}/api/internal/auth/handoff`, async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";

    if (!token) {
      res.status(400).json({ detail: "token is required" });
      return;
    }

    const payload = decodeSurveyHandoff(token);
    if (!payload) {
      res.status(403).json({ detail: "Invalid or expired handoff token" });
      return;
    }

    const role = payload.role.trim().toLowerCase();
    if (role !== "admin" && role !== "surveyor" && role !== "supervisor") {
      res.status(403).json({ detail: "Survey handoff is only available for admin, surveyor, or supervisor accounts" });
      return;
    }

    const bisOpenId = `bis:${payload.uid}`;
    const username = normalizeUsername(payload.email);

    let user = await db.getUserByOpenId(bisOpenId);

    // Backward compatibility: if this BIS user was previously mapped to a local credential,
    // reuse it instead of creating a duplicate account.
    if (!user) {
      const credential = await db.getLocalCredentialByUsername(username);
      if (credential?.isActive) {
        const credentialUser = await db.getUserById(credential.userId);
        // Never reuse an existing BIS-linked account by email fallback,
        // otherwise different BIS users that share the same email can overwrite each other.
        if (credentialUser?.openId?.startsWith("local:")) {
          user = credentialUser;
        }
      }
    }

    const resolvedOpenId = user?.openId ?? bisOpenId;

    await db.upsertUser({
      openId: resolvedOpenId,
      name: payload.name || user?.name || username,
      email: payload.email,
      loginMethod: user?.loginMethod ?? "bis-handoff",
      role: role as "admin" | "surveyor" | "supervisor",
      // BIS is authoritative for which barangay/city this account belongs
      // to — sync it on every handoff so a BIS-side reassignment follows
      // through here too. Only super_admin accounts (no barangay in BIS)
      // send neither, in which case whatever's already set here is kept.
      municipality: payload.municipality ?? user?.municipality,
      barangay: payload.barangay ?? user?.barangay,
      lastSignedIn: new Date(),
    });

    const resolvedUser = await db.getUserByOpenId(resolvedOpenId);
    if (!resolvedUser) {
      res.status(500).json({ detail: "Failed to initialize handoff user" });
      return;
    }

    const sessionToken = await sdk.createSessionToken(resolvedUser.openId, {
      name: payload.name || resolvedUser.name || username,
      expiresInMs: ONE_YEAR_MS,
    });

    setCanonicalSessionCookie(req, res, sessionToken);

    const normalizedBase = !appBasePath || appBasePath === "/"
      ? "/"
      : appBasePath.endsWith("/")
        ? appBasePath
        : `${appBasePath}/`;
    res.redirect(302, normalizedBase);
  });

  app.get(`${appBasePath}/switch-account`, (req, res) => {
    const cookieHeader = String(req.headers.cookie || "");
    const hasSessionCookie = cookieHeader.includes("manus-session=");

    console.log("[Auth] switch-account requested", {
      host: req.hostname,
      path: req.path,
      hasSessionCookie,
      cookieHeaderLength: cookieHeader.length,
      userAgent: req.headers["user-agent"] || "",
    });

    clearSessionCookieVariants(req, res);

    // Prevent cached redirects from bypassing fresh cookie clearing.
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const normalizedBase = !appBasePath || appBasePath === "/"
      ? ""
      : appBasePath;
    const redirectTarget = `${normalizedBase}/login?loggedOut=${Date.now()}`;
    console.log("[Auth] switch-account redirect", { redirectTarget });
    res.redirect(302, redirectTarget);
  });

  // Only redirect bare domain root through switch-account when the app is
  // mounted under a non-root base path (for example /survey). If the app is
  // deployed at root, "/" is also the authenticated home route, so redirecting
  // it would log users out on refresh.
  if (appBasePath) {
    const switchAccountPath = `${appBasePath}/switch-account`;
    app.get("/", (_req, res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.redirect(302, switchAccountPath);
    });
  }

  // OAuth callback under /survey/api/oauth/callback
  registerOAuthRoutes(app, `${appBasePath}/api`);
  // tRPC API under /survey/api/trpc
  app.use(
    `${appBasePath}/api/trpc`,
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server, appBasePath);
  } else {
    serveStatic(app, appBasePath);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
