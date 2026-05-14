import { notFound } from "next/navigation";
import { format } from "date-fns";

import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";

import { DraftPanel } from "./_components/draft-panel";
import { PasteFollowUp } from "./_components/paste-follow-up";

export const dynamic = "force-dynamic";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: thread } = await supabase
    .from("message_threads")
    .select("*, properties(name, status)")
    .eq("id", id)
    .maybeSingle();

  if (!thread) notFound();

  const t = thread as unknown as {
    id: string;
    guest_name: string | null;
    guest_first_name: string | null;
    check_in: string | null;
    check_out: string | null;
    properties: { name: string; status: string } | { name: string; status: string }[] | null;
  };

  const { data: messages } = await supabase
    .from("messages")
    .select("id, direction, sender, body, sent_at")
    .eq("thread_id", id)
    .order("sent_at", { ascending: true });

  const { data: drafts } = await supabase
    .from("message_drafts")
    .select("*")
    .eq("thread_id", id)
    .order("created_at", { ascending: false });

  const property = Array.isArray(t.properties)
    ? t.properties[0]
    : t.properties;

  const pendingDraft = drafts?.find((d) => d.status === "pending");
  const recentDrafts = (drafts ?? []).slice(0, 5);

  return (
    <div>
      <PageHeader
        title={t.guest_name || t.guest_first_name || "Thread"}
        description={
          property?.name
            ? `${property.name}${
                t.check_in && t.check_out
                  ? ` · ${t.check_in} → ${t.check_out}`
                  : ""
              }`
            : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr,400px]">
        {/* Conversation */}
        <section className="rounded-lg border border-navy-700/40 bg-navy-900/60 backdrop-blur-sm p-6">
          <h2 className="gold-underline mb-5 text-sm font-semibold uppercase tracking-[0.16em] text-cream-100">
            Conversation
          </h2>
          {!messages || messages.length === 0 ? (
            <p className="text-sm text-cream-200/60">No messages yet.</p>
          ) : (
            <ol className="space-y-4">
              {messages.map((m) => (
                <li
                  key={m.id}
                  className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-3 ${
                      m.direction === "outbound"
                        ? "bg-navy-700 text-cream-50"
                        : "bg-navy-800/50 text-cream-50"
                    }`}
                  >
                    <div className="text-[10px] uppercase tracking-wider opacity-70">
                      {m.sender || (m.direction === "outbound" ? "You" : "Guest")}
                      {" · "}
                      {format(new Date(m.sent_at), "MMM d, h:mma")}
                    </div>
                    <div className="mt-1 whitespace-pre-line text-sm">
                      {m.body}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <div className="mt-6 border-t border-navy-700/40 pt-6">
            <PasteFollowUp threadId={id} />
          </div>
        </section>

        {/* Draft sidebar */}
        <aside className="space-y-4">
          <DraftPanel
            threadId={id}
            pendingDraft={pendingDraft ?? null}
            recentDrafts={recentDrafts}
          />
        </aside>
      </div>
    </div>
  );
}
