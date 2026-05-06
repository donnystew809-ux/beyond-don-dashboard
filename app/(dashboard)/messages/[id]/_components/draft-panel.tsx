"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { format } from "date-fns";

type Draft = {
  id: string;
  draft_body: string;
  edited_body: string | null;
  reasoning: string | null;
  status: string;
  created_at: string;
  cost_usd: number | null;
};

export function DraftPanel({
  threadId,
  pendingDraft,
  recentDrafts,
}: {
  threadId: string;
  pendingDraft: Draft | null;
  recentDrafts: Draft[];
}) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/messages/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: threadId }),
      });
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <div className="rounded-lg border border-cream-200 bg-white p-5">
        <h2 className="gold-underline mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-navy-700">
          AI Draft
        </h2>

        {pendingDraft ? (
          <DraftActions threadId={threadId} draft={pendingDraft} />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-navy-600">
              No pending draft. Generate one based on the latest guest message.
            </p>
            <button
              onClick={generate}
              disabled={generating}
              className="w-full rounded-md bg-gold-gradient px-3 py-2 text-xs font-semibold uppercase tracking-wider text-navy-950 hover:brightness-110 disabled:opacity-50"
            >
              {generating ? "Drafting…" : "Generate draft"}
            </button>
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        )}
      </div>

      {recentDrafts.length > 0 && (
        <div className="rounded-lg border border-cream-200 bg-white p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-navy-500">
            History ({recentDrafts.length})
          </h3>
          <ul className="space-y-3 text-xs">
            {recentDrafts.map((d) => (
              <li
                key={d.id}
                className="border-l-2 border-cream-300 pl-3 text-navy-600"
              >
                <div className="flex items-center gap-2">
                  <StatusBadge status={d.status} />
                  <span className="text-navy-400">
                    {format(new Date(d.created_at), "MMM d, h:mma")}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-navy-700">
                  {d.edited_body || d.draft_body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function DraftActions({ threadId: _threadId, draft }: { threadId: string; draft: Draft }) {
  const router = useRouter();
  const [body, setBody] = useState(draft.edited_body || draft.draft_body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isEdited = body !== draft.draft_body;

  async function action(act: "approve" | "edit" | "reject" | "mark_sent") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/messages/draft/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft_id: draft.id,
          action: act,
          edited_body: act === "edit" ? body : undefined,
        }),
      });
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-3">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        className="w-full rounded-md border border-cream-300 bg-cream-50 p-3 text-sm text-navy-900 focus:border-gold-500 focus:outline-none"
      />
      {draft.reasoning && (
        <p className="text-xs italic text-navy-500">
          Reasoning: {draft.reasoning}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={copy}
          className="rounded-md border border-navy-700 bg-navy-700 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-cream-50 hover:bg-navy-800"
        >
          {copied ? "Copied!" : "Copy to paste"}
        </button>
        <button
          onClick={() => action(isEdited ? "edit" : "approve")}
          disabled={busy}
          className="rounded-md bg-gold-gradient px-3 py-2 text-xs font-semibold uppercase tracking-wider text-navy-950 hover:brightness-110 disabled:opacity-50"
        >
          {isEdited ? "Save edit" : "Approve"}
        </button>
        <button
          onClick={() => action("mark_sent")}
          disabled={busy}
          className="rounded-md border border-cream-300 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-navy-700 hover:bg-cream-100 disabled:opacity-50"
        >
          Mark sent
        </button>
        <button
          onClick={() => action("reject")}
          disabled={busy}
          className="rounded-md border border-red-300 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
      {draft.cost_usd != null && (
        <p className="text-[10px] text-navy-400">
          Cost: ${Number(draft.cost_usd).toFixed(4)}
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "pending"
      ? "bg-gold-100 text-gold-800"
      : status === "approved" || status === "sent"
        ? "bg-green-100 text-green-800"
        : status === "edited"
          ? "bg-navy-100 text-navy-800"
          : status === "rejected"
            ? "bg-red-100 text-red-800"
            : "bg-cream-200 text-navy-600";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${cls}`}
    >
      {status}
    </span>
  );
}
