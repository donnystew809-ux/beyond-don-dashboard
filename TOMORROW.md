# Status — 2026-05-06

## Live in production
- Phase 2 messaging system: AI drafter + inbox UI for Jasmin
- Tone brain v0 seeded from the Anthony thread
- All 4 messaging tables + RLS in Supabase
- Property context baked into the drafter (Sweet Suite Relief offline, Oak Arbor 3 winding down to June 30, Caramel Cabin handled)

## Try it now
1. Sign in at https://beyond-don-dashboard.vercel.app
2. Click **Messages** in the sidebar → **+ Paste new message**
3. Paste any real guest message + their first name + property
4. Claude drafts a reply in your voice. Approve/edit/copy/paste into Airbnb.

## Waiting on Airbnb data export (24–48h)
The data request is submitted (or pending your SMS 2FA confirmation — finish that if you haven't). When the email arrives:

```bash
cd beyond-don-dashboard
node scripts/ingest-airbnb-export.mjs ~/Downloads/airbnb-data.zip
node scripts/build-tone-brain.mjs
```

That replaces v0 with v1 trained on hundreds of your real messages.

## Property context (for reference)
- **Sweet Suite Relief**: offline, flood damage, owner divorce delaying floor repairs. Drafter knows not to promise reactivation.
- **The Oak Arbor 3**: subleased, lease expires June 30, NOT renewing. Current guest has backup code. Drafter knows not to promise long-term improvements.
- **The Caramel Cabin**: smart lock battery — team notified by Donovan.

## Files of note
- `lib/messaging/drafter.ts` — Claude Opus 4.7 drafter
- `app/(dashboard)/messages/` — inbox UI
- `app/api/messages/{draft,action,paste,follow-up}/route.ts` — API endpoints
- `scripts/seed-tone-brain.mjs` — already run; reseed if you edit `.tone-brain/tone-brain-v0.md`
- `scripts/ingest-airbnb-export.mjs` — run when ZIP arrives
- `scripts/build-tone-brain.mjs` — run after ingest to upgrade to v1
- `supabase/migrations/0003_messaging.sql` — already applied
