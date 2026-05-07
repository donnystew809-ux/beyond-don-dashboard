import { format, addDays, differenceInDays } from "date-fns";

import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { InitiateButton, type SuggestionAction } from "./_components/initiate-button";

export const dynamic = "force-dynamic";

// ─── Suggestion shape ──────────────────────────────────────────────────────────
type Suggestion = {
  id: string;
  category: "pricing" | "automation" | "syncing" | "messaging" | "gaps" | "integration";
  priority: "high" | "medium" | "low";
  property?: string;
  title: string;
  detail: string;
  impact?: string;
  action: SuggestionAction;
};

const CATEGORY_META = {
  pricing:     { emoji: "💰", label: "Pricing",     bg: "bg-gold-50",    border: "border-gold-200",    badge: "bg-gold-100 text-gold-800" },
  automation:  { emoji: "🤖", label: "Automation",  bg: "bg-navy-50",    border: "border-navy-200",    badge: "bg-navy-100 text-navy-700" },
  syncing:     { emoji: "🔄", label: "Sync",        bg: "bg-blue-50",    border: "border-blue-200",    badge: "bg-blue-100 text-blue-700" },
  messaging:   { emoji: "💬", label: "Messaging",   bg: "bg-purple-50",  border: "border-purple-200",  badge: "bg-purple-100 text-purple-700" },
  gaps:        { emoji: "📅", label: "Gap Fill",    bg: "bg-amber-50",   border: "border-amber-200",   badge: "bg-amber-100 text-amber-800" },
  integration: { emoji: "🔗", label: "Integration", bg: "bg-red-50",     border: "border-red-200",     badge: "bg-red-100 text-red-700" },
};

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

