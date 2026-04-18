// GET /api/availability?from=2025-06-01&to=2025-06-30
// Returns slots that are active and not yet booked.
// Results are cached in KV for 60 seconds to reduce DB load.

import { json } from '../index';
import type { Env } from '../index';

const CACHE_TTL = 60; // seconds

export async function handleAvailability(request: Request, env: Env): Promise<Response> {
  const url   = new URL(request.url);
  const from  = url.searchParams.get('from') ?? today();
  const to    = url.searchParams.get('to')   ?? daysFromNow(60);

  // Validate date params
  if (!isValidDate(from) || !isValidDate(to)) {
    return json({ error: 'Invalid date format. Use YYYY-MM-DD.' }, 400);
  }

  const cacheKey = `availability:${from}:${to}`;

  // Try KV cache first
  const cached = await env.KV.get(cacheKey);
  if (cached) {
    return new Response(cached, {
      headers: {
        'Content-Type': 'application/json',
        'X-Cache': 'HIT',
      }
    });
  }

  // Query: active slots with no confirmed booking
  const { results } = await env.DB.prepare(`
    SELECT
      s.id,
      s.date,
      s.time,
      s.label,
      s.price_pence,
      s.currency
    FROM slots s
    WHERE s.is_active = 1
      AND s.date >= ?
      AND s.date <= ?
      AND NOT EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.slot_id = s.id
          AND b.status IN ('pending', 'confirmed')
      )
    ORDER BY s.date ASC, s.time ASC
  `).bind(from, to).all();

  // Group by date for easier rendering in the widget
  const grouped: Record<string, typeof results> = {};
  for (const slot of results) {
    const d = slot.date as string;
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(slot);
  }

  const payload = JSON.stringify({ dates: grouped });

  // Store in KV cache
  await env.KV.put(cacheKey, payload, { expirationTtl: CACHE_TTL });

  return new Response(payload, {
    headers: {
      'Content-Type': 'application/json',
      'X-Cache': 'MISS',
    }
  });
}

// ── Helpers ────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}
