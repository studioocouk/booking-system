// ============================================================
// Booking System — Cloudflare Worker
// ============================================================
// Routes:
//   GET  /api/availability          → public: list bookable slots
//   POST /api/checkout              → public: create Stripe session
//   POST /api/stripe-webhook        → Stripe only: confirm booking
//   GET  /api/admin/slots           → admin: list all slots
//   POST /api/admin/slots           → admin: create slot(s)
//   PUT  /api/admin/slots/:id       → admin: update slot
//   DELETE /api/admin/slots/:id     → admin: delete slot
//   GET  /api/admin/bookings        → admin: list bookings
// ============================================================

import { handleAvailability }    from './routes/availability';
import { handleCheckout }        from './routes/checkout';
import { handleStripeWebhook }   from './routes/webhook';
import { handleAdminSlots }      from './routes/admin-slots';
import { handleAdminBookings }   from './routes/admin-bookings';

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  ADMIN_SECRET: string;
  RESEND_API_KEY: string;
  YOUR_EMAIL: string;
  YOUR_NAME: string;
  WIDGET_URL: string;  // e.g. https://booking.yourdomain.pages.dev
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret',
};

export default {
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    await env.DB.prepare(`
      DELETE FROM bookings
      WHERE status = 'pending'
        AND created_at < datetime('now', '-30 minutes')
    `).run();
    console.log('Nightly cleanup: stale pending bookings removed.');
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      let response: Response;

      // ── Public routes ──────────────────────────────────────
      if (path === '/api/availability' && request.method === 'GET') {
        response = await handleAvailability(request, env);

      } else if (path === '/api/checkout' && request.method === 'POST') {
        response = await handleCheckout(request, env);

      } else if (path === '/api/stripe-webhook' && request.method === 'POST') {
        // No CORS needed — Stripe calls this directly
        return handleStripeWebhook(request, env);

      // ── Admin routes ───────────────────────────────────────
      } else if (path.startsWith('/api/admin/')) {
        if (!isAdmin(request, env)) {
          return json({ error: 'Unauthorised' }, 401);
        }
        if (path.startsWith('/api/admin/slots')) {
          response = await handleAdminSlots(request, env, path);
        } else if (path === '/api/admin/bookings') {
          response = await handleAdminBookings(request, env);
        } else {
          response = json({ error: 'Not found' }, 404);
        }

      } else {
        response = json({ error: 'Not found' }, 404);
      }

      // Attach CORS headers to all responses
      const headers = new Headers(response.headers);
      Object.entries(CORS_HEADERS).forEach(([k, v]) => headers.set(k, v));
      return new Response(response.body, { status: response.status, headers });

    } catch (err) {
      console.error(err);
      return json({ error: 'Internal server error' }, 500, CORS_HEADERS);
    }
  }
};
export const scheduled: ExportedHandlerScheduledHandler<Env> = async (event, env) => {
  await env.DB.prepare(`
    DELETE FROM bookings
    WHERE status = 'pending'
      AND created_at < datetime('now', '-30 minutes')
  `).run();

  console.log('Nightly cleanup: stale pending bookings removed.');
};

// ── Helpers ────────────────────────────────────────────────

export function isAdmin(request: Request, env: Env): boolean {
  const secret = request.headers.get('X-Admin-Secret');
  return secret === env.ADMIN_SECRET;
}

export function json(data: unknown, status = 200, extraHeaders: Record<string,string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders }
  });
}
