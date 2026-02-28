export async function sendEmail(payload) {
  const url = process.env.REACT_APP_MAIL_URL;

  if (!payload?.email) {
    throw new Error("❌ Missing recipient email in payload");
  }

  const body = JSON.stringify({
    type: payload.type || "welcome",
    ...payload,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    console.debug("📩 Sending email request:", { url, payload });

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("❌ Email API error:", {
        status: response.status,
        statusText: response.statusText,
        errorBody,
      });
      throw new Error(
        `❌ Failed to send email: ${response.status} ${response.statusText} - ${errorBody}`
      );
    }

    const result = await response.json();
    console.debug("✅ Email API response:", result);
    return result;
  } catch (err) {
    clearTimeout(timeoutId);
    console.error("❌ Email request failed:", err);
    throw err;
  }
}
