// GET /api/admin/bookings?from=&to=&status=
// Lists all bookings with slot details. Admin only.

import { json } from '../index';
import type { Env } from '../index';

export async function handleAdminBookings(request: Request, env: Env): Promise<Response> {
  const url    = new URL(request.url);
  const from   = url.searchParams.get('from')   ?? '2020-01-01';
  const to     = url.searchParams.get('to')     ?? '2099-12-31';
  const status = url.searchParams.get('status') ?? null; // null = all

  let query = `
    SELECT
      b.id,
      b.client_name,
      b.client_email,
      b.status,
      b.amount_paid_pence,
      b.currency,
      b.stripe_session_id,
      b.stripe_payment_id,
      b.created_at,
      s.date,
      s.time,
      s.label
    FROM bookings b
    JOIN slots s ON s.id = b.slot_id
    WHERE s.date >= ? AND s.date <= ?
  `;
  const params: unknown[] = [from, to];

  if (status) {
    query += ' AND b.status = ?';
    params.push(status);
  }

  query += ' ORDER BY s.date ASC, s.time ASC';

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return json({ bookings: results });
}
