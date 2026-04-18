# Booking System — Deployment Guide

Everything runs on Cloudflare's free/cheap tier. No servers to manage.

---

## What you need before starting

- [x] Cloudflare account (free)
- [x] GitHub account
- [x] Stripe account (test mode to start)
- [x] Resend account — sign up free at https://resend.com
- Node.js 20+ installed on your laptop

---

## Step 1 — Push to GitHub

```bash
cd booking-system
git init
git add .
git commit -m "Initial booking system"
git remote add origin https://github.com/YOUR_USERNAME/booking-system.git
git push -u origin main
```

---

## Step 2 — Set up Cloudflare resources

Install Wrangler (Cloudflare's CLI) and log in:

```bash
npm install -g wrangler
wrangler login
```

### Create the D1 database

```bash
cd worker
wrangler d1 create booking-db
```

Copy the `database_id` it prints and paste it into `worker/wrangler.toml`:
```toml
database_id = "paste-your-id-here"
```

Run the schema migration:
```bash
npm run db:init
```

### Create the KV namespace (availability cache)

```bash
wrangler kv:namespace create booking-cache
```

Copy the `id` it prints and paste it into `worker/wrangler.toml`:
```toml
id = "paste-your-id-here"
```

---

## Step 3 — Set secret environment variables

These are stored encrypted in Cloudflare — never in your code or git.

```bash
cd worker

# Your Stripe secret key (from https://dashboard.stripe.com/apikeys)
wrangler secret put STRIPE_SECRET_KEY
# Paste: sk_live_... (use sk_test_... while testing)

# Stripe webhook signing secret (you get this in Step 5)
wrangler secret put STRIPE_WEBHOOK_SECRET
# Paste: whsec_...

# Your admin password — generate a strong random string
# Mac/Linux: openssl rand -hex 32
# Windows:   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
wrangler secret put ADMIN_SECRET
# Paste your generated secret — SAVE THIS SOMEWHERE SAFE

# Resend API key (from https://resend.com/api-keys)
wrangler secret put RESEND_API_KEY
# Paste: re_...
```

### Update the non-secret vars in wrangler.toml

```toml
[vars]
YOUR_NAME   = "Your Name"          # appears in email From: field
YOUR_EMAIL  = "you@yourdomain.com" # where YOU receive booking notifications
WIDGET_URL  = "https://booking-widget.pages.dev"  # update after Step 4
```

---

## Step 4 — Deploy the Worker

```bash
cd worker
npx wrangler deploy
```

Note the Worker URL it prints — looks like:
`https://booking-worker.YOUR_SUBDOMAIN.workers.dev`

---

## Step 5 — Set up Stripe webhook

1. Go to https://dashboard.stripe.com/webhooks
2. Click **Add endpoint**
3. Endpoint URL: `https://booking-worker.YOUR_SUBDOMAIN.workers.dev/api/stripe-webhook`
4. Events to listen for: **checkout.session.completed**
5. Click **Add endpoint**
6. Click **Reveal** next to Signing secret → copy `whsec_...`
7. Run: `wrangler secret put STRIPE_WEBHOOK_SECRET` and paste it

---

## Step 6 — Deploy the Widget to Cloudflare Pages

### Option A: Via GitHub (recommended — auto-deploys on every push)

1. Go to https://dash.cloudflare.com → **Pages** → **Create a project**
2. Connect your GitHub repo
3. Settings:
   - **Framework preset**: Vite
   - **Root directory**: `widget`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. Under **Environment variables**, add:
   - `VITE_API_URL` = `https://booking-worker.YOUR_SUBDOMAIN.workers.dev`
5. Click **Save and Deploy**

Note the Pages URL (e.g. `https://booking-widget.pages.dev`) and update:
- `WIDGET_URL` in `worker/wrangler.toml`
- Re-deploy the worker: `wrangler deploy`

### Option B: Manual deploy from laptop

```bash
cd widget
npm install
VITE_API_URL=https://booking-worker.YOUR_SUBDOMAIN.workers.dev npm run build
npx wrangler pages deploy dist --project-name=booking-widget
```

---

## Step 7 — Set up GitHub Actions secrets (for auto-deploy)

In your GitHub repo → **Settings** → **Secrets and variables** → **Actions**:

| Secret name            | Value                                        |
|------------------------|----------------------------------------------|
| `CLOUDFLARE_API_TOKEN` | Create at dash.cloudflare.com/profile/api-tokens (use "Edit Cloudflare Workers" template) |
| `CLOUDFLARE_ACCOUNT_ID`| Found in Cloudflare dashboard right sidebar  |
| `VITE_API_URL`         | Your Worker URL                              |

Now every `git push` to `main` deploys both the worker and widget automatically.

---

## Step 8 — Set up Resend email domain

1. Sign up at https://resend.com
2. Go to **Domains** → Add your domain
3. Add the DNS records it shows to Cloudflare (DNS tab for your domain)
4. Update the `from` address in `worker/src/email.ts`:
   ```typescript
   from: `Your Name <bookings@yourdomain.com>`
   ```

> **No domain yet?** Use Resend's shared domain for testing:
> `from: 'Bookings <onboarding@resend.dev>'`
> (only delivers to the email you signed up with)

---

## Step 9 — Embed in your Hostinger site

In Hostinger's website builder, add an **HTML embed** element and paste:

```html
<iframe
  src="https://booking-widget.pages.dev"
  width="100%"
  height="700"
  frameborder="0"
  scrolling="auto"
  style="border:none; border-radius:12px;"
  title="Book a session"
></iframe>
```

Adjust the height to fit your page. A typical slot picker fits in ~650–750px.

---

## Step 10 — Access the admin panel

Open in any browser:
```
https://booking-widget.pages.dev/admin
```

Enter your `ADMIN_SECRET` when prompted. It's saved in your browser so you only
enter it once per device. Works on your Android tablet too — just bookmark it.

---

## Adding slots (quick reference)

In the admin panel:
1. Open `/admin`
2. Enter a date, comma-separated times (e.g. `09:00, 11:00, 14:00`), and price
3. Click **Add** — slots appear immediately

Or via API (useful for bulk imports):
```bash
curl -X POST https://booking-worker.YOUR_SUBDOMAIN.workers.dev/api/admin/slots \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: YOUR_ADMIN_SECRET" \
  -d '[
    {"date":"2025-07-01","time":"09:00","price_pence":7500,"currency":"gbp"},
    {"date":"2025-07-01","time":"11:00","price_pence":7500,"currency":"gbp"},
    {"date":"2025-07-01","time":"14:00","price_pence":7500,"currency":"gbp"}
  ]'
```

---

## Testing end-to-end (use Stripe test mode)

1. Make sure `STRIPE_SECRET_KEY` is your `sk_test_...` key
2. Add a test slot for today or tomorrow
3. Open the widget and book it
4. Use Stripe test card: `4242 4242 4242 4242`, any future expiry, any CVC
5. Check your email for confirmation
6. Check `/admin` → Bookings tab — status should be `confirmed`

---

## Troubleshooting

**Widget shows "Could not load availability"**
→ Check `VITE_API_URL` is set correctly in Pages environment variables. Rebuild after changing it.

**Payment succeeds but booking stays pending**
→ Stripe webhook isn't reaching the worker. Check the webhook URL and that `STRIPE_WEBHOOK_SECRET` is correct.

**Emails not arriving**
→ Check Resend dashboard for delivery logs. Make sure your domain DNS records are verified.

**Admin says "Wrong secret"**
→ Clear localStorage (`localStorage.clear()` in browser console) and re-enter. Make sure there are no spaces.

---

## Cost estimate (monthly)

| Service             | Free tier                        | Paid if exceeded        |
|---------------------|----------------------------------|-------------------------|
| Cloudflare Workers  | 100,000 requests/day             | $5/mo for 10M requests  |
| Cloudflare D1       | 5M reads, 100K writes/day        | $0.001 per 1M reads     |
| Cloudflare KV       | 100K reads/day                   | $0.50 per 1M reads      |
| Cloudflare Pages    | Unlimited requests               | Free forever            |
| Resend              | 100 emails/day, 3,000/mo         | $20/mo for 50,000       |
| Stripe              | No monthly fee                   | 1.5% + 20p per UK card  |

**For a small booking business, this is effectively free** until you're processing
hundreds of bookings per day.
