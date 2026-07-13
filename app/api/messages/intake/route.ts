// POST /api/messages/intake — Mailgun inbound webhook.
//
// The real-time entry point of the guest-messaging pipeline:
//
//   Airbnb notification email → Mailgun route → THIS handler
//     → verify signature → parse → match thread → store inbound message
//     → draft (tone brain + property profile + policy brain)
//     → AUTO-SEND when every gate passes, else pending draft + notification.
//
// Auto-send gates (ALL must pass):
//   1. global kill-switch off        (app_settings.messaging_kill_switch)
//   2. property.auto_send_messages   (per-property opt-in, default false)
//   3. category ∈ ROUTINE_CATEGORIES (money/changes/complaints never auto-send)
//   4. confidence === "high"
//   5. unambiguous thread match + a reply-relay address present
//
// Every step is recorded in message_audit (including the raw email payload
// on receipt, for replay when Airbnb changes their notification format).

import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyMailgunSignature, sendMailgunEmail } from "@/lib/integrations/mailgun";
import {
  parseAirbnbNotification,
  type MailgunInboundFields,
} from "@/lib/messaging/email-parser";
import { matchThread, createThreadFromEmail } from "@/lib/messaging/thread-matcher";
import { retrievePolicyDocs, formatPolicyContext } from "@/lib/messaging/policy-retrieval";
import { draftReply, ROUTINE_CATEGORIES, type ThreadContext } from "@/lib/messaging/drafter";

export const maxDuration = 300;

