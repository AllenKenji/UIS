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

const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

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
  if (!email) return res.status(400).json({ error: "Recipient email is required" });

  try {
    const accessToken = await oAuth2Client.getAccessToken();
    const tokenValue = typeof accessToken === "string" ? accessToken : accessToken?.token;

    if (!tokenValue) throw new Error("❌ Failed to retrieve Gmail access token");

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

    const { subject, text, html } = getTemplate(type, { fullName, email, barangay, resetLink });

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
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Email error:", err.message);
    res.status(500).json({ error: "Failed to send email" });
  }
});

// ✅ v2 region placement
exports.sendEmailAsia = https.onRequest({ region: "asia-southeast1" }, app);
