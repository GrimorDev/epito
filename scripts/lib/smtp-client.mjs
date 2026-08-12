// SMTP submission directly to the mailbox's own mail server (Zimbra/OVH),
// using that mailbox's own login — not a third-party ESP. lead.notify sends
// biuro@ -> biuro@ on the same server, which is local delivery with no
// external MX handoff, so it never sits in another provider's greylist queue
// the way a brand-new Resend/SES sender identity did. scripts/ksef-worker.mjs
// is the only process with outbound internet egress in this deployment, same
// reasoning as ksef-client.mjs/whitelist-client.mjs.
import nodemailer from "nodemailer";

// Never throws — a single failed send shouldn't crash the daily reminder
// scan, just skip that one email and let the caller log/continue.
export async function sendEmail({ host, port, secure, user, pass, from, to, subject, html, replyTo }) {
  if (!host || !user || !pass) return { ok: false, error: "Brak konfiguracji SMTP." };
  const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  try {
    const info = await transporter.sendMail({ from, to, subject, html, ...(replyTo ? { replyTo } : {}) });
    return { ok: true, id: info.messageId || null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Błąd sieci." };
  } finally {
    transporter.close();
  }
}
