// One-shot migration: flip every dashboard page from the cream-bg "light"
// theme to the navy-bg "premium dark" theme. Cards now live on dark navy
// surfaces with cream/gold typography.
//
// Run once via: node scripts/theme-flip.mjs
// Reviews are easy: git diff after running shows every change.

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

// Files to migrate — every TSX/TS in the dashboard route group.
const filesRaw = execSync(
  `git ls-files "app/(dashboard)/**/*.tsx" "app/(dashboard)/**/*.ts"`,
  { encoding: "utf8" },
);
const files = filesRaw.split("\n").filter(Boolean);

// Ordered substitutions — earlier patterns run first.
// Use word boundaries (\b) for class fragments to avoid partial matches.
const subs = [
  // ── Surfaces ─────────────────────────────────────────────────────────
  [/\bbg-white\b/g, "bg-navy-900/60 backdrop-blur-sm"],
  [/\bbg-cream-50\b/g, "bg-navy-800/40"],
  [/\bbg-cream-100\b/g, "bg-navy-800/50"],
  [/\bborder-cream-200\b/g, "border-navy-700/40"],
  [/\bborder-cream-300\b/g, "border-navy-700/50"],
  [/\bdivide-cream-200\b/g, "divide-navy-700/40"],
  [/\bhover:bg-cream-50\b/g, "hover:bg-navy-800/40"],
  [/\bhover:bg-cream-100\b/g, "hover:bg-navy-800/60"],
  [/\bhover:border-cream-300\b/g, "hover:border-gold-500/30"],

  // ── Text colors ──────────────────────────────────────────────────────
  [/\btext-navy-900\b/g, "text-cream-50"],
  [/\btext-navy-800\b/g, "text-cream-50"],
  [/\btext-navy-700\b/g, "text-cream-100"],
  [/\btext-navy-600\b/g, "text-cream-200/80"],
  [/\btext-navy-500\b/g, "text-cream-200/60"],
  [/\btext-navy-400\b/g, "text-cream-200/50"],

  // ── Navy-tinted badge backgrounds (was light navy on cream) ──────────
  [/\bbg-navy-50\b/g, "bg-navy-700/40"],
  [/\bbg-navy-100\b/g, "bg-navy-700/50"],
  [/\bborder-navy-200\b/g, "border-navy-400/50"],

  // ── Gold accents — bump for visibility on dark bg ────────────────────
  [/\bbg-gold-50\b/g, "bg-gold-500/15"],
  [/\bbg-gold-100\b/g, "bg-gold-500/20"],
  [/\bborder-gold-300\b/g, "border-gold-500/50"],
  [/\bring-gold-200\b/g, "ring-gold-500/30"],
  [/\btext-gold-800\b/g, "text-gold-300"],
  [/\btext-gold-700\b/g, "text-gold-300"],
  [/\btext-gold-600\b/g, "text-gold-300"],

  // ── Status colors: emerald (success) ─────────────────────────────────
  [/\bbg-emerald-50\b/g, "bg-emerald-500/10"],
  [/\bbg-emerald-100\b/g, "bg-emerald-500/15"],
  [/\bborder-emerald-200\b/g, "border-emerald-500/30"],
  [/\bborder-emerald-300\b/g, "border-emerald-500/40"],
  [/\btext-emerald-800\b/g, "text-emerald-300"],
  [/\btext-emerald-700\b/g, "text-emerald-300"],
  [/\btext-emerald-600\b/g, "text-emerald-400"],

  // ── Status colors: red (critical) ────────────────────────────────────
  [/\bbg-red-50\b/g, "bg-red-500/10"],
  [/\bbg-red-100\b/g, "bg-red-500/15"],
  [/\bborder-red-200\b/g, "border-red-500/30"],
  [/\btext-red-800\b/g, "text-red-300"],
  [/\btext-red-700\b/g, "text-red-300"],
  [/\btext-red-600\b/g, "text-red-400"],

  // ── Status colors: amber (warning) ───────────────────────────────────
  [/\bbg-amber-50\b/g, "bg-amber-500/10"],
  [/\bbg-amber-100\b/g, "bg-amber-500/15"],
  [/\bborder-amber-200\b/g, "border-amber-500/30"],
  [/\btext-amber-800\b/g, "text-amber-300"],
  [/\btext-amber-700\b/g, "text-amber-300"],
];

let totalChanges = 0;
let touchedFiles = 0;

for (const file of files) {
  const before = readFileSync(file, "utf8");
  let after = before;
  for (const [re, replacement] of subs) {
    after = after.replace(re, replacement);
  }
  if (after !== before) {
    writeFileSync(file, after);
    const changes = (before.match(/./g) ?? []).length - (after.match(/./g) ?? []).length;
    console.log(`✓ ${file}${changes !== 0 ? ` (Δ ${changes} chars)` : ""}`);
    touchedFiles++;
    totalChanges++;
  }
}

console.log("");
console.log(`Done. Touched ${touchedFiles} file(s).`);
