import nodemailer from 'nodemailer';
import { config } from '../config';
import { query } from '../db/pool';
import type { EmailType } from '../types';

const transporter = nodemailer.createTransport({
  host:   config.email.host,
  port:   config.email.port,
  secure: config.email.port === 465,
  auth: {
    user: config.email.user,
    pass: config.email.password,
  },
});

// ── Internal send helper ──────────────────────────────────────────────────────

interface SendOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
  graduateId?: string;
  passId?: string;
  emailType: EmailType;
}

async function send(opts: SendOptions): Promise<void> {
  if (!config.email.enabled) {
    console.log(`[EMAIL DISABLED] Would send "${opts.subject}" to ${opts.to}`);
    return;
  }
  // Create an email log entry first (PENDING)
  const logRes = await query<{ id: string }>(
    `INSERT INTO email_logs (graduate_id, pass_id, email_type, recipient_email, status)
     VALUES ($1, $2, $3, $4, 'PENDING')
     RETURNING id`,
    [opts.graduateId ?? null, opts.passId ?? null, opts.emailType, opts.to]
  );
  const logId = logRes.rows[0]?.id;

  try {
    const info = await transporter.sendMail({
      from: config.email.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      attachments: opts.attachments,
    });

    await query(
      `UPDATE email_logs SET status = 'SENT', provider_message_id = $1, sent_at = NOW()
       WHERE id = $2`,
      [info.messageId, logId]
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await query(
      `UPDATE email_logs SET status = 'FAILED', error_message = $1
       WHERE id = $2`,
      [message, logId]
    );
    // Don't rethrow — email failures are non-fatal; graduate can use the portal
    console.error(`[Email] Failed to send ${opts.emailType} to ${opts.to}:`, message);
  }
}

// ── Public email functions ────────────────────────────────────────────────────

export async function sendCredentials(opts: {
  graduateId: string;
  to: string;
  graduateName: string;
  studentId: string;
  accessPin: string;           // 17-char access PIN issued at payment — shown once in this email
  eventName: string;
  eventDate: string;
  portalUrl: string;
  assignedGateCode: string;
}): Promise<void> {
  await send({
    to: opts.to,
    subject: `Your Congregation Guest Pass Portal Access — ${opts.eventName}`,
    emailType: 'CREDENTIALS',
    graduateId: opts.graduateId,
    html: `
      <h2>Congratulations, ${opts.graduateName}!</h2>
      <p>Your guest pass portal for the <strong>${opts.eventName}</strong> is now active.</p>

      <h3>Your Login Credentials</h3>
      <table style="border-collapse:collapse;font-size:1rem;">
        <tr><td style="padding:6px 16px 6px 0"><strong>Student ID</strong></td><td>${opts.studentId}</td></tr>
        <tr><td style="padding:6px 16px 6px 0"><strong>Access PIN</strong></td>
            <td style="font-family:monospace;font-size:1.2rem;letter-spacing:0.1em">${opts.accessPin}</td></tr>
      </table>

      <p><strong>Portal Link:</strong> <a href="${opts.portalUrl}">${opts.portalUrl}</a></p>

      <h3>Event Details</h3>
      <ul>
        <li><strong>Date:</strong> ${opts.eventDate}</li>
        <li><strong>Your Guest Gate:</strong> Gate ${opts.assignedGateCode}</li>
      </ul>

      <p>Log in to the portal to generate guest passes for your invited guests and
         optionally request a vehicle pass.</p>
      <p><strong>Keep your Access PIN safe — do not share it with others.</strong>
         If you lose it, use the "Forgot PIN" option on the portal login page.</p>
    `,
  });
}

export async function sendGuestPass(opts: {
  graduateId: string;
  passId: string;
  to: string;
  guestName: string;
  graduateName: string;
  eventName: string;
  eventDate: string;
  gateCode: string;
  qrBuffer: Buffer;
}): Promise<void> {
  await send({
    to: opts.to,
    subject: `Your Guest Pass — ${opts.eventName}`,
    emailType: 'GUEST_PASS',
    graduateId: opts.graduateId,
    passId: opts.passId,
    attachments: [
      {
        filename: `guest-pass-${opts.gateCode}.png`,
        content: opts.qrBuffer,
        contentType: 'image/png',
      },
    ],
    html: `
      <h2>Hello${opts.guestName ? `, ${opts.guestName}` : ''}!</h2>
      <p>You have been invited to the <strong>${opts.eventName}</strong>
         by <strong>${opts.graduateName}</strong>.</p>

      <h3>Event Details</h3>
      <ul>
        <li><strong>Date:</strong> ${opts.eventDate}</li>
        <li><strong>Your Gate:</strong> Gate ${opts.gateCode}</li>
      </ul>

      <p>Please present the attached QR code at <strong>Gate ${opts.gateCode}</strong>
         on arrival. Each code is single-use and non-transferable.</p>
      <p>You can also download your pass from the graduate portal if this image is unclear.</p>
    `,
  });
}

export async function sendVehicleApproved(opts: {
  graduateId: string;
  passId: string;
  to: string;
  graduateName: string;
  eventName: string;
  eventDate: string;
  qrBuffer: Buffer;
}): Promise<void> {
  await send({
    to: opts.to,
    subject: `Vehicle Pass Approved — ${opts.eventName}`,
    emailType: 'VEHICLE_APPROVED',
    graduateId: opts.graduateId,
    passId: opts.passId,
    attachments: [
      {
        filename: 'vehicle-pass.png',
        content: opts.qrBuffer,
        contentType: 'image/png',
      },
    ],
    html: `
      <h2>Your vehicle pass has been approved, ${opts.graduateName}!</h2>
      <p>Please present the attached QR code at the vehicle gate on arrival.</p>
      <p><strong>Event:</strong> ${opts.eventName} — ${opts.eventDate}</p>
    `,
  });
}

export async function sendReceiptReset(opts: {
  graduateId: string;
  to: string;
  graduateName: string;
  studentId: string;
  newReceiptNumber: string;
  eventName: string;
  portalUrl: string;
}): Promise<void> {
  await send({
    to: opts.to,
    subject: `Your Receipt Number Has Been Reset — ${opts.eventName}`,
    emailType: 'RECEIPT_RESET',
    graduateId: opts.graduateId,
    html: `
      <h2>Receipt Number Reset — ${opts.graduateName}</h2>
      <p>Your portal receipt number for <strong>${opts.eventName}</strong> has been reset as requested.</p>

      <h3>Your Updated Credentials</h3>
      <ul>
        <li><strong>Student ID:</strong> ${opts.studentId}</li>
        <li><strong>New Receipt Number:</strong> <code style="font-size:1.1em;font-weight:bold;">${opts.newReceiptNumber}</code></li>
      </ul>

      <p><strong>Portal Link:</strong> <a href="${opts.portalUrl}">${opts.portalUrl}</a></p>

      <p style="color:#888;font-size:0.9em;">
        If you did not request this reset, please contact the congregation office immediately.
      </p>
    `,
  });
}

export async function sendVehicleRejected(opts: {
  graduateId: string;
  passId: string;
  to: string;
  graduateName: string;
  eventName: string;
  reason?: string;
}): Promise<void> {
  await send({
    to: opts.to,
    subject: `Vehicle Pass Request Outcome — ${opts.eventName}`,
    emailType: 'VEHICLE_REJECTED',
    graduateId: opts.graduateId,
    passId: opts.passId,
    html: `
      <h2>Dear ${opts.graduateName},</h2>
      <p>Unfortunately, your vehicle pass request for <strong>${opts.eventName}</strong>
         could not be approved${opts.reason ? ` — ${opts.reason}` : ''}.</p>
      <p>Please make alternative transport arrangements. We apologise for any inconvenience.</p>
    `,
  });
}
