# BEYOND DON LLC — Operations Dashboard

Unified property management dashboard for Donovan Stewart's BEYOND DON LLC Airbnb portfolio.
Consolidates **Airbnb iCal feeds**, **PriceLabs**, and **Turno** into one view for Donovan
(admin) and his sister (operations manager).

This is **Phase 0** of the [project brief](../BeyondDon_Airbnb_Automation_Project_Brief.md).
It replaces the brief's "master Google Sheets workbook" with a Postgres-backed web app and
leaves room for the brief's later phases (guest messaging, inventory, owner reports).

## Stack

- **Next.js 16** (App Router, TypeScript, Server Components)
- **Supabase** — Postgres + Auth (magic link) + Row Level Security
- **Tailwind CSS** for styling
- **Vercel Cron** for scheduled syncs
- Integrations: **ical.js** (Airbnb iCal), **PriceLabs API**, **Turno API**

## One-time setup

### 1. Supabase project

1. Create a new project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the contents of `supabase/migrations/0001_init.sql`, run it.
3. Open **Settings → API**, copy the URL, anon key, and service role key.
4. Open **Authentication → Providers** and confirm Email magic-link is enabled.
5. Create your first user: **Authentication → Users → Invite** (use your email).
6. After signing in once, run this in the SQL editor to make yourself admin:
   ```sql
   insert into user_roles (user_id, role)
   select id, 'admin' from auth.users where email = 'donovan@example.com';
   ```
7. Add your sister the same way once she has signed in (use role `operator`).

### 2. Local dev

```bash
cp .env.local.example .env.local
# Fill in Supabase + PriceLabs + Turno keys
npm install
npm run dev
```

Visit `http://localhost:3000`. Sign in with your email, then add your first property
under **Settings → Add property**.

### 3. Run a sync manually

```bash
curl -X POST http://localhost:3000/api/sync/airbnb-ical \
  -H "Authorization: Bearer $CRON_SECRET"

curl -X POST http://localhost:3000/api/sync/pricelabs \
  -H "Authorization: Bearer $CRON_SECRET"

curl -X POST http://localhost:3000/api/sync/turno \
  -H "Authorization: Bearer $CRON_SECRET"
```

Or click **Run sync** under **Settings → Manual sync**.

### 4. Deploy

1. Push the repo to GitHub.
2. Import into Vercel.
3. Set the env vars in Vercel (same as `.env.local.example`).
4. Vercel Cron picks up `vercel.json` automatically. The schedule is:
   - iCal sync: every 2 hours
   - Turno sync: every hour (offset 5 min)
   - PriceLabs sync: every 6 hours (offset 10 min)
5. (Optional) Add a custom domain like `dash.beyonddon.com`.

## What the API does

| Route | Purpose | Auth |
|---|---|---|
| `GET/POST /api/sync/airbnb-ical` | Fetch each property's iCal feed, upsert reservations | Cron secret |
| `GET/POST /api/sync/pricelabs` | Pull suggested prices for next ~30 days | Cron secret |
| `GET/POST /api/sync/turno` | Pull cleanings between -7 and +60 days | Cron secret |
| `POST /api/pricing/override` | Push a date-specific PriceLabs override | Admin session |

## Roles

| Role | Sees | Can write |
|---|---|---|
| `admin` (Donovan) | Everything | Everything (settings, pricing, invites, contracts) |
| `operator` (Jasmin) | Staff pages (Today, Calendar, Properties, Cleaning, Messages, Alerts) | Day-to-day ops |
| `cleaner` | Only their granted properties: access profile, checklist, inventory, maintenance | Checklist progress, inventory counts, task completion |
| `owner` / `partner` | Their properties + Earnings (P&L, reservations, reviews) | Nothing |

Roles are granted via **Settings → Team** invites (`property_access` scopes
non-staff to specific properties; RLS enforces it — verified by E2E tests).

## What's intentionally not built yet

- Off-platform invoicing (attorney sign-off is a hard gate)
- In-house pricing engine (PriceLabs behind `lib/pricing-engine.ts` seam)
- AI listing optimizer (planned v1.5 — generates titles, descriptions, amenity suggestions
  using PriceLabs comp data + Claude API)
- Real-time revenue from Airbnb (no public API — needs CSV upload or Cowork browser
  automation; brief Phase 5)

## Notes

- **Airbnb iCal limits**: feeds expose dates and a reservation code only. No guest names,
  no revenue. Revenue must come from CSV import or browser automation.
- **PriceLabs API shape**: response fields can drift; the parser in
  `lib/integrations/pricelabs.ts` is defensive but verify the first sync against the live
  API and adjust field names if needed.
- **Turno API**: requires partner access. If keys aren't visible in your Turno UI, email
  Turno support to request API access.
