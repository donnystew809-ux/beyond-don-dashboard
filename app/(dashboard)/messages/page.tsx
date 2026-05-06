import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const supabase = await createClient();

  const [{ data: threads }, { data: pendingDrafts }] = await Promise.all([
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
  ]);

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

      {/* Header row — stacks on mobile */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex-1 rounded-lg border border-gold-300 bg-gold-50 p-4 text-sm text-navy-800">
          <strong className="text-gold-800">How this works:</strong> Paste a
          guest message, Claude drafts a reply in Donovan&apos;s voice. Review,
          edit, then copy into Airbnb. Sends are always manual.
        </div>
        <Link
          href="/messages/new"
          className="inline-flex items-center justify-center rounded-md bg-gold-gradient px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-navy-950 hover:brightness-110 sm:shrink-0"
        >
          + Paste new message
        </Link>
      </div>

      {ts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-cream-300 bg-white p-10 text-center text-sm text-navy-500">
          No threads yet. Click <em>Paste new message</em> above to start one.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-cream-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-cream-50 text-left text-xs uppercase tracking-wide text-navy-500">
              <tr>
                <th className="px-4 py-3">Guest</th>
                <th className="hidden px-4 py-3 sm:table-cell">Property</th>
                <th className="px-4 py-3">Last message</th>
                <th className="hidden px-4 py-3 md:table-cell">When</th>
                <th className="px-4 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-200">
              {ts.map((t) => {
                const pending = pendingByThread.get(t.id) ?? 0;
                const property = Array.isArray(t.properties)
                  ? t.properties[0]
                  : t.properties;
                return (
                  <tr key={t.id} className="hover:bg-cream-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/messages/${t.id}`}
                        className="font-medium text-navy-900 hover:underline"
                      >
                        {t.guest_name || t.guest_first_name || "Unknown"}
                      </Link>
                      {/* Property + time inline on mobile */}
                      <div className="mt-0.5 text-[10px] text-navy-400 sm:hidden">
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
                    <td className="hidden px-4 py-3 text-navy-600 sm:table-cell">
                      {property?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-navy-600">
                      <span className="line-clamp-1 max-w-[160px] sm:max-w-xs md:max-w-md">
                        {t.last_message_preview ?? ""}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-navy-500 md:table-cell">
                      {t.last_message_at
                        ? formatDistanceToNow(new Date(t.last_message_at), {
                            addSuffix: true,
                          })
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {pending > 0 ? (
                        <span className="whitespace-nowrap rounded-full bg-gold-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-gold-800">
                          {pending} draft{pending > 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="text-xs text-navy-400">—</span>
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
