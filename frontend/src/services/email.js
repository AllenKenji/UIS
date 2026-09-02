import { api } from "./api";

export async function sendEmail(payload) {

  if (!payload?.email) {
    throw new Error("❌ Missing recipient email in payload");
  }

  try {
    const response = await api.post("/api/email", { type: payload.type || "welcome", ...payload });
    return response.data;
  } catch (err) {
    console.error("❌ Email request failed:", err);
    throw err;
  }
}
