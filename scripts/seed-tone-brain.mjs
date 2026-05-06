// Seeds the `tone_brain` table with the v0 markdown distilled from the Anthony
// thread. Run once: `node scripts/seed-tone-brain.mjs`
// Re-run to overwrite (single-row table, id=1).

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
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

const sourceArg = process.argv[2] || ".tone-brain/tone-brain-v0.md";
const sourcePath = resolve(root, sourceArg);
if (!existsSync(sourcePath)) {
  console.error(`Source markdown not found: ${sourcePath}`);
  process.exit(1);
}
const body_md = readFileSync(sourcePath, "utf8");

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const tag = sourceArg.includes("v0") ? "corpus_v0" : "corpus_full";

const { data, error } = await sb
  .from("tone_brain")
  .upsert({ id: 1, body_md, source: tag, updated_at: new Date().toISOString() })
  .select();

if (error) {
  console.error("Seed failed:", error.message);
  process.exit(1);
}
console.log(
  `Seeded tone_brain (${body_md.length} chars, source=${tag}) — row:`,
  data,
);
