import { timingSafeEqual } from "node:crypto";

import nodemailer from "nodemailer";


const PURPOSE_LABELS = {
  signup: "cadastro",
  login: "login",
};

export function authorized(request) {
  const expected = process.env.EMAIL_DELIVERY_HTTP_TOKEN || "";
  const header = request.headers.authorization || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  return (
    expectedBuffer.length >= 32 &&
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

export function validPayload(payload) {
  return Boolean(
    payload &&
      typeof payload.recipient === "string" &&
      payload.recipient.length <= 254 &&
      /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.recipient) &&
      typeof payload.code === "string" &&
      /^\d{6}$/.test(payload.code) &&
      Object.hasOwn(PURPOSE_LABELS, payload.purpose) &&
      Number.isInteger(payload.expires_minutes) &&
      payload.expires_minutes >= 1 &&
      payload.expires_minutes <= 60
  );
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ detail: "Method not allowed" });
  }
  if (!authorized(request)) {
    return response.status(401).json({ detail: "Unauthorized" });
  }
  if (!validPayload(request.body)) {
    return response.status(400).json({ detail: "Invalid payload" });
  }

  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpUsername = process.env.SMTP_USERNAME || process.env.SMTP_USER;
  const smtpPassword = process.env.SMTP_PASSWORD;
  const smtpFrom = process.env.SMTP_FROM || process.env.EMAIL_FROM;
  if (!process.env.SMTP_HOST || !smtpUsername || !smtpPassword || !smtpFrom) {
    return response.status(503).json({ detail: "Email delivery unavailable" });
  }

  const { recipient, code, purpose, expires_minutes: expiresMinutes } = request.body;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: smtpPort,
    secure: smtpPort === 465,
    requireTLS: smtpPort !== 465,
    auth: {
      user: smtpUsername,
      pass: smtpPassword,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  try {
    await transporter.sendMail({
      from: smtpFrom,
      to: recipient,
      subject: `Codigo CasaSync para ${PURPOSE_LABELS[purpose]}`,
      text: [
        "Use este codigo para continuar no CasaSync:",
        "",
        code,
        "",
        `Ele expira em ${expiresMinutes} minutos. Se voce nao pediu este codigo, ignore este e-mail.`,
      ].join("\n"),
    });
  } catch (error) {
    console.error("CasaSync email relay failure", {
      name: error?.name,
      code: error?.code,
      responseCode: error?.responseCode,
    });
    return response.status(503).json({ detail: "Email delivery unavailable" });
  }

  return response.status(204).end();
}
