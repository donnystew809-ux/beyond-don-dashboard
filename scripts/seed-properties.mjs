// Seeds the `properties` table from PriceLabs listings.
// Run once: `node scripts/seed-properties.mjs`
// Uses the service-role key from .env.local (bypasses RLS).

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Load .env.local
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
const PRICELABS_KEY = process.env.PRICELABS_API_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !PRICELABS_KEY) {
  console.error("Missing one of: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PRICELABS_API_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

console.log("Fetching listings from PriceLabs…");
const res = await fetch("https://api.pricelabs.co/v1/listings", {
  headers: { "X-API-Key": PRICELABS_KEY },
});
if (!res.ok) {
  console.error("PriceLabs API failed:", res.status);
  process.exit(1);
}
const { listings } = await res.json();
console.log(`Found ${listings.length} listings.`);

const rows = listings.map((l) => ({
  name: l.name,
  address: [l.city_name, l.state].filter(Boolean).join(", "),
  airbnb_listing_id: l.pms === "airbnb" ? l.id : null,
  pricelabs_listing_id: l.id,
  status: "active",
}));

// Upsert by pricelabs_listing_id so re-runs don't duplicate.
// First check what exists, then insert missing rows.
const { data: existing, error: selectError } = await supabase
  .from("properties")
  .select("pricelabs_listing_id");

if (selectError) {
  console.error("select failed:", selectError);
  process.exit(1);
}

const existingIds = new Set((existing ?? []).map((r) => r.pricelabs_listing_id));
const toInsert = rows.filter((r) => !existingIds.has(r.pricelabs_listing_id));

if (toInsert.length === 0) {
  console.log("All listings already in properties table; nothing to insert.");
} else {
  const { data, error } = await supabase
    .from("properties")
    .insert(toInsert)
    .select("id, name");
  if (error) {
    console.error("insert failed:", error);
    process.exit(1);
  }
  console.log(`Inserted ${data.length} new properties:`);
  for (const r of data) console.log(`  · ${r.name} (${r.id})`);
}
