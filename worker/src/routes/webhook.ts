// POST /api/stripe-webhook
// Called by Stripe after payment. This is the ONLY way a booking
// becomes 'confirmed'. Stripe signature is verified before anything else.

import type { Env } from '../index';
import { sendConfirmationEmails } from '../email';

export async function handleStripeWebhook(request: Request, env: Env): Promise<Response> {
  const signature = request.headers.get('Stripe-Signature');
  if (!signature) {
    return new Response('Missing signature', { status: 400 });
  }

  const rawBody = await request.text();

  // ── Verify Stripe signature ────────────────────────────
  // Cloudflare Workers supports SubtleCrypto — no Stripe SDK needed
  const isValid = await verifyStripeSignature(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  if (!isValid) {
    console.error('Stripe webhook signature invalid');
    return new Response('Invalid signature', { status: 400 });
  }

  const event = JSON.parse(rawBody);

  // We only care about successful payments
  if (event.type !== 'checkout.session.completed') {
    return new Response('OK', { status: 200 });
  }

  const session = event.data.object;

  // Payment must be paid (not just session completed with unpaid status)
  if (session.payment_status !== 'paid') {
    return new Response('OK', { status: 200 });
  }

  const { slot_id, client_name, client_email } = session.metadata ?? {};

  if (!slot_id || !client_name || !client_email) {
    console.error('Webhook missing metadata:', session.id);
    return new Response('Missing metadata', { status: 400 });
  }

  // ── Confirm the booking ────────────────────────────────
  const result = await env.DB.prepare(`
    UPDATE bookings
    SET
      status            = 'confirmed',
      stripe_payment_id = ?,
      updated_at        = datetime('now')
    WHERE stripe_session_id = ?
      AND status = 'pending'
  `).bind(
    session.payment_intent ?? session.id,
    session.id
  ).run();

  if (result.meta.changes === 0) {
    // Already processed (Stripe can send duplicates) — idempotent OK
    console.log('Webhook already processed for session:', session.id);
    return new Response('OK', { status: 200 });
  }

  // Fetch the full booking for email
  const booking = await env.DB.prepare(`
    SELECT b.*, s.date, s.label, s.time, s.currency
    FROM bookings b
    JOIN slots s ON s.id = b.slot_id
    WHERE b.stripe_session_id = ?
  `).bind(session.id).first();

  if (booking) {
    // Invalidate availability cache
    const keys = await env.KV.list({ prefix: 'availability:' });
    await Promise.all(keys.keys.map(k => env.KV.delete(k.name)));

    // Send confirmation emails (non-blocking — don't fail webhook on email error)
    try {
      await sendConfirmationEmails(booking, env);
    } catch (err) {
      console.error('Email send failed:', err);
    }
  }

  return new Response('OK', { status: 200 });
}

// ── Stripe signature verification ─────────────────────────
// Implements https://stripe.com/docs/webhooks/signatures
// using Web Crypto (available in Cloudflare Workers)

async function verifyStripeSignature(
  payload: string,
  header: string,
  secret: string
): Promise<boolean> {
  try {
    const parts = Object.fromEntries(
      header.split(',').map(p => {
        const [k, ...v] = p.split('=');
        return [k.trim(), v.join('=')];
      })
    );

    const timestamp = parts['t'];
    const signature = parts['v1'];

    if (!timestamp || !signature) return false;

    // Reject if timestamp is older than 5 minutes
    const ts = parseInt(timestamp, 10);
    if (Math.abs(Date.now() / 1000 - ts) > 300) {
      console.error('Stripe webhook timestamp too old');
      return false;
    }

    const signedPayload = `${timestamp}.${payload}`;

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(signedPayload));
    const expected = Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return expected === signature;
  } catch {
    return false;
  }
}
