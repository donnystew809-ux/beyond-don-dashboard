// Ingests an Airbnb "Download My Data" JSON export ZIP into the messaging
// tables. Run after the email arrives:
//
//   node scripts/ingest-airbnb-export.mjs path/to/airbnb-data.zip
//
// What it does:
//   1) Unzips into .tone-brain/airbnb-export/
//   2) Finds the messaging JSON file(s) — Airbnb's export format includes
//      a `messages` directory with one JSON per thread (or a single rollup —
//      handled below).
//   3) Upserts into message_threads + messages, deduping by airbnb_thread_id
//      and the (thread_id, sent_at, sender, body) unique key.
//
// The exact Airbnb export schema isn't 100% stable (they evolve it). This
// script tries multiple known shapes and logs what it found. After running,
// run scripts/build-tone-brain.mjs to regenerate the tone brain on the full
// corpus.

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, extname, basename } from "node:path";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const envPath = resolve(root, ".env.local");
if (existsSync(envPath)) {
  const env = readFileSync(envPath, "utf8");
  for (const line of env.split("\n")) {
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

const zipPath = process.argv[2];
if (!zipPath) {
  console.error("Usage: node scripts/ingest-airbnb-export.mjs <path-to-zip>");
  process.exit(1);
}
if (!existsSync(zipPath)) {
  console.error(`Zip not found: ${zipPath}`);
  process.exit(1);
}

const extractDir = resolve(root, ".tone-brain/airbnb-export");
mkdirSync(extractDir, { recursive: true });

console.log(`Extracting ${zipPath} → ${extractDir}…`);
try {
  // Cross-platform unzip via Node's built-in tools is limited; shell out.
  // tar can read zips on Windows 10+ and macOS. Fall back to PowerShell.
  if (process.platform === "win32") {
    execSync(
      `powershell -Command "Expand-Archive -Force -Path '${zipPath}' -DestinationPath '${extractDir}'"`,
      { stdio: "inherit" },
    );
  } else {
    execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: "inherit" });
  }
} catch (err) {
  console.error("Extraction failed:", err.message);
  process.exit(1);
}

// Walk and find candidate message files
function walk(dir) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const allFiles = walk(extractDir);
const jsonFiles = allFiles.filter((f) => extname(f).toLowerCase() === ".json");
console.log(`Found ${jsonFiles.length} JSON files in export.`);

// Heuristic: messaging-related files are usually under a `messaging` or
// `message` directory, or a top-level `messages.json` / `messaging-threads.json`.
const messagingFiles = jsonFiles.filter((f) =>
  /messag|inbox|thread/i.test(f),
);
console.log(`Identified ${messagingFiles.length} messaging-shaped files:`);
for (const f of messagingFiles) {
  console.log(`  - ${f.replace(extractDir, "…")}`);
}

if (messagingFiles.length === 0) {
  console.error(
    "No messaging files detected. Inspect the export manually and update this script.",
  );
  console.log("All JSON files for reference:");
  for (const f of jsonFiles) console.log(`  - ${f.replace(extractDir, "…")}`);
  process.exit(1);
}

// Parse all and try to normalize into { threads: [...], messages: [...] }
const threads = new Map(); // key: airbnb_thread_id → thread shape
const messages = []; // { airbnb_thread_id, direction, sender, body, sent_at }

for (const f of messagingFiles) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(f, "utf8"));
  } catch (e) {
    console.warn(`  skip non-JSON: ${f}`);
    continue;
  }

  // Try several known shapes. Each handler pushes into threads/messages.
  if (Array.isArray(parsed)) {
    for (const item of parsed) handleAny(item, basename(f));
  } else if (parsed && typeof parsed === "object") {
    // Could be { threads: [...] } or single-thread object
    if (Array.isArray(parsed.threads)) {
      for (const t of parsed.threads) handleAny(t, basename(f));
    } else if (Array.isArray(parsed.conversations)) {
      for (const t of parsed.conversations) handleAny(t, basename(f));
    } else if (Array.isArray(parsed.messages)) {
      // Top-level messages list — needs a thread inferred per-row
      for (const m of parsed.messages) handleAny(m, basename(f));
    } else {
      handleAny(parsed, basename(f));
    }
  }
}

