// Ingests an Airbnb "Download My Data" export ZIP into the messaging tables.
//
//   node scripts/ingest-airbnb-export.mjs path/to/package.zip
//
// As of 2026 Airbnb ships the export as a folder of HTML files (no longer
// JSON). The structure we care about is `html/messages.html` — a giant
// bootstrap-table document where each guest thread is a top-level row
// containing a nested "Messages And Contents" subtable with one row per
// message. The metadata + body are stored as <pre>{JSON}</pre> cells.
//
// This script:
//   1. Unzips the export (cross-platform via PowerShell on Windows, unzip
//      elsewhere) into .tone-brain/airbnb-export/
//   2. Locates messages.html
//   3. Walks each "Messages And Contents" subtable, identifying the parent
//      threadId, and extracting every TextContent message (skipping system
//      template content like booking inquiries, reservation cards, etc.)
//   4. Upserts threads + messages into Supabase. Messages are deduped by
//      airbnb_message_id; threads by airbnb_thread_id.
//
// After this runs, run scripts/build-tone-brain.mjs to regenerate the
// tone brain on the full corpus.

import { readFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// ── env ─────────────────────────────────────────────────────────────────
const envPath = resolve(root, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2];
  }
}
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ── args ────────────────────────────────────────────────────────────────
const zipPath = process.argv[2];
if (!zipPath) {
  console.error("Usage: node scripts/ingest-airbnb-export.mjs <path-to-zip>");
  process.exit(1);
}
if (!existsSync(zipPath)) {
  console.error(`Zip not found: ${zipPath}`);
  process.exit(1);
}

// ── extract ─────────────────────────────────────────────────────────────
const extractDir = resolve(root, ".tone-brain/airbnb-export");
mkdirSync(extractDir, { recursive: true });

const alreadyExtracted = existsSync(join(extractDir, "Airbnb_data_request_06May2026_GMT")) ||
  existsSync(join(extractDir, "html"));
if (!alreadyExtracted) {
  console.log(`Extracting ${zipPath} → ${extractDir}…`);
  if (process.platform === "win32") {
    execSync(
      `powershell -Command "Expand-Archive -Force -Path '${zipPath}' -DestinationPath '${extractDir}'"`,
      { stdio: "inherit" },
    );
  } else {
    execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: "inherit" });
  }
} else {
  console.log("Export already extracted, skipping unzip.");
}

// Locate messages.html — the export wraps everything in one parent folder
// whose name varies by date. Walk to find it.
function findMessagesHtml(dir) {
  for (const f of require("node:fs").readdirSync(dir)) {
    const p = join(dir, f);
    const s = statSync(p);
    if (s.isDirectory()) {
      const inner = findMessagesHtml(p);
      if (inner) return inner;
    } else if (f === "messages.html") {
      return p;
    }
  }
  return null;
}
// Avoid `require` in ESM — use dynamic import for fs:
const { readdirSync } = await import("node:fs");
function findMessagesHtmlEsm(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const s = statSync(p);
    if (s.isDirectory()) {
      const inner = findMessagesHtmlEsm(p);
      if (inner) return inner;
    } else if (f === "messages.html") {
      return p;
    }
  }
  return null;
}
const messagesHtmlPath = findMessagesHtmlEsm(extractDir);
if (!messagesHtmlPath) {
  console.error(`Could not find messages.html anywhere under ${extractDir}`);
  process.exit(1);
}
console.log(`Found messages.html: ${messagesHtmlPath}`);
const sizeMB = (statSync(messagesHtmlPath).size / 1024 / 1024).toFixed(1);
console.log(`Reading ${sizeMB} MB of HTML…`);

const html = readFileSync(messagesHtmlPath, "utf8");

// ── parse ───────────────────────────────────────────────────────────────
// HTML entity decoder for body text (Airbnb leaves &amp;, &#39;, etc.)
function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

// Identify Donovan's accountId by finding the most common sender across
// messages with an iPhone Airbnb userAgent (the host app). Falls back to
// the hard-coded id seen in the sample if no clear winner.
let DONOVAN_ID = null;
{
  const candidateCounts = new Map();
  const re = /\{"senderPlatform":"iOS","accountId":(\d+)[^<]*"userAgent":"Airbnb\//g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    candidateCounts.set(id, (candidateCounts.get(id) ?? 0) + 1);
  }
  const sorted = [...candidateCounts.entries()].sort((a, b) => b[1] - a[1]);
  DONOVAN_ID = sorted[0]?.[0] ?? "193959988";
  console.log(`Detected host accountId: ${DONOVAN_ID} (${sorted[0]?.[1] ?? 0} iOS-host messages)`);
}

// Find every "Messages And Contents" subtable. For each one, locate the
// preceding parent <tr>'s threadId (the 4th <td><pre>{number}</pre></td>
// in that row) and extract all TextContent rows in the subtable.
const subtableRegex =
  /<h4>Messages And Contents<\/h4>\s*<table[^>]*>([\s\S]*?)<\/table>/g;

// Row regex for messages — captures both <pre> cells.
const rowRegex =
  /<tr>\s*<td><pre>(\{[^<]*?\})<\/pre><\/td>\s*<td><pre>(\{[^<]*?\})<\/pre><\/td>\s*<\/tr>/g;

