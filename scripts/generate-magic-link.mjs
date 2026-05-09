// Mints a one-time magic-link URL for an existing Supabase auth user.
// Usage: node scripts/generate-magic-link.mjs <email> [redirectPath]

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

const email = process.argv[2];
const redirectPath = process.argv[3] ?? "/today";
if (!email) {
  console.error("Usage: node scripts/generate-magic-link.mjs <email> [redirectPath]");
  process.exit(1);
}

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://beyond-don-dashboard.vercel.app";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data, error } = await supabase.auth.admin.generateLink({
  type: "magiclink",
  email,
});

if (error) {
  console.error("generateLink failed:", error);
  process.exit(1);
}

const url = new URL(`${siteUrl}/auth/callback`);
url.searchParams.set("token_hash", data.properties.hashed_token);
url.searchParams.set("type", "magiclink");
url.searchParams.set("next", redirectPath);

console.log("");
console.log("Magic link (single-use, ~1 hour expiry):");
console.log(url.toString());
console.log("");
