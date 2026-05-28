require("dotenv").config();
const { google } = require("googleapis");
const nodemailer = require("nodemailer");
const { https } = require("firebase-functions/v2"); // ✅ v2 import
const express = require("express");
const cors = require("cors");
const { welcomeTemplate, passwordResetTemplate } = require("./emailTemplates");

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
const REDIRECT_URI = "https://developers.google.com/oauthplayground";
const isProd = process.env.NODE_ENV === "production";

const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

function sendError(res, status, code, message, err) {
  const payload = {
    success: false,
    error: code,
    message,
  };

  // Keep production responses safe, but return details in non-prod for debugging.
  if (!isProd && err?.message) {
    payload.detail = err.message;
  }

  return res.status(status).json(payload);
}

// 🔧 Template selector
function getTemplate(type, payload) {
  switch (type) {
    case "welcome":
      return welcomeTemplate(payload);
    case "reset":
      return passwordResetTemplate(payload);
    default:
      throw new Error("Invalid email type");
  }
}

app.post("/", async (req, res) => {
  console.log("📩 Backend received body:", req.body);

  const { type, fullName, email, barangay, resetLink } = req.body;
  if (!email) {
    return sendError(res, 400, "EMAIL_REQUIRED", "Recipient email is required");
  }

  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    console.error("❌ Mail config missing required OAuth environment variables");
    return sendError(
      res,
      500,
      "MAIL_CONFIG_MISSING",
      "Mail service is not configured"
    );
  }

  let subject;
  let text;
  let html;
  try {
    const template = getTemplate(type, { fullName, email, barangay, resetLink });
    subject = template.subject;
    text = template.text;
    html = template.html;
  } catch (err) {
    return sendError(res, 400, "INVALID_EMAIL_TYPE", "Invalid email type", err);
  }

  let tokenValue;
  try {
    const accessToken = await oAuth2Client.getAccessToken();
    tokenValue = typeof accessToken === "string" ? accessToken : accessToken?.token;

    if (!tokenValue) throw new Error("Failed to retrieve Gmail access token");
  } catch (err) {
    console.error("❌ OAuth token error:", err?.message || err);
    return sendError(
      res,
      500,
      "OAUTH_TOKEN_FAILED",
      "Failed to retrieve Gmail access token",
      err
    );
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: "jonladyong@gmail.com",
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      refreshToken: REFRESH_TOKEN,
      accessToken: tokenValue,
    },
  });

  try {
    await transporter.verify();
  } catch (err) {
    console.error("❌ SMTP auth/verify error:", err?.message || err);
    return sendError(
      res,
      500,
      "SMTP_AUTH_FAILED",
      "Failed to authenticate with SMTP provider",
      err
    );
  }

  try {
    const mailOptions = {
      from: `"Barangay System" <jonladyong@gmail.com>`,
      to: email,
      subject,
      text,
      html,
    };

    console.log(`📩 Sending ${type} email to:`, email);

    const result = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent:", result);
    return res.json({ success: true });
  } catch (err) {
    console.error("❌ SMTP send error:", err?.message || err);
    return sendError(
      res,
      500,
      "SMTP_SEND_FAILED",
      "Failed to send email",
      err
    );
  }
});

// ✅ v2 region placement
exports.sendEmailAsia = https.onRequest({ region: "asia-southeast1" }, app);
