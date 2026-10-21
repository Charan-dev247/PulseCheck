
import "dotenv/config";
import nodemailer from "nodemailer";

const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpFrom = process.env.SMTP_FROM;
const alertEmail = process.env.ALERT_EMAIL;

const isConfigured = Boolean(
  smtpHost && smtpUser && smtpPass && smtpFrom && alertEmail
);

const transporter = isConfigured
  ? nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    })
  : null;

async function sendAlertEmail(subject: string, text: string) {
  if (!transporter || !smtpFrom || !alertEmail) {
    console.warn(
      "Email alerts are not configured. Skipping notification."
    );
    return;
  }

  try {
    const info = await transporter.sendMail({
      from: smtpFrom,
      to: alertEmail,
      subject,
      text,
    });

    console.log("Email accepted by SMTP:", {
      subject,
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response,
    });

    if (info.rejected.length > 0) {
      console.error(
        "SMTP rejected these recipients:",
        info.rejected
      );
    }
  } catch (error) {
    // Email failures must not stop website monitoring.
    console.error("Failed to send email alert:", {
      subject,
      error,
    });
  }
}

export async function sendOutageAlert(
  monitorName: string,
  monitorUrl: string,
  reason: string
) {
  await sendAlertEmail(
    `[PulseCheck] Website Down: ${monitorName}`,
    [
      `Monitor: ${monitorName}`,
      `URL: ${monitorUrl}`,
      `Status: DOWN`,
      `Reason: ${reason}`,
      "",
      "PulseCheck detected an outage after the configured failure threshold.",
    ].join("\n")
  );
}

export async function sendRecoveryAlert(
  monitorName: string,
  monitorUrl: string
) {
  await sendAlertEmail(
    `[PulseCheck] Website Recovered: ${monitorName}`,
    [
      `Monitor: ${monitorName}`,
      `URL: ${monitorUrl}`,
      `Status: UP`,
      "",
      "PulseCheck detected that the website has recovered.",
    ].join("\n")
  );
}
