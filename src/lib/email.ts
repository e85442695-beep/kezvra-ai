import nodemailer, { type Transporter } from "nodemailer";
import { env, integrations } from "./env";
import { logger } from "./logger";

let transport: Transporter | null = null;

/**
 * Sends transactional mail via SMTP. If SMTP is not configured, the message is NOT sent; in
 * development the link is printed to the server console so flows can be tested locally.
 */
export async function sendMail(to: string, subject: string, text: string, html?: string) {
  if (!integrations.email) {
    if (env.NODE_ENV !== "production") console.info(`[email:dev] to=${to} subject=${subject}\n${text}`);
    else logger.error({ subject }, "SMTP not configured — email not sent");
    return false;
  }
  transport ??= nodemailer.createTransport(env.SMTP_URL);
  await transport.sendMail({ from: env.EMAIL_FROM, to, subject, text, html });
  return true;
}

export function verificationEmail(link: string, locale: string) {
  return locale === "en"
    ? { subject: "Confirm your Kezvra email", text: `Confirm your email address:\n${link}\n\nThe link is valid for 24 hours.` }
    : { subject: "Підтвердіть email у Kezvra", text: `Підтвердіть адресу електронної пошти:\n${link}\n\nПосилання дійсне 24 години.` };
}

export function resetEmail(link: string, locale: string) {
  return locale === "en"
    ? { subject: "Reset your Kezvra password", text: `Reset your password:\n${link}\n\nThe link is valid for 1 hour. If you didn't request this, ignore this email.` }
    : { subject: "Скидання пароля Kezvra", text: `Скиньте пароль за посиланням:\n${link}\n\nПосилання дійсне 1 годину. Якщо ви не робили запит — проігноруйте лист.` };
}
