import { NextRequest } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";

export function isAuthorizedSync(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = req.headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) return true;
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET> automatically.
  if (req.headers.get("x-vercel-cron")) return true;
  return false;
}

export async function recordSyncStart(source: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("sync_log")
    .insert({ source, status: "running" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function recordSyncFinish(
  id: string,
  result: { ok: true; records: number } | { ok: false; error: string },
) {
  const supabase = createServiceClient();
  await supabase
    .from("sync_log")
    .update({
      finished_at: new Date().toISOString(),
      status: result.ok ? "ok" : "error",
      records_processed: result.ok ? result.records : 0,
      error: result.ok ? null : result.error.slice(0, 500),
    })
    .eq("id", id);
}
