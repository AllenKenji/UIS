export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

const normalizeBasePath = (value: string | undefined) => {
  const raw = (value || "/survey/").trim();
  if (!raw || raw === "/") return "";
  const withLeading = raw.startsWith("/") ? raw : `/${raw}`;
  return withLeading.endsWith("/") ? withLeading.slice(0, -1) : withLeading;
};

export const APP_BASE_PATH = normalizeBasePath(import.meta.env.VITE_BASE_PATH);

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  const authMode = import.meta.env.VITE_AUTH_MODE ?? "local";

  if (authMode !== "oauth") {
    return `${APP_BASE_PATH}/login`;
  }

  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}${APP_BASE_PATH}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};

export const getSwitchAccountUrl = () => `${APP_BASE_PATH}/switch-account`;
