// POST /api/checkout
// Body: { slot_id, client_name, client_email }
// Returns: { checkout_url }
//
// Security:
// - Slot is re-validated server-side (not trusted from client)
// - Booking row is created with status='pending' to hold the slot
//   while the user is in Stripe. It expires after 30 minutes if
//   the webhook never fires (handled by the cleanup query in webhook.ts)

import { json } from '../index';
import type { Env } from '../index';

export async function handleCheckout(request: Request, env: Env): Promise<Response> {
  let body: { slot_id?: string; client_name?: string; client_email?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { slot_id, client_name, client_email } = body;

  // ── Validate input ─────────────────────────────────────
  if (!slot_id || !client_name || !client_email) {
    return json({ error: 'slot_id, client_name, and client_email are required.' }, 400);
  }
  if (!isValidEmail(client_email)) {
    return json({ error: 'Invalid email address.' }, 400);
  }
  if (client_name.trim().length < 2) {
    return json({ error: 'Please enter your full name.' }, 400);
  }

  // ── Fetch slot from DB (source of truth) ───────────────
  const slot = await env.DB.prepare(`
    SELECT * FROM slots WHERE id = ? AND is_active = 1
  `).bind(slot_id).first();

  if (!slot) {
    return json({ error: 'This slot is not available.' }, 409);
  }

  // ── Check it's not already taken ───────────────────────
  // Also clear stale pending bookings older than 30 min first
  await env.DB.prepare(`
    DELETE FROM bookings
    WHERE slot_id = ?
      AND status = 'pending'
      AND created_at < datetime('now', '-30 minutes')
  `).bind(slot_id).run();

  const existing = await env.DB.prepare(`
    SELECT id FROM bookings
    WHERE slot_id = ? AND status IN ('pending', 'confirmed')
  `).bind(slot_id).first();

  if (existing) {
    return json({ error: 'Sorry, this slot was just taken. Please choose another.' }, 409);
  }

  // ── Create Stripe Checkout session ─────────────────────
  const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      'payment_method_types[]':         'card',
      'mode':                           'payment',
      'customer_email':                 client_email,
      'line_items[0][price_data][currency]':                    slot.currency as string,
      'line_items[0][price_data][unit_amount]':                 String(slot.price_pence),
      'line_items[0][price_data][product_data][name]':          `Booking: ${slot.label} on ${slot.date}`,
      'line_items[0][price_data][product_data][description]':   `Slot on ${slot.date} at ${slot.label}`,
      'line_items[0][quantity]':        '1',
      'success_url':                    `${env.WIDGET_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      'cancel_url':                     `${env.WIDGET_URL}/`,
      'expires_at':                     String(Math.floor(Date.now() / 1000) + 30 * 60), // 30 min
      'metadata[slot_id]':              slot_id,
      'metadata[client_name]':          client_name.trim(),
      'metadata[client_email]':         client_email.toLowerCase(),
    })
  });

  if (!stripeRes.ok) {
    const err = await stripeRes.json() as { error?: { message?: string } };
    console.error('Stripe error:', err);
    return json({ error: 'Payment setup failed. Please try again.' }, 502);
  }

  const session = await stripeRes.json() as { id: string; url: string };

  // ── Hold slot with pending booking ─────────────────────
  const bookingId = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO bookings
      (id, slot_id, client_name, client_email, stripe_session_id, amount_paid_pence, currency, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
  `).bind(
    bookingId,
    slot_id,
    client_name.trim(),
    client_email.toLowerCase(),
    session.id,
    slot.price_pence,
    slot.currency
  ).run();

  // Invalidate availability cache for this date
  await invalidateCache(env, slot.date as string);

  return json({ checkout_url: session.url });
}

// ── Helpers ────────────────────────────────────────────────

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function invalidateCache(env: Env, date: string): Promise<void> {
  // Broad invalidation — simpler than tracking exact keys
  const keys = await env.KV.list({ prefix: 'availability:' });
  for (const key of keys.keys) {
    // Only delete keys where date range could include this date
    await env.KV.delete(key.name);
  }
}
