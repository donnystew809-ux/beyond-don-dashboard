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
  let j;
  try {
    j = JSON.parse(decodeEntities(block.replace(/^<pre>/, "").replace(/<\/pre>$/, "")));
  } catch {
    continue;
  }
  // Guest -> host reviews only (the ones that rate the stay).
  if (j.revieweeRole !== "HOST" || !j.hasSubmitted) {
    skippedNotGuestReview++;
    continue;
  }
  const prop = byListing.get(String(j.entityId));
  if (!prop) {
    skippedNoProperty++;
    continue;
  }
  rows.push({
    property_id: prop.id,
    airbnb_review_id: String(j.reviewId),
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
