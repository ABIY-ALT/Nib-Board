import nodemailer from 'nodemailer';

// ------------------------------------------------------------- configuration

const EMAIL_HOST = process.env.EMAIL_HOST ?? '';
const EMAIL_PORT = Number(process.env.EMAIL_PORT ?? '587');
const EMAIL_USER = process.env.EMAIL_USER ?? '';
const EMAIL_PASS = process.env.EMAIL_PASS ?? '';
const EMAIL_FROM = process.env.EMAIL_FROM ?? `NIB BOARD <${EMAIL_USER}>`;
const EMAIL_ALLOW_SELF_SIGNED = process.env.EMAIL_ALLOW_SELF_SIGNED === 'true';

/**
 * Whether the SMTP transport can be created. Checked before every send so the
 * caller can surface a clear failure rather than a cryptic Nodemailer error.
 */
export function isEmailConfigured(): boolean {
  return Boolean(EMAIL_HOST && EMAIL_USER && EMAIL_PASS);
}

export function getEmailConfigSummary() {
  return {
    configured: isEmailConfigured(),
    host: EMAIL_HOST || 'Not configured',
    port: EMAIL_PORT,
    user: EMAIL_USER || 'Not configured',
    from: EMAIL_FROM || 'Not configured',
    encryption: 'STARTTLS (Port 587)',
    allowSelfSigned: EMAIL_ALLOW_SELF_SIGNED,
  };
}

/**
 * Creates a fresh Nodemailer transport.
 *
 * Port 587 with STARTTLS: the connection starts as plain text and upgrades to
 * TLS once the server advertises it, which is what Exchange / Outlook relays
 * expect. `secure: false` does not mean unencrypted — it means "upgrade to TLS
 * after EHLO" rather than "connect directly over TLS on port 465".
 */
function createTransport() {
  return nodemailer.createTransport({
    host: EMAIL_HOST,
    port: EMAIL_PORT,
    secure: false, // STARTTLS — upgrade after EHLO
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: !EMAIL_ALLOW_SELF_SIGNED,
    },
  });
}

// ---------------------------------------------------------------- templates

/**
 * Shared HTML email shell styled to match the NIB Board branding.
 *
 * The design mirrors the KYC Portal reset email: white card on a warm beige
 * background, NIB logo at top, a brown/gold call-to-action button, and a
 * security disclaimer at the footer.
 */
