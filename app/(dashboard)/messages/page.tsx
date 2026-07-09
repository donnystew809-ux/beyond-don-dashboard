import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";

import { AutomationPanel } from "./_components/automation-panel";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const supabase = await createClient();
  const db = supabase as any; // app_settings / auto_send_messages predate generated types

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: threads },
    { data: pendingDrafts },
    { data: roleRow },
    { data: killRow },
    { data: props },
  ] = await Promise.all([
    supabase
      .from("message_threads")
      .select(
        "id, guest_name, guest_first_name, last_message_at, last_message_preview, status, check_in, check_out, properties(name)",
      )
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(100),
    supabase
      .from("message_drafts")
      .select("id, thread_id, status")
      .eq("status", "pending"),
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user?.id ?? "")
      .maybeSingle(),
    db.from("app_settings").select("value").eq("key", "messaging_kill_switch").maybeSingle(),
    db.from("properties").select("id, auto_send_messages").eq("status", "active"),
  ]);

  const isAdmin = roleRow?.role === "admin";
  const killSwitchOn = Boolean((killRow as any)?.value?.enabled);
  const activeProps = (props ?? []) as Array<{ auto_send_messages: boolean | null }>;
  const autoSendCount = activeProps.filter((p) => p.auto_send_messages).length;

  type ThreadRow = {
    id: string;
    guest_name: string | null;
    guest_first_name: string | null;
    last_message_at: string | null;
    last_message_preview: string | null;
    status: string;
    check_in: string | null;
    check_out: string | null;
    properties: { name: string } | { name: string }[] | null;
  };
  const ts = (threads ?? []) as unknown as ThreadRow[];
  const pds = (pendingDrafts ?? []) as unknown as Array<{ thread_id: string }>;

  const pendingByThread = new Map<string, number>();
  for (const d of pds) {
    pendingByThread.set(d.thread_id, (pendingByThread.get(d.thread_id) ?? 0) + 1);
  }

  return (
    <div>
      <PageHeader
        title="Messages"
        description="Guest message threads. AI drafts a reply in Donovan's voice, you review and paste into Airbnb."
      />

      {/* Automation status + kill-switch */}
      <div className="mb-4">
        <AutomationPanel
          isAdmin={isAdmin}
          killSwitchOn={killSwitchOn}
          autoSendCount={autoSendCount}
          propertyCount={activeProps.length}
        />
      </div>

      {/* Header row — stacks on mobile */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex-1 rounded-lg border border-gold-500/50 bg-gold-500/15 p-4 text-sm text-cream-50">
          <strong className="text-gold-300">How this works:</strong> Incoming
          Airbnb messages flow in automatically. Claude drafts in
          Donovan&apos;s voice — routine replies can auto-send on opted-in
          properties; everything else waits here for review.
        </div>
        <Link
          href="/messages/new"
          className="inline-flex items-center justify-center rounded-md bg-gold-gradient px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-navy-950 hover:brightness-110 sm:shrink-0"
        >
          + Paste new message
        </Link>
      </div>

      {ts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-navy-700/50 bg-navy-900/60 backdrop-blur-sm p-10 text-center text-sm text-cream-200/60">
          No threads yet. Click <em>Paste new message</em> above to start one.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-navy-700/40 bg-navy-900/60 backdrop-blur-sm">
          <table className="w-full text-sm">
            <thead className="bg-navy-800/40 text-left text-xs uppercase tracking-wide text-cream-200/60">
              <tr>
                <th className="px-4 py-3">Guest</th>
                <th className="hidden px-4 py-3 sm:table-cell">Property</th>
                <th className="px-4 py-3">Last message</th>
                <th className="hidden px-4 py-3 md:table-cell">When</th>
                <th className="px-4 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-700/40">
              {ts.map((t) => {
                const pending = pendingByThread.get(t.id) ?? 0;
                const property = Array.isArray(t.properties)
                  ? t.properties[0]
                  : t.properties;
                return (
                  <tr key={t.id} className="hover:bg-navy-800/40">
                    <td className="px-4 py-3">
                      <Link
                        href={`/messages/${t.id}`}
                        className="font-medium text-cream-50 hover:underline"
                      >
                        {t.guest_name || t.guest_first_name || "Unknown"}
                      </Link>
                      {/* Property + time inline on mobile */}
                      <div className="mt-0.5 text-[10px] text-cream-200/50 sm:hidden">
                        {property?.name ?? "—"}
                        {t.last_message_at && (
                          <>
                            {" · "}
                            {formatDistanceToNow(new Date(t.last_message_at), {
                              addSuffix: true,
                            })}
                          </>
                        )}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-cream-200/80 sm:table-cell">
                      {property?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-cream-200/80">
                      <span className="line-clamp-1 max-w-[160px] sm:max-w-xs md:max-w-md">
                        {t.last_message_preview ?? ""}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-cream-200/60 md:table-cell">
                      {t.last_message_at
                        ? formatDistanceToNow(new Date(t.last_message_at), {
                            addSuffix: true,
                          })
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {pending > 0 ? (
                        <span className="whitespace-nowrap rounded-full bg-gold-500/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-gold-300">
                          {pending} draft{pending > 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="text-xs text-cream-200/50">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
