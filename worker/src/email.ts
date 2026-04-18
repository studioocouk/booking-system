// Sends confirmation emails to the client and to you.
// Uses Resend (https://resend.com) — free tier: 100 emails/day.
// No SDK needed — just a simple fetch to their REST API.

import type { Env } from './index';

interface BookingRow {
  id: string;
  client_name: string;
  client_email: string;
  date: string;
  label: string;
  amount_paid_pence: number;
  currency: string;
  stripe_payment_id: string;
}

export async function sendConfirmationEmails(booking: BookingRow, env: Env): Promise<void> {
  const amount = formatAmount(booking.amount_paid_pence, booking.currency);
  const dateStr = formatDate(booking.date);

  // ── Email to client ────────────────────────────────────
  await sendEmail({
    from:    `${env.YOUR_NAME} <bookings@studioo.co.uk>`,  // update domain
    to:      booking.client_email,
    subject: `Booking confirmed — ${dateStr} at ${booking.label}`,
    html:    clientEmailHtml({
      name:   booking.client_name,
      date:   dateStr,
      time:   booking.label,
      amount,
      id:     booking.id,
    }),
  }, env);

  // ── Email to you ───────────────────────────────────────
  await sendEmail({
    from:    `Booking System <bookings@studioo.co.uk>`,
    to:      env.YOUR_EMAIL,
    subject: `New booking: ${booking.client_name} — ${dateStr} ${booking.label}`,
    html:    adminEmailHtml({
      name:   booking.client_name,
      email:  booking.client_email,
      date:   dateStr,
      time:   booking.label,
      amount,
      stripe: booking.stripe_payment_id,
      id:     booking.id,
    }),
  }, env);
}

async function sendEmail(
  params: { from: string; to: string; subject: string; html: string },
  env: Env
): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error: ${err}`);
  }
}

// ── Email templates ────────────────────────────────────────
// Plain but clean HTML. Works in all email clients.

function clientEmailHtml(p: {
  name: string; date: string; time: string; amount: string; id: string;
}): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#333">
  <h2 style="color:#1a1a1a;margin-bottom:4px">Your booking is confirmed</h2>
  <p style="color:#666;margin-top:0">Booking reference: <code>${p.id.slice(0, 8).toUpperCase()}</code></p>

  <table style="width:100%;border-collapse:collapse;margin:24px 0">
    <tr style="background:#f5f5f5">
      <td style="padding:12px 16px;font-weight:bold">Date</td>
      <td style="padding:12px 16px">${p.date}</td>
    </tr>
    <tr>
      <td style="padding:12px 16px;font-weight:bold">Time</td>
      <td style="padding:12px 16px">${p.time}</td>
    </tr>
    <tr style="background:#f5f5f5">
      <td style="padding:12px 16px;font-weight:bold">Amount paid</td>
      <td style="padding:12px 16px">${p.amount}</td>
    </tr>
  </table>

  <p>Hi ${p.name},</p>
  <p>Your booking has been confirmed and payment received. We look forward to seeing you.</p>
  <p>If you need to cancel, please reply to this email and we will get back to you.</p>

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0">
  <p style="font-size:12px;color:#999">This is an automated confirmation. Please keep it for your records.</p>
</body>
</html>`;
}

function adminEmailHtml(p: {
  name: string; email: string; date: string; time: string;
  amount: string; stripe: string; id: string;
}): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#333">
  <h2 style="color:#1a1a1a">New booking received</h2>

  <table style="width:100%;border-collapse:collapse;margin:24px 0">
    <tr style="background:#f5f5f5">
      <td style="padding:10px 16px;font-weight:bold">Client</td>
      <td style="padding:10px 16px">${p.name}</td>
    </tr>
    <tr>
      <td style="padding:10px 16px;font-weight:bold">Email</td>
      <td style="padding:10px 16px"><a href="mailto:${p.email}">${p.email}</a></td>
    </tr>
    <tr style="background:#f5f5f5">
      <td style="padding:10px 16px;font-weight:bold">Date</td>
      <td style="padding:10px 16px">${p.date}</td>
    </tr>
    <tr>
      <td style="padding:10px 16px;font-weight:bold">Time</td>
      <td style="padding:10px 16px">${p.time}</td>
    </tr>
    <tr style="background:#f5f5f5">
      <td style="padding:10px 16px;font-weight:bold">Amount</td>
      <td style="padding:10px 16px">${p.amount}</td>
    </tr>
    <tr>
      <td style="padding:10px 16px;font-weight:bold">Booking ID</td>
      <td style="padding:10px 16px"><code>${p.id}</code></td>
    </tr>
    <tr style="background:#f5f5f5">
      <td style="padding:10px 16px;font-weight:bold">Stripe payment</td>
      <td style="padding:10px 16px"><code>${p.stripe}</code></td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Helpers ────────────────────────────────────────────────

function formatAmount(pence: number, currency: string): string {
  const amount = pence / 100;
  const symbols: Record<string, string> = { gbp: '£', usd: '$', eur: '€' };
  const symbol = symbols[currency.toLowerCase()] ?? currency.toUpperCase() + ' ';
  return `${symbol}${amount.toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}
export async function sendCancellationEmail(booking: Record<string, unknown>, env: Env): Promise<void> {
  const dateStr = formatDate(booking.date as string);

  await sendEmail({
    from:    `Your Name <bookings@yourdomain.com>`,
    to:      booking.client_email as string,
    subject: `Booking cancelled — ${dateStr} at ${booking.label}`,
    html: `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#333">
  <h2 style="color:#1a1a1a">Your booking has been cancelled</h2>
  <p>Hi ${booking.client_name},</p>
  <p>Your booking for <strong>${dateStr}</strong> at <strong>${booking.label as string}</strong> has been cancelled.</p>
  <p>If you have any questions or would like to rebook, please get in touch by replying to this email.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:32px 0">
  <p style="font-size:12px;color:#999">Booking reference: ${(booking.id as string).slice(0, 8).toUpperCase()}</p>
</body>
</html>`
  }, env);
}