function emailShell(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f0eb;font-family:Segoe UI,Tahoma,Geneva,Verdana,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="540" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.06);overflow:hidden;max-width:540px;width:100%;">
        <!-- Logo -->
        <tr>
          <td align="center" style="padding:28px 24px 8px;">
            <img src="cid:nib-logo" alt="NIB Bank" width="44" height="44"
                 style="width:44px;height:44px;border-radius:8px;object-fit:contain;" />
            <div style="margin-top:6px;font-size:13px;font-weight:700;color:#3d2b1f;letter-spacing:0.02em;">
              NIB International Bank S.C.
            </div>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:12px 32px 32px;">
            ${body}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px 24px;border-top:1px solid #e8e0d8;">
            <p style="margin:0;font-size:12px;color:#8c7a6b;line-height:1.5;">
              If you did not expect this, you can safely ignore this email or contact IT Security.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function ctaButton(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%">
  <tr><td align="center" style="padding:24px 0 8px;">
    <a href="${url}" target="_blank"
       style="display:inline-block;padding:14px 40px;background:#8b7340;color:#ffffff;
              font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;
              letter-spacing:0.02em;">
      ${label} →
    </a>
  </td></tr>
</table>`;
}

// ---------------------------------------------------------- email functions

/**
 * Sends a welcome/invitation email for a newly provisioned officer account.
 *
 * @throws if the SMTP transport is not configured or the send fails — the
 * caller must catch and surface the error. Account creation is rolled back
 * when this fails.
 */
export async function sendSetupEmail(
  to: string,
  name: string,
  setupUrl: string
): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error(
      'Email is not configured. Set EMAIL_HOST, EMAIL_USER and EMAIL_PASS in .env.local.'
    );
  }

  const html = emailShell(`
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#3d2b1f;">
      Welcome to the Board Governance Portal
    </h1>
    <p style="margin:0 0 12px;font-size:15px;color:#4a3c30;line-height:1.6;">
      Hello ${escapeHtml(name)},
    </p>
    <p style="margin:0 0 12px;font-size:15px;color:#4a3c30;line-height:1.6;">
      An administrator has created your NIB Bank Board Governance Portal account.
      Please set your password by clicking the link below.
    </p>
    <p style="margin:0 0 4px;font-size:15px;color:#4a3c30;line-height:1.6;">
      This link is valid for <strong>24 hours</strong>.
    </p>
    ${ctaButton('Set Your Password', setupUrl)}
  `);

  const transport = createTransport();
  try {
    await transport.sendMail({
      from: EMAIL_FROM,
      to,
      subject: 'Set Your Password — NIB Board Governance Portal',
      html,
    });
  } finally {
    transport.close();
  }
}

/**
 * Sends a password-reset email when an administrator resets an officer's
 * password through the admin panel.
 */
export async function sendPasswordResetEmail(
  to: string,
  name: string,
  setupUrl: string
): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error(
      'Email is not configured. Set EMAIL_HOST, EMAIL_USER and EMAIL_PASS in .env.local.'
    );
  }

  const html = emailShell(`
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#3d2b1f;">
      Your Password Reset Request
    </h1>
    <p style="margin:0 0 12px;font-size:15px;color:#4a3c30;line-height:1.6;">
      Hello ${escapeHtml(name)},
    </p>
    <p style="margin:0 0 12px;font-size:15px;color:#4a3c30;line-height:1.6;">
      An administrator has initiated a password reset for your NIB Bank
      Board Governance Portal account.
    </p>
    <p style="margin:0 0 4px;font-size:15px;color:#4a3c30;line-height:1.6;">
      You can reset your password by clicking the link below.
    </p>
    <p style="margin:0 0 4px;font-size:15px;color:#4a3c30;line-height:1.6;">
      This link is valid for <strong>24 hours</strong>.
    </p>
    ${ctaButton('Reset Your Password', setupUrl)}
  `);

  const transport = createTransport();
  try {
    await transport.sendMail({
      from: EMAIL_FROM,
      to,
      subject: 'Password Reset — NIB Board Governance Portal',
      html,
    });
  } finally {
    transport.close();
  }
}

/**
 * Sends a diagnostic test email to verify SMTP configuration and network connectivity.
 */
export async function sendTestEmail(
  to: string,
  actorName: string
): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error(
      'Email is not configured. Please set EMAIL_HOST, EMAIL_USER and EMAIL_PASS in your environment configuration.'
    );
  }

  const html = emailShell(`
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#3d2b1f;">
      SMTP Diagnostic Test
    </h1>
    <p style="margin:0 0 12px;font-size:15px;color:#4a3c30;line-height:1.6;">
      Hello ${escapeHtml(actorName)},
    </p>
    <p style="margin:0 0 12px;font-size:15px;color:#4a3c30;line-height:1.6;">
      This is a test message from the <strong>NIB Bank Board Governance Portal</strong> to confirm that encrypted SMTP dispatch is functioning properly.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;background:#f9f6f0;border-radius:8px;padding:12px 16px;width:100%;">
      <tr><td style="font-size:13px;color:#5a4a3c;padding:4px 0;"><strong>Host:</strong> ${escapeHtml(EMAIL_HOST)}:${EMAIL_PORT}</td></tr>
      <tr><td style="font-size:13px;color:#5a4a3c;padding:4px 0;"><strong>Sender:</strong> ${escapeHtml(EMAIL_FROM)}</td></tr>
      <tr><td style="font-size:13px;color:#5a4a3c;padding:4px 0;"><strong>Security:</strong> Encrypted STARTTLS (Port 587)</td></tr>
      <tr><td style="font-size:13px;color:#5a4a3c;padding:4px 0;"><strong>Timestamp:</strong> ${new Date().toISOString()}</td></tr>
    </table>
    <p style="margin:0;font-size:13px;color:#2e6930;font-weight:600;">
      ✓ Connection established and verified successfully.
    </p>
  `);

  const transport = createTransport();
  try {
    // Verify connection first
    await transport.verify();
    // Send test email
    await transport.sendMail({
      from: EMAIL_FROM,
      to,
      subject: 'NIB Board Governance — SMTP Connectivity Test',
      html,
    });
  } finally {
    transport.close();
  }
}

// ------------------------------------------------------------------ helpers

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
