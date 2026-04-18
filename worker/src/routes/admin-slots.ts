// Admin slot management — all routes require X-Admin-Secret header
//
// GET    /api/admin/slots              → list all slots (with booking status)
// POST   /api/admin/slots              → create one or many slots
// PUT    /api/admin/slots/:id          → update a slot (toggle active, price, label)
// DELETE /api/admin/slots/:id          → delete (only if no confirmed booking)

import { json } from '../index';
import type { Env } from '../index';
import { sendCancellationEmail } from '../email';

export async function handleAdminSlots(
  request: Request,
  env: Env,
  path: string
): Promise<Response> {
  const method = request.method;

  // Extract optional :id from path
  const idMatch = path.match(/^\/api\/admin\/slots\/(.+)$/);
  const slotId  = idMatch?.[1];

  // ── GET /api/admin/slots ──────────────────────────────
  if (method === 'GET' && !slotId) {
    const url  = new URL(request.url);
    const from = url.searchParams.get('from') ?? '2020-01-01';
    const to   = url.searchParams.get('to')   ?? '2099-12-31';

    const { results } = await env.DB.prepare(`
      SELECT
        s.*,
        b.id             AS booking_id,
        b.client_name    AS booked_by,
        b.client_email   AS booked_email,
        b.status         AS booking_status,
        b.amount_paid_pence AS amount_paid
      FROM slots s
      LEFT JOIN bookings b
        ON b.slot_id = s.id AND b.status IN ('pending', 'confirmed')
      WHERE s.date >= ? AND s.date <= ?
      ORDER BY s.date ASC, s.time ASC
    `).bind(from, to).all();

    return json({ slots: results });
  }

  // ── POST /api/admin/slots — create slot(s) ────────────
  if (method === 'POST' && !slotId) {
    let body: unknown;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

    // Accept a single slot or an array
    const items = Array.isArray(body) ? body : [body];
    const created = [];
    const errors  = [];

    for (const item of items) {
      const err = validateSlotInput(item);
      if (err) { errors.push({ item, error: err }); continue; }

      const id = `${item.date}T${item.time}`;

      try {
        await env.DB.prepare(`
          INSERT INTO slots (id, date, time, label, price_pence, currency, is_active)
          VALUES (?, ?, ?, ?, ?, ?, 1)
          ON CONFLICT(id) DO UPDATE SET
            label       = excluded.label,
            price_pence = excluded.price_pence,
            currency    = excluded.currency,
            is_active   = 1,
            updated_at  = datetime('now')
        `).bind(
          id,
          item.date,
          item.time,
          item.label ?? formatTimeLabel(item.time),
          item.price_pence,
          item.currency ?? 'gbp'
        ).run();

        created.push(id);
      } catch (e) {
        errors.push({ item, error: String(e) });
      }
    }

    // Bust availability cache
    await bustCache(env);

    return json({ created, errors }, errors.length > 0 && created.length === 0 ? 400 : 200);
  }

  // ── PUT /api/admin/slots/:id — update ─────────────────
  if (method === 'PUT' && slotId) {
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

    const fields: string[] = [];
    const values: unknown[] = [];

    if (body.is_active !== undefined) { fields.push('is_active = ?');   values.push(body.is_active ? 1 : 0); }
    if (body.price_pence !== undefined) { fields.push('price_pence = ?'); values.push(body.price_pence); }
    if (body.label !== undefined)       { fields.push('label = ?');       values.push(body.label); }

    if (fields.length === 0) return json({ error: 'Nothing to update' }, 400);

    fields.push("updated_at = datetime('now')");
    values.push(decodeURIComponent(slotId));

    await env.DB.prepare(
      `UPDATE slots SET ${fields.join(', ')} WHERE id = ?`
    ).bind(...values).run();

    await bustCache(env);
    return json({ ok: true });
  }

  // ── DELETE /api/admin/slots/:id ────────────────────────
  if (method === 'DELETE' && slotId) {
    const id = decodeURIComponent(slotId);

    // Safety: don't delete slots with confirmed bookings
    const booking = await env.DB.prepare(`
      SELECT id FROM bookings WHERE slot_id = ? AND status = 'confirmed'
    `).bind(id).first();

    if (booking) {
      return json({
        error: 'Cannot delete a slot with a confirmed booking. Cancel the booking first.'
      }, 409);
    }

    await env.DB.prepare(`DELETE FROM bookings WHERE slot_id = ? AND status = 'pending'`).bind(id).run();
    await env.DB.prepare(`DELETE FROM slots WHERE id = ?`).bind(id).run();

    await bustCache(env);
    return json({ ok: true });
  }
  
// ── POST /api/admin/slots/:id/cancel — cancel booking ──
  if (method === 'POST' && path.endsWith('/cancel') && slotId) {
    const id = decodeURIComponent(slotId.replace('/cancel', ''));

    const booking = await env.DB.prepare(`
      SELECT b.*, s.date, s.label FROM bookings b
      JOIN slots s ON s.id = b.slot_id
      WHERE b.slot_id = ? AND b.status = 'confirmed'
    `).bind(id).first();

    if (!booking) {
      return json({ error: 'No confirmed booking found for this slot.' }, 404);
    }

    await env.DB.prepare(`
      UPDATE bookings SET status = 'cancelled', updated_at = datetime('now')
      WHERE slot_id = ? AND status = 'confirmed'
    `).bind(id).run();

    await bustCache(env);

    // Send cancellation email
    try {
      await sendCancellationEmail(booking, env);
    } catch (err) {
      console.error('Cancellation email failed:', err);
    }

    return json({ ok: true });
  }
  return json({ error: 'Method not allowed' }, 405);
}

// ── Helpers ────────────────────────────────────────────────

function validateSlotInput(item: unknown): string | null {
  if (typeof item !== 'object' || item === null) return 'Invalid slot object';
  const s = item as Record<string, unknown>;
  if (!s.date || !/^\d{4}-\d{2}-\d{2}$/.test(s.date as string)) return 'Invalid or missing date (YYYY-MM-DD)';
  if (!s.time || !/^\d{2}:\d{2}$/.test(s.time as string)) return 'Invalid or missing time (HH:MM)';
  if (typeof s.price_pence !== 'number' || s.price_pence <= 0) return 'price_pence must be a positive number';
  return null;
}

function formatTimeLabel(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour   = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
}

async function bustCache(env: Env): Promise<void> {
  const keys = await env.KV.list({ prefix: 'availability:' });
  await Promise.all(keys.keys.map(k => env.KV.delete(k.name)));
}
