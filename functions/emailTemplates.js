// functions/emailTemplates.js

function welcomeTemplate({ fullName, email, barangay }) {
  return {
    subject: `Welcome to ${barangay}`,
    text: `Dear ${fullName},

Welcome to the Barangay ${barangay} Registry system.

Login details:
Username: ${email}
Password: 123456 (please change after first login)

Login here: https://barangay-1721d.web.app

Best regards,
Barangay ${barangay} Registry Team`,
  };
}

function passwordResetTemplate({ fullName, resetLink }) {
  return {
    subject: "Password Reset Request",
    text: `Hello ${fullName},

We received a request to reset your password.
Click the link below to set a new password:

${resetLink}

If you did not request this, please ignore this email.`,
    html: `
      <p>Hello <strong>${fullName}</strong>,</p>
      <p>We received a request to reset your password.</p>
      <p>
        <a href="${resetLink}" style="color:#1a73e8; text-decoration:none;">
          👉 Click here to set a new password
        </a>
      </p>
      <p>If you did not request this, please ignore this email.</p>
    `,
  };
}


module.exports = {
  welcomeTemplate,
  passwordResetTemplate,
};