export async function POST(request: Request) {
  const db = createServiceClient() as any;

  // Mailgun posts multipart/form-data (or urlencoded) — normalize to a map.
  // A body that can't be parsed as a form is not a Mailgun webhook; return
  // 400 (not a 5xx) so Mailgun doesn't retry a genuinely malformed request.
  const fields: Record<string, string> = {};
  try {
    const form = await request.formData();
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") fields[key] = value;
    }
  } catch {
    return NextResponse.json({ error: "expected form-encoded body" }, { status: 400 });
  }

  // ── Gate 0: authenticity ────────────────────────────────────────────────
  const ok = verifyMailgunSignature({
    timestamp: fields["timestamp"] ?? "",
    token: fields["token"] ?? "",
    signature: fields["signature"] ?? "",
  });
  if (!ok) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const parsed = parseAirbnbNotification(fields as MailgunInboundFields);

  const audit = async (action: string, threadId: string | null, payload: object) => {
    await db.from("message_audit").insert({ thread_id: threadId, action, payload });
  };

  // Raw payload first — everything downstream is replayable from this row.
  await audit("email_received", null, {
    subject: parsed.subject,
    from: fields["from"] ?? null,
    parsed: {
      guest: parsed.guestFirstName,
      code: parsed.reservationCode,
      property_hint: parsed.propertyHint,
      reply_to: parsed.replyTo,
      is_airbnb: parsed.isAirbnbNotification,
    },
    raw: fields,
  });

  // Non-Airbnb mail (or unparseable body): acknowledge (200 stops Mailgun
  // retries) and leave it in the audit log for inspection.
  if (!parsed.isAirbnbNotification || !parsed.body) {
    await audit("parsed", null, { skipped: true, reason: !parsed.isAirbnbNotification ? "not_airbnb" : "empty_body" });
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    // ── Thread match ──────────────────────────────────────────────────────
    const match = await matchThread(db, parsed);
    let threadId: string;
    let propertyId: string | null;
    let ambiguous = false;

    if (match.kind === "ambiguous") {
      ambiguous = true;
      threadId = await createThreadFromEmail(db, parsed, null);
      propertyId = null;
      await audit("ambiguous_escalated", threadId, {
        candidates: match.candidateThreadIds,
      });
      await db.from("notification_events").insert({
        type: "draft_needs_review",
        ref_id: threadId,
        title: `Ambiguous guest match: ${parsed.guestFirstName ?? "Unknown"}`,
        body: "Multiple open threads matched this email. Review and merge in the inbox.",
        severity: "warning",
      });
    } else {
      threadId = match.threadId;
      propertyId = match.propertyId;
      await audit("thread_matched", threadId, {
        kind: match.kind,
        via: match.kind === "matched" ? match.via : "created",
        property_id: propertyId,
      });
    }

    // ── Store inbound message + bump thread ──────────────────────────────
    const sentAt = new Date().toISOString();
    await db.from("messages").insert({
      thread_id: threadId,
      direction: "inbound",
      sender: parsed.guestFirstName ?? "Guest",
      body: parsed.body,
      sent_at: sentAt,
      raw: { via: "mailgun_intake", subject: parsed.subject },
    });
    await db
      .from("message_threads")
      .update({
        last_message_at: sentAt,
        last_message_preview: parsed.body.slice(0, 200),
      })
      .eq("id", threadId);

    // ── Build drafting context ────────────────────────────────────────────
    const { data: brain } = await db
      .from("tone_brain")
      .select("body_md")
      .eq("id", 1)
      .maybeSingle();
    if (!brain?.body_md) {
      await audit("escalated", threadId, { reason: "tone_brain_missing" });
      return NextResponse.json({ ok: true, thread_id: threadId, draft: false });
    }

    let propertyName: string | null = null;
    let autoSendEnabled = false;
    let profileContext: string | null = null;
    if (propertyId) {
      const [{ data: prop }, { data: profile }] = await Promise.all([
        db
          .from("properties")
          .select("name, auto_send_messages")
          .eq("id", propertyId)
          .maybeSingle(),
        db
          .from("property_profiles")
          .select("access_info, house_rules_md, quirks_md, host_preferences_md")
          .eq("property_id", propertyId)
          .maybeSingle(),
      ]);
      propertyName = prop?.name ?? null;
      autoSendEnabled = Boolean(prop?.auto_send_messages);
      profileContext = formatProfile(profile);
    }

    const policyDocs = await retrievePolicyDocs(db, parsed.body);

    const { data: threadRow } = await db
      .from("message_threads")
      .select("guest_first_name, check_in, check_out, city")
      .eq("id", threadId)
      .maybeSingle();
    const { data: history } = await db
      .from("messages")
      .select("direction, sender, body, sent_at")
      .eq("thread_id", threadId)
      .order("sent_at", { ascending: true })
      .limit(30);

    const ctx: ThreadContext = {
      guest_first_name: threadRow?.guest_first_name ?? parsed.guestFirstName ?? "there",
      property_name: propertyName,
      check_in: threadRow?.check_in ?? null,
      check_out: threadRow?.check_out ?? null,
      city: threadRow?.city ?? null,
      property_profile: profileContext,
      policy_context: formatPolicyContext(policyDocs),
      history: history ?? [],
    };

    const { draft, cost_usd, usage } = await draftReply(ctx, brain.body_md);
    await audit("draft_created", threadId, {
      category: draft.category,
      confidence: draft.confidence,
      cost_usd,
    });

    // ── Auto-send gates ───────────────────────────────────────────────────
    const { data: killRow } = await db
      .from("app_settings")
      .select("value")
      .eq("key", "messaging_kill_switch")
      .maybeSingle();
    const killSwitchOn = Boolean(killRow?.value?.enabled);

    const eligible =
      !killSwitchOn &&
      !ambiguous &&
      autoSendEnabled &&
      draft.confidence === "high" &&
      ROUTINE_CATEGORIES.has(draft.category) &&
      Boolean(parsed.replyTo);

    if (eligible) {
      try {
        await sendMailgunEmail({
          to: parsed.replyTo!,
          subject: parsed.subject.startsWith("Re:") ? parsed.subject : `Re: ${parsed.subject}`,
          text: draft.draft_body,
          inReplyTo: parsed.messageId ?? undefined,
        });
        await db.from("messages").insert({
          thread_id: threadId,
          direction: "outbound",
          sender: "Donovan",
          body: draft.draft_body,
          sent_at: new Date().toISOString(),
          sent_via: "auto",
          confidence: draft.confidence === "high" ? 1 : 0.5,
          raw: { category: draft.category, reasoning: draft.reasoning },
        });
        await db.from("message_drafts").insert({
          thread_id: threadId,
          draft_body: draft.draft_body,
          reasoning: draft.reasoning,
          status: "sent",
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
          cost_usd,
        });
        await audit("auto_sent", threadId, { category: draft.category });
        return NextResponse.json({ ok: true, thread_id: threadId, auto_sent: true });
      } catch (err) {
        await audit("send_failed", threadId, { error: String(err) });
        // fall through to pending-draft escalation
      }
    } else if (killSwitchOn) {
      await audit("killswitch_blocked", threadId, { category: draft.category });
    }

    // ── Escalate: pending draft + notification ────────────────────────────
    const { data: draftRow } = await db
      .from("message_drafts")
      .insert({
        thread_id: threadId,
        draft_body: draft.draft_body,
        reasoning: draft.reasoning,
        status: "pending",
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cost_usd,
      })
      .select("id")
      .single();
    await db.from("notification_events").insert({
      type: "draft_needs_review",
      property_id: propertyId,
      ref_id: draftRow?.id ?? null,
      title: `Draft needs review: ${ctx.guest_first_name}${propertyName ? ` · ${propertyName}` : ""}`,
      body: draft.draft_body.slice(0, 180),
      severity: draft.confidence === "low" ? "warning" : "info",
    });
    await audit("escalated", threadId, {
      category: draft.category,
      confidence: draft.confidence,
      reason: killSwitchOn
        ? "kill_switch"
        : ambiguous
          ? "ambiguous_match"
          : !autoSendEnabled
            ? "auto_send_disabled"
            : "gates_not_met",
    });

    return NextResponse.json({ ok: true, thread_id: threadId, auto_sent: false });
  } catch (err) {
    await audit("send_failed", null, { fatal: true, error: String(err) });
    // 200 so Mailgun doesn't hammer retries — the audit row carries the raw
    // email, so nothing is lost and the run can be replayed.
    return NextResponse.json({ ok: false, error: "pipeline_error" });
  }
}

function formatProfile(profile: {
  access_info?: Record<string, string> | null;
  house_rules_md?: string | null;
  quirks_md?: string | null;
  host_preferences_md?: string | null;
} | null): string | null {
  if (!profile) return null;
  const parts: string[] = [];
  const info = profile.access_info ?? {};
  const entries = Object.entries(info).filter(([, v]) => v);
  if (entries.length) {
    parts.push(
      "## Access & facts\n" + entries.map(([k, v]) => `- ${k.replace(/_/g, " ")}: ${v}`).join("\n"),
    );
  }
  if (profile.house_rules_md) parts.push(`## House rules\n${profile.house_rules_md}`);
  if (profile.quirks_md) parts.push(`## Quirks\n${profile.quirks_md}`);
  if (profile.host_preferences_md) parts.push(`## Host preferences\n${profile.host_preferences_md}`);
  return parts.length ? parts.join("\n\n") : null;
}
