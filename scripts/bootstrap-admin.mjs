// Creates the admin user (Donovan) in Supabase Auth and grants admin role.
// Run once: `node scripts/bootstrap-admin.mjs <email>`

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
const role = (process.argv[3] ?? "admin").toLowerCase();
if (!email) {
  console.error("Usage: node scripts/bootstrap-admin.mjs <email> [admin|operator]");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// Check if user already exists
const { data: existing } = await supabase.auth.admin.listUsers({ perPage: 200 });
let user = existing?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());

if (!user) {
  console.log(`Creating user ${email}…`);
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true, // skip email verification for the seeded admin
  });
  if (error) {
    console.error("createUser failed:", error);
    process.exit(1);
  }
  user = data.user;
  console.log(`Created. user_id=${user.id}`);
} else {
  console.log(`User exists. user_id=${user.id}`);
}

// Upsert role
const { error: roleErr } = await supabase
  .from("user_roles")
  .upsert({ user_id: user.id, role }, { onConflict: "user_id" });
if (roleErr) {
  console.error("upsert role failed:", roleErr);
  process.exit(1);
}
console.log(`Granted ${role} role to ${email}.`);
console.log("");
console.log("Sign in tomorrow at /login with this email — Supabase will email a magic link.");
