import "server-only";
import { appBaseUrl, emailEnabled, env } from "@/lib/env";
import type { Role } from "@/lib/constants";

/**
 * Transactional email via Brevo (https://brevo.com) over its REST API.
 *
 * Unlike domain-locked providers, Brevo delivers to ANY recipient once you
 * verify a single sender address — so no domain is required. Entirely OPTIONAL:
 * when `BREVO_API_KEY` is unset every sender becomes a no-op, so the app runs
 * unchanged without email. Sends are best-effort — a failure is logged but NEVER
 * thrown, so a flaky mail provider can't break the action that triggered it.
 */
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

const APP_NAME = "Palimpsest";

interface SendResult {
  sent: boolean;
  error?: string;
}

/** Parse `EMAIL_FROM` ("Name <email@x>" or bare "email@x") into Brevo's shape. */
function parseSender(from: string): { name: string; email: string } {
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1] || APP_NAME, email: m[2]!.trim() };
  return { name: APP_NAME, email: from.trim() };
}

async function send(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendResult> {
  if (!emailEnabled) return { sent: false, error: "email_disabled" };
  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": env.BREVO_API_KEY,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: parseSender(env.EMAIL_FROM),
        to: [{ email: opts.to }],
        subject: opts.subject,
        htmlContent: opts.html,
        textContent: opts.text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[email] Brevo send failed:", res.status, detail);
      return { sent: false, error: `brevo_${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.error("[email] send threw:", err);
    return { sent: false, error: (err as Error).message };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Notify an existing user that they've been given access to a document.
 * Fire-and-forget from the share flow; safe to call even when email is disabled.
 */
export async function sendShareNotification(params: {
  to: string;
  inviterName: string;
  documentTitle: string;
  documentId: string;
  role: Role;
}): Promise<SendResult> {
  const url = `${appBaseUrl()}/documents/${params.documentId}`;
  const title = escapeHtml(params.documentTitle);
  const inviter = escapeHtml(params.inviterName);
  const roleLabel = params.role === "viewer" ? "view" : "edit";

  const subject = `${inviter} shared "${params.documentTitle}" with you`;
  const text =
    `${params.inviterName} gave you access to "${params.documentTitle}" on ${APP_NAME} ` +
    `(you can ${roleLabel} it).\n\nOpen it here: ${url}`;
  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:480px;margin:0 auto;color:#1a1a17">
    <h2 style="font-size:18px;margin:0 0 12px">${inviter} shared a document with you</h2>
    <p style="margin:0 0 16px;color:#4a4842;line-height:1.5">
      You now have <strong>${roleLabel}</strong> access to
      <strong>"${title}"</strong> on ${APP_NAME}.
    </p>
    <p style="margin:0 0 24px">
      <a href="${url}" style="display:inline-block;background:#b8562f;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">
        Open document
      </a>
    </p>
    <p style="margin:0;color:#8a877f;font-size:12px">
      If the button doesn't work, paste this link into your browser:<br>${url}
    </p>
  </div>`;

  return send({ to: params.to, subject, html, text });
}

/**
 * Invite someone who does NOT yet have an account: emails a signup link. When
 * they register with this address, the pending invite becomes real access.
 */
export async function sendInviteEmail(params: {
  to: string;
  inviterName: string;
  documentTitle: string;
  role: Role;
}): Promise<SendResult> {
  const url = `${appBaseUrl()}/register?email=${encodeURIComponent(params.to)}`;
  const title = escapeHtml(params.documentTitle);
  const inviter = escapeHtml(params.inviterName);
  const roleLabel = params.role === "viewer" ? "view" : "edit";

  const subject = `${inviter} invited you to collaborate on ${APP_NAME}`;
  const text =
    `${params.inviterName} invited you to ${roleLabel} "${params.documentTitle}" on ${APP_NAME}.\n\n` +
    `Create your account to get access: ${url}`;
  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:480px;margin:0 auto;color:#1a1a17">
    <h2 style="font-size:18px;margin:0 0 12px">You're invited to collaborate</h2>
    <p style="margin:0 0 16px;color:#4a4842;line-height:1.5">
      ${inviter} invited you to <strong>${roleLabel}</strong>
      <strong>"${title}"</strong> on ${APP_NAME}. Create a free account with this
      email address and you'll get access automatically.
    </p>
    <p style="margin:0 0 24px">
      <a href="${url}" style="display:inline-block;background:#b8562f;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">
        Accept invitation
      </a>
    </p>
    <p style="margin:0;color:#8a877f;font-size:12px">
      If the button doesn't work, paste this link into your browser:<br>${url}
    </p>
  </div>`;

  return send({ to: params.to, subject, html, text });
}
