# Morning handoff — 2026-05-06

## What happened overnight

### Outlook check
Searched `donnys132@hotmail.com` for Airbnb mail. Result: **only transactional notifications** — payouts, reservation confirmations, review reminders, login alerts. **No actual guest message bodies.** All real conversation content lives inside the Airbnb host inbox itself. Don't waste time mining Outlook for tone data.

### Browser scrape of host inbox — partial
- Got into `/hosting/messages` while you were signed in.
- Successfully scraped **1 full thread** (Anthony, current 6-week stay) — every message, both sides.
- Captured **16 unique list-row previews** (last-message snippets per conversation).
- The bulk re-scrape attempt got bitten by Airbnb's virtualized list — clicking convos in a loop kept reopening the same one. Fixable, but not worth more cycles tonight.
- Saved to: `.tone-brain/airbnb-corpus-seed.json` (62 KB, gitignored).

### Tone brain v0
Wrote `.tone-brain/tone-brain-v0.md` distilling **your actual voice** from the Anthony thread. Captures your patterns:
- "Hey [Name]," opener
- "we / us" first-person plural
- emoji on friendly check-ins, never on operational replies
- explicit "5 star stay" framing in mid-stay check-ins
- empathy → action → consent → check-in pattern for issues
- "Oh my goodness! Thank you for letting us know!"
- "you definitely won't get blamed!"

Read it. Edit anything that doesn't sound like you. This becomes the system prompt for the AI drafter.

### Messaging schema
Created `supabase/migrations/0003_messaging.sql` — four new tables:
- `message_threads` — one row per Airbnb conversation
- `messages` — individual messages (inbound from guest, outbound from you)
- `message_drafts` — Claude-generated reply drafts awaiting Jasmin's review
- `tone_brain` — single-row markdown that gets fed to the drafter as system prompt

RLS: members read everything, admins write. Same pattern as the rest of the app.

`lib/supabase/types.ts` updated to match.

---

## YOUR ACTIONS THIS MORNING

1. **Apply the migration.** Open Supabase SQL Editor → paste `0003_messaging.sql` → Run.
2. **Click "Download My Data"** in Airbnb (Account → Privacy & sharing → Request your data). It takes 24–48h to email you a ZIP. **Do this before coffee.** That ZIP contains every message you've ever exchanged — way better than my browser scrape.
3. **Read `.tone-brain/tone-brain-v0.md`.** Edit anything wrong. We'll regenerate v1 once the full corpus arrives.

---

## NEXT BUILD SESSION

In priority order:
1. Insert `tone-brain-v0.md` into `tone_brain` table (one-time seed).
2. Drafter endpoint: `POST /api/messages/draft` — takes a `thread_id`, pulls last N messages + tone brain, calls Claude Opus 4.7 with adaptive thinking, writes a `message_drafts` row.
3. Inbox UI: `/messages` and `/messages/[id]` — left panel = thread list, right panel = thread + draft + Approve/Edit/Reject buttons.
4. Once the data download arrives: ingest the ZIP into `messages` + `message_threads`, then regenerate the tone brain on the full corpus.

**Sending stays manual.** Jasmin pastes approved drafts into Airbnb herself. That's the agreed Phase 2 model — no auto-send.

---

## Open question

The browser scrape proved the corpus exists but is hard to get cleanly. Two paths once the data download arrives:
- **A**: One-time JSON ingest, then live messages come in via you/Jasmin manually pasting screenshots/text into the dashboard.
- **B**: Periodic browser scrape (now that we know the DOM shape, we can write a more careful sequencer).

Recommend A for v1. Revisit B if it becomes a real pain point.
