# Booking System

A full-stack booking system built for Hostinger iframe embed.
Powered by Cloudflare Workers + D1 + KV, React, Stripe, and Resend.

## Structure

```
booking-system/
├── schema/
│   └── 001_init.sql        # D1 database schema
├── worker/                 # Cloudflare Worker (API)
│   ├── src/
│   │   ├── index.ts        # Router + CORS
│   │   ├── email.ts        # Resend email templates
│   │   └── routes/
│   │       ├── availability.ts   # GET /api/availability
│   │       ├── checkout.ts       # POST /api/checkout
│   │       ├── webhook.ts        # POST /api/stripe-webhook
│   │       ├── admin-slots.ts    # CRUD /api/admin/slots
│   │       └── admin-bookings.ts # GET /api/admin/bookings
│   ├── wrangler.toml
│   ├── package.json
│   └── tsconfig.json
├── widget/                 # React SPA (Cloudflare Pages)
│   ├── src/
│   │   ├── main.tsx        # Entry point (widget vs admin routing)
│   │   ├── App.tsx         # Booking widget shell + hash router
│   │   ├── SlotPicker.tsx  # Date/time slot browser
│   │   ├── CheckoutForm.tsx # Name + email form → Stripe
│   │   ├── SuccessPage.tsx # Post-payment confirmation
│   │   └── AdminApp.tsx    # Admin panel (slots + bookings)
│   ├── public/
│   │   ├── _redirects      # SPA routing for Cloudflare Pages
│   │   └── _routes.json
│   ├── index.html
│   ├── vite.config.ts
│   ├── package.json
│   └── tsconfig.json
├── .github/
│   └── workflows/
│       └── deploy.yml      # Auto-deploy on push to main
├── .gitignore
├── DEPLOY.md               # Step-by-step setup guide
└── README.md
```

## Quick start

See [DEPLOY.md](./DEPLOY.md) for the full setup guide.

## API reference

### Public endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/availability?from=&to=` | List available slots grouped by date |
| POST | `/api/checkout` | Create Stripe Checkout session |
| POST | `/api/stripe-webhook` | Stripe webhook (signature-verified) |

### Admin endpoints (require `X-Admin-Secret` header)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/slots` | List all slots with booking status |
| POST | `/api/admin/slots` | Create slot(s) — accepts array |
| PUT | `/api/admin/slots/:id` | Update slot (toggle active, price) |
| DELETE | `/api/admin/slots/:id` | Delete slot (blocked if confirmed booking) |
| GET | `/api/admin/bookings?status=` | List bookings |

## Security

- Card data: never touches your server — Stripe Hosted Checkout only
- Stripe webhook: verified via HMAC-SHA256 signature
- Admin routes: protected by `X-Admin-Secret` header (long random token)
- Bookings: only created via verified Stripe webhook — not directly by clients
- Slot holds: auto-expire after 30 minutes if payment doesn't complete
