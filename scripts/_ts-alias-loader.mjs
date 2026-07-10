// Minimal ESM resolve hook so plain `node` can run the .ts verification
// scripts directly: rewrites the "@/…" path alias to an absolute file URL and
// appends a TS/JS extension when missing. Node 24 strips TypeScript types
// natively, so no transpiler is needed — this only fixes path resolution.
//
// Used by `npm run test:signals` via `node --loader ./scripts/_ts-alias-loader.mjs`.
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    let abs = path.resolve(process.cwd(), specifier.slice(2));
    if (!path.extname(abs)) {
      for (const ext of [".ts", ".tsx", ".mjs", ".js"]) {
        if (fs.existsSync(abs + ext)) {
          abs += ext;
          break;
        }
      }
    }
    return next(pathToFileURL(abs).href, context);
  }
  return next(specifier, context);
}
