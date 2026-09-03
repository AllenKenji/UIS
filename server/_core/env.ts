const oAuthServerUrl =
  process.env.OAUTH_SERVER_URL ?? process.env.VITE_OAUTH_PORTAL_URL ?? "";

const devAuthBypassEnabled =
  process.env.NODE_ENV !== "production" &&
  process.env.DEV_AUTH_BYPASS === "true";

type DevAuthRole = "admin" | "surveyor" | "supervisor" | "user";

const devAuthRole: DevAuthRole =
  process.env.DEV_AUTH_ROLE === "admin" ||
  process.env.DEV_AUTH_ROLE === "surveyor" ||
  process.env.DEV_AUTH_ROLE === "supervisor" ||
  process.env.DEV_AUTH_ROLE === "user"
    ? process.env.DEV_AUTH_ROLE
    : "admin";

type AuthRole = "admin" | "surveyor" | "supervisor" | "user";

const singleAccountRole: AuthRole =
  process.env.SINGLE_ACCOUNT_ROLE === "admin" ||
  process.env.SINGLE_ACCOUNT_ROLE === "surveyor" ||
  process.env.SINGLE_ACCOUNT_ROLE === "supervisor" ||
  process.env.SINGLE_ACCOUNT_ROLE === "user"
    ? process.env.SINGLE_ACCOUNT_ROLE
    : "admin";

const localAuthDefaultRole: AuthRole =
  process.env.LOCAL_AUTH_DEFAULT_ROLE === "admin" ||
  process.env.LOCAL_AUTH_DEFAULT_ROLE === "surveyor" ||
  process.env.LOCAL_AUTH_DEFAULT_ROLE === "supervisor" ||
  process.env.LOCAL_AUTH_DEFAULT_ROLE === "user"
    ? process.env.LOCAL_AUTH_DEFAULT_ROLE
    : "admin";

const surveyHandoffSecret =
  process.env.FDP_SURVEY_HANDOFF_SECRET &&
  process.env.FDP_SURVEY_HANDOFF_SECRET.trim().length > 0
    ? process.env.FDP_SURVEY_HANDOFF_SECRET
    : "fdp-survey-handoff-dev-secret";

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret:
    process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length > 0
      ? process.env.JWT_SECRET
      : process.env.NODE_ENV === "production"
        ? ""
        : "fdp-local-dev-jwt-secret-change-me",
  databaseUrl: process.env.DATABASE_URL ?? "",
  bisApiBaseUrl: process.env.BIS_API_BASE_URL ?? "http://localhost:8000",
  oAuthServerUrl,
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  devAuthBypassEnabled,
  devAuthOpenId: process.env.DEV_AUTH_OPEN_ID ?? "local-dev-user",
  devAuthName: process.env.DEV_AUTH_NAME ?? "Local Developer",
  devAuthRole,
  singleAccountModeEnabled: process.env.SINGLE_ACCOUNT_MODE === "true",
  singleAccountOpenId:
    process.env.SINGLE_ACCOUNT_OPEN_ID ?? "survey-admin-account",
  singleAccountName: process.env.SINGLE_ACCOUNT_NAME ?? "Survey Admin",
  singleAccountRole,
  localAuthEnabled: process.env.LOCAL_AUTH_ENABLED !== "false",
  localAuthBootstrapEnabled: process.env.LOCAL_AUTH_BOOTSTRAP !== "false",
  localAuthDefaultUsername: process.env.LOCAL_AUTH_DEFAULT_USERNAME ?? "admin",
  localAuthDefaultPassword: process.env.LOCAL_AUTH_DEFAULT_PASSWORD ?? "admin123",
  localAuthDefaultName: process.env.LOCAL_AUTH_DEFAULT_NAME ?? "FDP Administrator",
  localAuthDefaultRole,
  surveyHandoffSecret,
  bisProvisionApiKey: process.env.BIS_PROVISION_API_KEY ?? "",
  bisAccountProvisionUrl: process.env.BIS_ACCOUNT_PROVISION_URL ?? "",
  bisAccountProvisionApiKey: process.env.BIS_ACCOUNT_PROVISION_API_KEY ?? "",
  bisAccountProvisionRequired:
    String(process.env.BIS_ACCOUNT_PROVISION_REQUIRED ?? "false").trim().toLowerCase() === "true",
};