const threadsByAirbnbId = new Map();
let lastIndex = 0;
let processedSubtables = 0;
let parsedMessageRows = 0;
let textMessages = 0;

while (true) {
  const match = subtableRegex.exec(html);
  if (!match) break;
  processedSubtables++;

  // Find the most recent threadId before this subtable. The parent <tr>
  // has the threadId as a 10-15 digit number in a <td><pre>...</pre></td>
  // that precedes the subtable opener.
  const before = html.slice(lastIndex, match.index);
  const idMatches = [...before.matchAll(/<td><pre>(\d{6,18})<\/pre><\/td>/g)];
  const threadId = idMatches.length ? idMatches[idMatches.length - 1][1] : null;
  lastIndex = match.index + match[0].length;
  if (!threadId) continue;

  const subtableBody = match[1];
  let row;
  rowRegex.lastIndex = 0;
  while ((row = rowRegex.exec(subtableBody)) !== null) {
    parsedMessageRows++;
    let meta, content;
    try {
      meta = JSON.parse(row[1]);
      content = JSON.parse(row[2]);
    } catch {
      continue;
    }
    if (meta.contentType !== "TextContent") continue;
    const body = content?.textContent?.body;
    if (!body || typeof body !== "string") continue;
    textMessages++;

    if (!threadsByAirbnbId.has(threadId)) {
      threadsByAirbnbId.set(threadId, {
        airbnb_thread_id: threadId,
        first_seen_at: meta.createdAt,
        last_seen_at: meta.createdAt,
        messages: [],
      });
    }
    const thread = threadsByAirbnbId.get(threadId);
    if (new Date(meta.createdAt) < new Date(thread.first_seen_at))
      thread.first_seen_at = meta.createdAt;
    if (new Date(meta.createdAt) > new Date(thread.last_seen_at))
      thread.last_seen_at = meta.createdAt;
    thread.messages.push({
      airbnb_message_id: String(meta.id),
      sender: String(meta.accountId) === DONOVAN_ID ? "host" : "guest",
      sender_account_id: String(meta.accountId),
      sent_at: meta.createdAt,
      body: decodeEntities(body),
    });
  }
}

const allThreads = [...threadsByAirbnbId.values()];
const totalMessages = allThreads.reduce((sum, t) => sum + t.messages.length, 0);
const hostMessages = allThreads.reduce(
  (sum, t) => sum + t.messages.filter((m) => m.sender === "host").length,
  0,
);
const guestMessages = totalMessages - hostMessages;

console.log("");
console.log("─── Parse summary ───────────────────────────");
console.log(`Subtables scanned     : ${processedSubtables}`);
console.log(`Total message rows    : ${parsedMessageRows}`);
console.log(`TextContent messages  : ${textMessages}`);
console.log(`Unique threads        : ${allThreads.length}`);
console.log(`Host (Donovan)        : ${hostMessages} messages`);
console.log(`Guests                : ${guestMessages} messages`);
console.log("");

// ── upsert ──────────────────────────────────────────────────────────────
console.log("Upserting threads + messages into Supabase…");

let threadsUpserted = 0;
let messagesUpserted = 0;
let errors = 0;

for (const thread of allThreads) {
  // Pull last message preview from the most recent text body in this thread.
  const sortedMessages = [...thread.messages].sort(
    (a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime(),
  );
  const preview = sortedMessages[0]?.body.slice(0, 200) ?? null;

  const { data: threadRow, error: threadErr } = await supabase
    .from("message_threads")
    .upsert(
      {
        airbnb_thread_id: thread.airbnb_thread_id,
        last_message_at: thread.last_seen_at,
        last_message_preview: preview,
      },
      { onConflict: "airbnb_thread_id" },
    )
    .select("id")
    .single();

  if (threadErr || !threadRow) {
    console.error(`thread ${thread.airbnb_thread_id} upsert failed:`, threadErr?.message);
    errors++;
    continue;
  }
  threadsUpserted++;

  // Schema: messages(direction inbound|outbound, sender text label, body, sent_at, airbnb_message_id)
  // Unique key: (thread_id, sent_at, sender, body) — used for dedupe on
  // re-runs. ignoreDuplicates: true so we skip silently rather than error.
  const rows = thread.messages.map((m) => ({
    thread_id: threadRow.id,
    direction: m.sender === "host" ? "outbound" : "inbound",
    sender: m.sender === "host" ? "Donovan" : "Guest",
    body: m.body,
    sent_at: m.sent_at,
    airbnb_message_id: m.airbnb_message_id,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error: msgErr, count } = await supabase
      .from("messages")
      .upsert(batch, {
        onConflict: "thread_id,sent_at,sender,body",
        ignoreDuplicates: true,
        count: "exact",
      });
    if (msgErr) {
      console.error(`thread ${thread.airbnb_thread_id} batch ${i}: ${msgErr.message}`);
      errors++;
    } else {
      messagesUpserted += count ?? batch.length;
    }
  }
}

console.log("");
console.log("─── Ingest summary ──────────────────────────");
console.log(`Threads upserted      : ${threadsUpserted} / ${allThreads.length}`);
console.log(`Messages upserted     : ${messagesUpserted} / ${totalMessages}`);
console.log(`Errors                : ${errors}`);
console.log("");
console.log("Next: node scripts/build-tone-brain.mjs");
