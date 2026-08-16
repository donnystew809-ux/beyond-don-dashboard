// Ingest guest reviews from the Airbnb data export (reviews.html) into
// property_reviews. Idempotent — upserts on airbnb_review_id.
// Usage: node scripts/ingest-reviews.mjs [path-to-reviews.html]

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const envPath = resolve(root, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2];
  }
}

const HTML =
  process.argv[2] ??
  resolve(
    root,
    ".tone-brain/airbnb-export/Airbnb_data_request_06May2026_GMT/html/reviews.html",
  );

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

function decodeEntities(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

const html = readFileSync(HTML, "utf8");
const blocks = html.match(/<pre>(\{[^<]*?"reviewId"[^<]*?\})<\/pre>/g) ?? [];
console.log(`found ${blocks.length} review blocks`);

// listing id -> property id
const { data: props, error: pErr } = await supabase
  .from("properties")
  .select("id, name, airbnb_listing_id");
if (pErr) throw pErr;
const byListing = new Map(
  (props ?? [])
    .filter((p) => p.airbnb_listing_id)
    .map((p) => [String(p.airbnb_listing_id), p]),
);

let upserted = 0;
let skippedNoProperty = 0;
let skippedNotGuestReview = 0;
const rows = [];

for (const block of blocks) {
  const inner = decodeEntities(
    block.replace(/^<pre>/, "").replace(/<\/pre>$/, ""),
  );
  let j;
  try {
    j = JSON.parse(inner);
  } catch {
    continue;
  }
  // Guest -> host reviews only (the ones that rate the stay).
  if (j.revieweeRole !== "HOST" || !j.hasSubmitted) {
    skippedNotGuestReview++;
    continue;
  }
  // CRITICAL: entityId (listing id) and reviewId are 18–19 digit integers that
  // exceed JS's Number.MAX_SAFE_INTEGER (2^53). JSON.parse silently rounds
  // them — e.g. Sapphire's 1293684874288521370 becomes ...521500, so it never
  // matches the DB listing id and the review is dropped. Pull both straight
  // from the raw JSON text as exact strings instead of trusting the parsed
  // Number.
  const entityId = inner.match(/"entityId":\s*(\d+)/)?.[1] ?? String(j.entityId);
  const reviewId = inner.match(/"reviewId":\s*(\d+)/)?.[1] ?? String(j.reviewId);
  const prop = byListing.get(entityId);
  if (!prop) {
    skippedNoProperty++;
    continue;
  }
  rows.push({
    property_id: prop.id,
    airbnb_review_id: reviewId,
    rating: Number.isFinite(j.rating) ? j.rating : null,
    comment: j.comment || null,
    submitted_at: j.submittedAt ?? j.firstSubmittedAt ?? null,
    raw: j,
  });
}

for (let i = 0; i < rows.length; i += 100) {
  const chunk = rows.slice(i, i + 100);
  const { error } = await supabase
    .from("property_reviews")
    .upsert(chunk, { onConflict: "airbnb_review_id" });
  if (error) {
    console.error("upsert failed:", error.message);
    process.exit(1);
  }
  upserted += chunk.length;
}

console.log(
  `upserted ${upserted} reviews · skipped ${skippedNoProperty} (unmatched listing) · ${skippedNotGuestReview} (not guest->host)`,
);
