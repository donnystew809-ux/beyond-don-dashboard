# Tomorrow's punch list — read this first

> Status as of tonight: **the dashboard is LIVE in production** at
> **https://beyond-don-dashboard.vercel.app**.
> 11 properties, 28 reservations, 2,164 daily price rows synced from
> PriceLabs. Vercel cron runs daily at 9:00/9:10/9:20 UTC. Two things still
> need your attention: signing in tomorrow, and pasting in Airbnb iCal URLs
> per listing (Airbnb requires you to be logged in there, so I couldn't grab
> them).

---

## What's done

| Thing | State |
|---|---|
| GitHub repo | https://github.com/donnystew809-ux/beyond-don-dashboard *(private)* |
| Supabase project | `beyond-don-dashboard` (org `BeyondDonLLC`) — schema + 11 properties + admin user seeded |
| PriceLabs API | Enabled on your account, key stored in `.env.local`, sync working — 2,164 price rows, 27 derived reservations |
| Auth | Magic-link sign-in for **beyonddonllc@outlook.com** (you, admin role) |
| Local dashboard | Runs at `npm run dev` → http://localhost:3000 |
| **Production dashboard** | **https://beyond-don-dashboard.vercel.app** (live, magic-link auth) |
| Vercel cron | Daily syncs at 9:00 / 9:10 / 9:20 UTC (Hobby tier max = once per day) |

## What you need to do (~15 minutes)

### 1. Sign in and look at the dashboard
Open **https://beyond-don-dashboard.vercel.app** on any device — your phone, the Surface Pro, anywhere. Enter `beyonddonllc@outlook.com`, click the magic link Supabase emails you, and you'll land on the portfolio dashboard with real numbers. Click around — Calendar, Pricing, Properties — all populated from PriceLabs.

(If you want to run it locally too: `cd beyond-don-dashboard && npm run dev` — same login.)

### 2. Paste in Airbnb iCal URLs (per listing)
PriceLabs gave us booking *status*, but the Airbnb iCal feed has reservation
codes and (after some massaging) more detail. To wire it up:

For each of your 11 listings:
1. Go to Airbnb → Hosting → Calendar → pick the listing → **Sync calendars**
2. Copy the **Export Calendar** URL (`https://www.airbnb.com/calendar/ical/…`)
3. In the dashboard, **Settings → Properties → Edit** that property and paste
   the URL into the "Airbnb iCal export URL" field
4. Click **Settings → Manual sync → Run sync** on "Airbnb iCal"

Don't *have* to do this — PriceLabs alone gives you a working calendar — but
it's a useful cross-check.

### 3. Vercel deploy — done
Already deployed at https://beyond-don-dashboard.vercel.app. Crons run daily
at 9:00, 9:10, 9:20 UTC (Hobby tier limit). If you want hourly syncs,
upgrade to Pro ($20/mo) and update `vercel.json` to the schedules in git
history. Otherwise, hit **Settings → Run sync** any time you want fresher
data.

To deploy code changes: `npm run build` locally first to catch errors, then
either push to GitHub master (auto-deploys) or run `npx vercel --prod`.

Add a custom domain like `dash.beyonddon.com` in Vercel → project →
Settings → Domains.

### 4. Add your sister
Once she has an email she'll log into:
```bash
node scripts/bootstrap-admin.mjs sister@example.com operator
```
She gets `operator` access — she sees calendar, properties, cleanings, but
not API keys or sync logs.

### 5. (Optional) Email Turno for an API key
The Turno UI doesn't expose API access; it's request-only. Email
`support@turno.com`:

> Subject: API access for partner integration
>
> Hi — I'd like API access to my Turno host account so I can pull my
> cleaning schedule into a custom internal dashboard. Please enable Partner
> API access on the account associated with beyonddonllc@outlook.com and
> let me know how to retrieve my API key.
>
> Thanks,
> Donovan Stewart, BEYOND DON LLC

When you get the key, paste it into `TURNO_API_KEY=` in `.env.local`
(and Vercel) and the cleaning page will populate.

---

## Heads up — small things to know

- **Sweet Suite Relief, Sapphire Suite, Urban Jungle, Clock Out Cottage,
  and Sweet Suite Escape have PriceLabs sync turned OFF** (gray toggle in
  PriceLabs UI). The dashboard works for them, but you won't see suggested
  prices until you flip those toggles ON in PriceLabs.
- **Property names are imported verbatim from PriceLabs**, including the
  duplicate "The Caramel Cabin Getaway" listing. You can rename / remove /
  pause any property under **Settings → Properties → Edit**.
- **`.env.local` is git-ignored** — your keys never leave your machine.
  When you set up Vercel, paste the values into Vercel's env-var UI, don't
  commit them.
- **PriceLabs override endpoint**: I built it but haven't tested it
  end-to-end against a real listing. Try one override on a non-critical
  date first to confirm the round-trip works before relying on it.
- **AGENTS.md note**: this Next.js scaffold ships with a one-line "this is
  not the Next.js you know" warning. Next.js 16 is real and stable — that
  warning is just there to make me read the docs. You can delete
  `AGENTS.md` and `CLAUDE.md` when you want.

## Things planned for later (not built tonight)

- **v1.5 Listing Optimizer** — AI-generated title/description/amenity
  suggestions per listing using PriceLabs comp data + Claude API. Would
  use the `Market Research` and `Listing Optimizer` data I already see in
  your PriceLabs UI. ~$10–20 of Claude API per full portfolio analysis.
- **Owner reports** (brief Phase 4) — Sunday-night PDF per owner.
- **Guest message automation** (brief Phase 2) — needs Cowork on Surface
  Pro.
- **Inventory tracking** (brief Phase 3) — once the dashboard is in
  steady use.

---

## If something goes sideways

- **Sign-in email never arrives** — Supabase free tier sends ~3 emails per
  hour. Wait, or in Supabase → Authentication → Users, click the user → Send
  magic link manually.
- **Sync says "error"** — Settings → Recent sync runs shows the error
  message. Most common cause: a property's Sync toggle is OFF in PriceLabs.
- **Numbers look off** — revenue is derived from PriceLabs ADR × nights,
  which is an estimate. Real Airbnb earnings come from CSV upload (planned
  later) or a Cowork browser-automation pull.

That's it. Get some sleep. Sister can be on this Monday.