export default async function SuggestionsPage() {
  const supabase = await createClient();
  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");
  const in30Str = format(addDays(now, 30), "yyyy-MM-dd");
  const in7Str = format(addDays(now, 7), "yyyy-MM-dd");
  const in14Str = format(addDays(now, 14), "yyyy-MM-dd");

  const [
    { data: properties },
    { data: reservations },
    { data: prices },
    { data: syncLogs },
    { data: pendingDrafts },
    { data: cleaningIssues },
  ] = await Promise.all([
    supabase
      .from("properties")
      .select(
        "id, name, status, ical_url, pricelabs_listing_id, turno_property_id, auto_accept_pricing"
      )
      .order("name"),
    supabase
      .from("reservations")
      .select("property_id, check_in, check_out")
      .gte("check_out", todayStr)
      .lte("check_in", in30Str),
    supabase
      .from("prices")
      .select("property_id, date, base_price, suggested_price, override_price")
      .gte("date", todayStr)
      .lte("date", in14Str)
      .order("date"),
    supabase
      .from("sync_log")
      .select("source, status, started_at, error")
      .order("started_at", { ascending: false })
      .limit(30),
    supabase.from("message_drafts").select("id, thread_id").eq("status", "pending"),
    supabase.from("cleanings").select("id, property_id, status, scheduled_for").eq("status", "issue"),
  ]);

  const active = (properties ?? []).filter((p) => p.status === "active");
  const suggestions: Suggestion[] = [];

  // ── 1. MESSAGING: Pending AI drafts ────────────────────────────────────────
  const draftsCount = pendingDrafts?.length ?? 0;
  if (draftsCount > 0) {
    suggestions.push({
      id: "pending-drafts",
      category: "messaging",
      priority: "high",
      title: `Review ${draftsCount} pending AI draft${draftsCount > 1 ? "s" : ""}`,
      detail: "Claude has composed guest replies in Donovan's voice. Review and paste into Airbnb — sends are always manual.",
      impact: `${draftsCount} guest${draftsCount > 1 ? "s" : ""} waiting for a response`,
      action: { type: "navigate", href: "/messages" },
    });
  }

  // ── 2. SYNCING: Failed sync sources ────────────────────────────────────────
  const sourceLatest = new Map<string, { status: string; started_at: string; error?: string }>();
  for (const log of syncLogs ?? []) {
    if (!sourceLatest.has(log.source)) sourceLatest.set(log.source, log);
  }
  for (const [source, log] of sourceLatest.entries()) {
    if (log.status === "error") {
      suggestions.push({
        id: `sync-error-${source}`,
        category: "syncing",
        priority: "high",
        title: `Re-run failed ${source} sync`,
        detail: log.error ?? "Last sync failed. Re-running will refresh reservations/prices/cleanings.",
        impact: "Stale data until fixed",
        action: { type: "run_sync", payload: { source } },
      });
    }
  }

  // ── 3. INTEGRATION: Missing iCal or PriceLabs ──────────────────────────────
  for (const prop of active) {
    if (!prop.ical_url) {
      suggestions.push({
        id: `missing-ical-${prop.id}`,
        category: "integration",
        priority: "high",
        property: prop.name,
        title: "Connect Airbnb iCal feed",
        detail: "No iCal URL configured — reservations for this property won't sync. Go to Airbnb → Listing → Availability → Calendar sync → Export calendar.",
        action: { type: "navigate", href: `/settings/properties/${prop.id}` },
      });
    }
    if (!prop.pricelabs_listing_id) {
      suggestions.push({
        id: `missing-pl-${prop.id}`,
        category: "integration",
        priority: "medium",
        property: prop.name,
        title: "Connect PriceLabs listing",
        detail: "No PriceLabs listing ID set — this property won't receive smart pricing suggestions.",
        action: { type: "navigate", href: `/settings/properties/${prop.id}` },
      });
    }
    if (!prop.turno_property_id) {
      suggestions.push({
        id: `missing-turno-${prop.id}`,
        category: "integration",
        priority: "low",
        property: prop.name,
        title: "Connect Turno property",
        detail: "No Turno property ID set — cleaning schedule won't sync for this property.",
        action: { type: "navigate", href: `/settings/properties/${prop.id}` },
      });
    }
  }

  // ── 4. AUTOMATION: Auto-pricing not enabled (but PL connected) ─────────────
  for (const prop of active) {
    if (prop.pricelabs_listing_id && !prop.auto_accept_pricing) {
      suggestions.push({
        id: `enable-auto-${prop.id}`,
        category: "automation",
        priority: "medium",
        property: prop.name,
        title: "Enable auto-pricing",
        detail: "PriceLabs is connected but auto-pricing is off. Enabling this will push PriceLabs suggested prices to Airbnb every morning automatically.",
        impact: "Hands-free price optimization daily",
        action: { type: "toggle_auto_pricing", payload: { property_id: prop.id } },
      });
    }
  }

  // ── 5. PRICING: Dates with suggested prices different from current ──────────
  const pricesByProp = new Map<string, typeof prices>();
  for (const p of prices ?? []) {
    const list = pricesByProp.get(p.property_id) ?? [];
    list.push(p);
    pricesByProp.set(p.property_id, list);
  }

  for (const prop of active) {
    if (!prop.pricelabs_listing_id) continue;
    const propPrices = pricesByProp.get(prop.id) ?? [];
    const datesWithDelta = propPrices.filter((p) => {
      const current = p.override_price ?? p.base_price;
      const suggested = p.suggested_price;
      if (!suggested || !current) return false;
      const deltaPct = Math.abs((Number(suggested) - Number(current)) / Number(current)) * 100;
      return deltaPct > 5; // More than 5% difference
    });

    if (datesWithDelta.length > 0) {
      const avgDelta =
        datesWithDelta.reduce((sum, p) => {
          const current = p.override_price ?? p.base_price ?? 0;
          const suggested = p.suggested_price ?? 0;
          return sum + (Number(suggested) - Number(current));
        }, 0) / datesWithDelta.length;
      const direction = avgDelta > 0 ? "↑ higher" : "↓ lower";
      suggestions.push({
        id: `apply-prices-${prop.id}`,
        category: "pricing",
        priority: "medium",
        property: prop.name,
        title: `Apply PriceLabs suggestions (${datesWithDelta.length} dates)`,
        detail: `PriceLabs suggests prices averaging $${Math.abs(Math.round(avgDelta))} ${direction} than current rates for ${datesWithDelta.length} date${datesWithDelta.length > 1 ? "s" : ""} in the next 14 days.`,
        impact: `Potential revenue adjustment across ${datesWithDelta.length} nights`,
        action: { type: "apply_prices", payload: { property_id: prop.id } },
      });
    }
  }

  // ── 6. GAPS: 1-3 night vacancy gaps → last-minute discount ────────────────
  for (const prop of active) {
    if (!prop.pricelabs_listing_id) continue;
    const propRes = (reservations ?? [])
      .filter((r) => r.property_id === prop.id)
      .sort((a, b) => new Date(a.check_in).getTime() - new Date(b.check_in).getTime());

    for (let i = 0; i < propRes.length - 1; i++) {
      const gapStart = new Date(propRes[i].check_out);
      const gapEnd = new Date(propRes[i + 1].check_in);
      const gapNights = differenceInDays(gapEnd, gapStart);
      if (gapNights >= 1 && gapNights <= 3 && gapStart >= now) {
        suggestions.push({
          id: `gap-discount-${prop.id}-${i}`,
          category: "gaps",
          priority: gapNights === 1 ? "high" : "medium",
          property: prop.name,
          title: `Fill ${gapNights}-night gap (${format(gapStart, "MMM d")}–${format(gapEnd, "MMM d")}) with last-minute discount`,
          detail: `${gapNights} unbooked night${gapNights > 1 ? "s" : ""} between two reservations. A 20% discount pushed to PriceLabs increases fill probability significantly.`,
          impact: `${gapNights} night${gapNights > 1 ? "s" : ""} of potential revenue instead of $0`,
          action: {
            type: "apply_last_minute_discount",
            payload: { property_id: prop.id, discount_pct: 20, days: differenceInDays(gapEnd, now) + 1 },
          },
        });
        break; // one gap suggestion per property
      }
    }

    // No bookings next 7 days → deeper last-minute discount
    const hasBookingNext7 = (reservations ?? []).some(
      (r) =>
        r.property_id === prop.id &&
        r.check_in <= in7Str &&
        r.check_out >= todayStr
    );
    if (!hasBookingNext7) {
      const alreadySuggested = suggestions.some(
        (s) => s.id.startsWith(`gap-discount-${prop.id}`)
      );
      if (!alreadySuggested) {
        suggestions.push({
          id: `last-minute-${prop.id}`,
          category: "pricing",
          priority: "high",
          property: prop.name,
          title: "Apply 20% last-minute discount (no bookings next 7 days)",
          detail: "This property has no upcoming reservations in the next 7 days. A last-minute price cut increases visibility and booking probability.",
          impact: "Turn 0 nights revenue into something",
          action: {
            type: "apply_last_minute_discount",
            payload: { property_id: prop.id, discount_pct: 20, days: 7 },
          },
        });
      }
    }
  }

  // ── 7. SYNCING: Sources not synced in 4+ hours ────────────────────────────
  const staleSources = ["airbnb-ical", "pricelabs", "turno"];
  for (const source of staleSources) {
    const latest = sourceLatest.get(source);
    if (!latest) {
      suggestions.push({
        id: `no-sync-${source}`,
        category: "syncing",
        priority: "medium",
        title: `${source} has never synced`,
        detail: "This data source has no sync history. Run it now to pull the latest data.",
        action: { type: "run_sync", payload: { source } },
      });
    } else if (latest.status === "ok") {
      const hoursAgo =
        (now.getTime() - new Date(latest.started_at).getTime()) / 1000 / 60 / 60;
      if (hoursAgo > 6) {
        suggestions.push({
          id: `stale-sync-${source}`,
          category: "syncing",
          priority: "low",
          title: `Refresh ${source} data (${Math.round(hoursAgo)}h old)`,
          detail: `Last sync was ${Math.round(hoursAgo)} hours ago. Re-syncing brings in the latest bookings, prices, or cleaning jobs.`,
          action: { type: "run_sync", payload: { source } },
        });
      }
    }
  }

  // ── 8. CLEANING: Issues flagged ───────────────────────────────────────────
  const propMap = new Map((properties ?? []).map((p) => [p.id, p.name]));
  for (const c of cleaningIssues ?? []) {
    suggestions.push({
      id: `cleaning-issue-${c.id}`,
      category: "messaging",
      priority: "high",
      property: propMap.get(c.property_id) ?? "Unknown",
      title: "Resolve flagged cleaning issue",
      detail: `A cleaning scheduled for ${format(new Date(c.scheduled_for), "MMM d")} is flagged as having an issue. Review in the Cleaning tab.`,
      action: { type: "navigate", href: "/cleaning" },
    });
  }

  // ── Sort: priority order, then category ───────────────────────────────────
  suggestions.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  // ── Group by category for display ─────────────────────────────────────────
  const grouped = new Map<string, Suggestion[]>();
  for (const s of suggestions) {
    const list = grouped.get(s.category) ?? [];
    list.push(s);
    grouped.set(s.category, list);
  }

  const totalHigh = suggestions.filter((s) => s.priority === "high").length;

  return (
    <div>
      <PageHeader
        title="Suggestions"
        description="Full portfolio sweep — every actionable recommendation, one click to deploy."
      />

      {/* Summary bar */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-cream-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-navy-500">Total suggestions</div>
          <div className="mt-1 text-2xl font-bold text-navy-900">{suggestions.length}</div>
        </div>
        <div className={`rounded-lg border p-4 ${totalHigh > 0 ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
          <div className={`text-xs uppercase tracking-wide ${totalHigh > 0 ? "text-red-600" : "text-emerald-600"}`}>High priority</div>
          <div className={`mt-1 text-2xl font-bold ${totalHigh > 0 ? "text-red-700" : "text-emerald-700"}`}>{totalHigh}</div>
        </div>
        <div className="rounded-lg border border-cream-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-navy-500">Properties swept</div>
          <div className="mt-1 text-2xl font-bold text-navy-900">{active.length}</div>
        </div>
      </div>

      {suggestions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-emerald-300 bg-emerald-50 p-14 text-center">
          <div className="text-4xl">🏆</div>
          <div className="mt-3 text-sm font-semibold text-emerald-800">Portfolio is fully optimized!</div>
          <div className="mt-1 text-xs text-emerald-600">No suggestions at this time. Check back later.</div>
        </div>
      ) : (
        <div className="space-y-8">
          {(["messaging", "pricing", "gaps", "automation", "syncing", "integration"] as const).map((cat) => {
            const items = grouped.get(cat);
            if (!items || items.length === 0) return null;
            const meta = CATEGORY_META[cat];
            return (
              <section key={cat}>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-lg">{meta.emoji}</span>
                  <h2 className="text-sm font-semibold text-navy-800">{meta.label}</h2>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.badge}`}>
                    {items.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {items.map((s) => (
                    <SuggestionCard key={s.id} suggestion={s} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Suggestion card (server-rendered shell, client Initiate button) ─────────
function SuggestionCard({ suggestion: s }: { suggestion: Suggestion }) {
  const meta = CATEGORY_META[s.category];
  const priorityBadge =
    s.priority === "high"
      ? "bg-red-100 text-red-700"
      : s.priority === "medium"
      ? "bg-amber-100 text-amber-700"
      : "bg-cream-100 text-navy-500";

  return (
    <div className={`rounded-lg border p-4 ${meta.border} ${meta.bg}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            {s.property && (
              <span className="text-xs font-semibold text-navy-600 bg-white rounded px-2 py-0.5 border border-cream-200">
                {s.property}
              </span>
            )}
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${priorityBadge}`}>
              {s.priority}
            </span>
          </div>
          <div className="text-sm font-semibold text-navy-900">{s.title}</div>
          <p className="mt-1 text-xs text-navy-600 leading-relaxed">{s.detail}</p>
          {s.impact && (
            <p className="mt-1.5 text-[11px] font-medium text-navy-500">
              💡 {s.impact}
            </p>
          )}
        </div>
        <div className="shrink-0">
          <InitiateButton action={s.action} />
        </div>
      </div>
    </div>
  );
}
