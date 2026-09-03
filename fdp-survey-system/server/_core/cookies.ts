import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { CookieOptions, Request, Response } from "express";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  // const hostname = req.hostname;
  // const shouldSetDomain =
  //   hostname &&
  //   !LOCAL_HOSTS.has(hostname) &&
  //   !isIpAddress(hostname) &&
  //   hostname !== "127.0.0.1" &&
  //   hostname !== "::1";

  // const domain =
  //   shouldSetDomain && !hostname.startsWith(".")
  //     ? `.${hostname}`
  //     : shouldSetDomain
  //       ? hostname
  //       : undefined;

  const secure = isSecureRequest(req);

  return {
    httpOnly: true,
    path: "/",
    sameSite: secure ? "none" : "lax",
    secure,
  };
}

function getNormalizedBasePath() {
  const appBasePath = (process.env.APP_BASE_PATH || "/survey").trim();
  if (!appBasePath || appBasePath === "/") {
    return "/";
  }
  const withLeadingSlash = appBasePath.startsWith("/") ? appBasePath : `/${appBasePath}`;
  return withLeadingSlash.endsWith("/") && withLeadingSlash.length > 1
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash;
}

function getDomainVariants(req: Request): Array<string | undefined> {
  const hostname = String(req.hostname || "").trim().toLowerCase();
  if (!hostname || LOCAL_HOSTS.has(hostname) || isIpAddress(hostname)) {
    return [undefined];
  }

  return [undefined, hostname, `.${hostname}`];
}

export function clearSessionCookieVariants(req: Request, res: Response) {
  const cookieOptions = getSessionCookieOptions(req);
  const normalizedBasePath = getNormalizedBasePath();
  const clearPaths = new Set<string>(["/", normalizedBasePath, `${normalizedBasePath}/`]);
  const clearDomains = getDomainVariants(req);
  const clearVariants = [
    { secure: cookieOptions.secure, sameSite: cookieOptions.sameSite },
    { secure: true, sameSite: "none" as const },
    { secure: false, sameSite: "lax" as const },
  ];

  for (const path of clearPaths) {
    for (const domain of clearDomains) {
      for (const variant of clearVariants) {
        res.clearCookie(COOKIE_NAME, {
          ...cookieOptions,
          ...variant,
          path,
          domain,
        });
      }
    }
  }
}

export function setCanonicalSessionCookie(req: Request, res: Response, sessionToken: string) {
  const cookieOptions = getSessionCookieOptions(req);
  clearSessionCookieVariants(req, res);
  res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
}
