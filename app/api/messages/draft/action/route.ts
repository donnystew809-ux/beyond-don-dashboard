// Approve / edit / reject / mark-sent a message draft. Members (operators) can
// do this — that's the whole point: Jasmin handles the queue.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { DraftStatus } from "@/lib/supabase/types";

export const runtime = "nodejs";

const Body = z.object({
  draft_id: z.string().uuid(),
  action: z.enum(["approve", "edit", "reject", "mark_sent"]),
  edited_body: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("unauthorized", { status: 401 });

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "bad request" },
      { status: 400 },
    );
  }

  const service = createServiceClient();

  type DraftUpdate = {
    status?: DraftStatus;
    approved_by?: string | null;
    approved_at?: string | null;
    edited_body?: string | null;
  };
  const update: DraftUpdate = {};
  switch (body.action) {
    case "approve":
      update.status = "approved";
      update.approved_by = user.id;
      update.approved_at = new Date().toISOString();
      break;
    case "edit":
      if (!body.edited_body)
        return NextResponse.json(
          { error: "edited_body required for edit" },
          { status: 400 },
        );
      update.status = "edited";
      update.edited_body = body.edited_body;
      update.approved_by = user.id;
      update.approved_at = new Date().toISOString();
      break;
    case "reject":
      update.status = "rejected";
      update.approved_by = user.id;
      update.approved_at = new Date().toISOString();
      break;
    case "mark_sent":
      update.status = "sent";
      break;
  }

  const { data, error } = await service
    .from("message_drafts")
    .update(update)
    .eq("id", body.draft_id)
    .select("id, status, edited_body")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
