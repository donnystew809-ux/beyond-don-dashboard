// Thread matcher — connects a parsed inbound email to a message_thread.
//
// Strategy (strictest first):
//   1. Reservation code — exact match on message_threads.reservation_code,
//      else on reservations.reservation_code (gives us the property; find or
//      create the thread).
//   2. Fuzzy — open threads with the same guest first name (optionally
//      narrowed by property hint). Exactly ONE candidate = match; zero =
//      create a new thread; multiple = AMBIGUOUS (never guess — the pipeline
//      escalates ambiguous matches to a human, it must not reply into the
//      wrong conversation).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedGuestEmail } from "./email-parser";

export type ThreadMatch =
  | { kind: "matched"; threadId: string; propertyId: string | null; via: "code" | "fuzzy" }
  | { kind: "created"; threadId: string; propertyId: string | null }
  | { kind: "ambiguous"; candidateThreadIds: string[] };

type ThreadRow = {
  id: string;
  property_id: string | null;
  guest_first_name: string | null;
  reservation_code: string | null;
  status: string;
  last_message_at: string | null;
};

export async function matchThread(
  supabase: SupabaseClient,
  parsed: ParsedGuestEmail,
): Promise<ThreadMatch> {
  const db = supabase as any; // generated types predate messaging automation columns

  // ── 1. Reservation code ────────────────────────────────────────────────
  if (parsed.reservationCode) {
    const { data: byCode } = await db
      .from("message_threads")
      .select("id, property_id")
      .eq("reservation_code", parsed.reservationCode)
      .limit(1);
    if (byCode?.length) {
      return {
        kind: "matched",
        threadId: byCode[0].id,
        propertyId: byCode[0].property_id,
        via: "code",
      };
    }

    // Code known from a reservation but no thread yet → create one attached
    // to the right property.
    const { data: resv } = await db
      .from("reservations")
      .select("property_id, guest_name, check_in, check_out")
      .eq("reservation_code", parsed.reservationCode)
      .limit(1);
    if (resv?.length) {
      const created = await createThread(db, parsed, resv[0].property_id, {
        check_in: resv[0].check_in,
        check_out: resv[0].check_out,
      });
      return { kind: "created", threadId: created, propertyId: resv[0].property_id };
    }
  }

  // ── 2. Fuzzy by guest name (+ property hint) ───────────────────────────
  if (parsed.guestFirstName) {
    let query = db
      .from("message_threads")
      .select("id, property_id, guest_first_name, reservation_code, status, last_message_at")
      .eq("status", "active")
      .ilike("guest_first_name", parsed.guestFirstName)
      .order("last_message_at", { ascending: false })
      .limit(5);
    const { data: candidates } = (await query) as { data: ThreadRow[] | null };

    let filtered = candidates ?? [];
    if (filtered.length > 1 && parsed.propertyHint) {
      // Narrow by property name when the email names the listing.
      const { data: props } = await db
        .from("properties")
        .select("id, name, nickname")
        .or(
          `name.ilike.%${escapeLike(parsed.propertyHint)}%,nickname.ilike.%${escapeLike(parsed.propertyHint)}%`,
        );
      const propIds = new Set((props ?? []).map((p: { id: string }) => p.id));
      const narrowed = filtered.filter((t) => t.property_id && propIds.has(t.property_id));
      if (narrowed.length > 0) filtered = narrowed;
    }

    if (filtered.length === 1) {
      return {
        kind: "matched",
        threadId: filtered[0].id,
        propertyId: filtered[0].property_id,
        via: "fuzzy",
      };
    }
    if (filtered.length > 1) {
      return { kind: "ambiguous", candidateThreadIds: filtered.map((t) => t.id) };
    }
  }

  // ── 3. No match → new thread (property from hint when resolvable) ──────
  let propertyId: string | null = null;
  if (parsed.propertyHint) {
    const { data: props } = await (supabase as any)
      .from("properties")
      .select("id")
      .or(
        `name.ilike.%${escapeLike(parsed.propertyHint)}%,nickname.ilike.%${escapeLike(parsed.propertyHint)}%`,
      )
      .limit(2);
    if (props?.length === 1) propertyId = props[0].id;
  }
  const created = await createThread(supabase as any, parsed, propertyId, {});
  return { kind: "created", threadId: created, propertyId };
}

/**
 * Create a thread for a parsed email outside the normal match flow —
 * used by the intake route when a match is AMBIGUOUS: the message must
 * still land somewhere visible, but auto-send stays off and a human
 * resolves which conversation it belongs to.
 */
export async function createThreadFromEmail(
  supabase: SupabaseClient,
  parsed: ParsedGuestEmail,
  propertyId: string | null,
): Promise<string> {
  return createThread(supabase as any, parsed, propertyId, {});
}

async function createThread(
  db: any,
  parsed: ParsedGuestEmail,
  propertyId: string | null,
  stay: { check_in?: string | null; check_out?: string | null },
): Promise<string> {
  const { data, error } = await db
    .from("message_threads")
    .insert({
      property_id: propertyId,
      guest_first_name: parsed.guestFirstName,
      guest_name: parsed.guestFirstName,
      reservation_code: parsed.reservationCode,
      check_in: stay.check_in ?? null,
      check_out: stay.check_out ?? null,
      status: "active",
      last_message_at: new Date().toISOString(),
      last_message_preview: parsed.body?.slice(0, 200) ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`thread create failed: ${error.message}`);
  return data.id as string;
}

function escapeLike(s: string): string {
  return s.replace(/[%_,()]/g, " ").trim();
}