function handleAny(node, sourceFile) {
  // Thread-shaped: has a list of messages and an id
  if (
    node &&
    typeof node === "object" &&
    (Array.isArray(node.messages) || Array.isArray(node.thread_messages))
  ) {
    const msgs = node.messages || node.thread_messages;
    const tid = String(
      node.thread_id ?? node.id ?? node.conversation_id ?? `from:${sourceFile}`,
    );
    threads.set(tid, {
      airbnb_thread_id: tid,
      guest_name:
        node.guest_name ?? node.with_user_name ?? node.user_name ?? null,
      guest_first_name:
        (node.guest_name ?? node.with_user_name ?? "").split(" ")[0] || null,
      reservation_code: node.reservation_code ?? node.confirmation_code ?? null,
      check_in: node.check_in ?? null,
      check_out: node.check_out ?? null,
    });
    for (const m of msgs) {
      messages.push({
        airbnb_thread_id: tid,
        direction:
          m.direction ??
          (m.from_user_id && m.is_self ? "outbound" : m.is_self ? "outbound" : "inbound"),
        sender: m.sender_name ?? m.from_user_name ?? m.user_name ?? null,
        body: m.body ?? m.message ?? m.text ?? null,
        sent_at: m.sent_at ?? m.created_at ?? m.timestamp ?? null,
        raw: m,
      });
    }
    return;
  }
  // Single message row with embedded thread id
  if (
    node &&
    typeof node === "object" &&
    (node.thread_id || node.conversation_id) &&
    (node.body || node.message || node.text)
  ) {
    const tid = String(node.thread_id ?? node.conversation_id);
    if (!threads.has(tid)) {
      threads.set(tid, {
        airbnb_thread_id: tid,
        guest_name: node.with_user_name ?? null,
        guest_first_name: null,
      });
    }
    messages.push({
      airbnb_thread_id: tid,
      direction:
        node.direction ?? (node.is_self ? "outbound" : "inbound"),
      sender: node.sender_name ?? node.from_user_name ?? null,
      body: node.body ?? node.message ?? node.text ?? null,
      sent_at: node.sent_at ?? node.created_at ?? node.timestamp ?? null,
      raw: node,
    });
  }
}

console.log(
  `\nNormalized ${threads.size} threads, ${messages.length} messages.`,
);

if (threads.size === 0) {
  console.error(
    "No threads parsed. The export schema may have changed — inspect a sample JSON file and update handleAny().",
  );
  process.exit(1);
}

// Upsert
const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

console.log("Upserting threads…");
const threadRows = Array.from(threads.values());
const { data: insertedThreads, error: threadErr } = await sb
  .from("message_threads")
  .upsert(threadRows, { onConflict: "airbnb_thread_id" })
  .select("id, airbnb_thread_id");
if (threadErr) {
  console.error("Thread upsert failed:", threadErr.message);
  process.exit(1);
}
const threadIdByAirbnb = new Map(
  insertedThreads.map((r) => [r.airbnb_thread_id, r.id]),
);
console.log(`  → ${insertedThreads.length} threads in DB.`);

console.log("Upserting messages (in batches of 500)…");
let inserted = 0;
let skipped = 0;
const messageRows = messages
  .map((m) => {
    const thread_id = threadIdByAirbnb.get(m.airbnb_thread_id);
    if (!thread_id || !m.body || !m.sent_at) {
      skipped++;
      return null;
    }
    return {
      thread_id,
      direction: m.direction === "outbound" ? "outbound" : "inbound",
      sender: m.sender,
      body: m.body,
      sent_at: m.sent_at,
      raw: m.raw,
    };
  })
  .filter(Boolean);

for (let i = 0; i < messageRows.length; i += 500) {
  const batch = messageRows.slice(i, i + 500);
  const { error } = await sb
    .from("messages")
    .upsert(batch, { onConflict: "thread_id,sent_at,sender,body", ignoreDuplicates: true });
  if (error) {
    console.warn(`  batch ${i}-${i + batch.length} failed: ${error.message}`);
  } else {
    inserted += batch.length;
    process.stdout.write(`  ${inserted}/${messageRows.length}\r`);
  }
}

console.log(
  `\nDone. ${inserted} messages upserted, ${skipped} skipped (missing body/sent_at).`,
);
console.log(
  "\nNext: run scripts/build-tone-brain.mjs to regenerate tone-brain v1 on the full corpus.",
);
