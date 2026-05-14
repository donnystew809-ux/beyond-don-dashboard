import { format, addDays, differenceInDays, eachDayOfInterval } from "date-fns";

import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

type Alert = {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  action?: { label: string; href: string };
};

export default async function AlertsPage() {
  const supabase = await createClient();
  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");
  const in30Str = format(addDays(now, 30), "yyyy-MM-dd");

  const [
    { data: properties },
    { data: reservations },
    { data: syncLogs },
    { data: pendingDrafts },
    { data: cleaningIssues },
  ] = await Promise.all([
    supabase.from("properties").select("id, name, status, ical_url, pricelabs_listing_id").order("name"),
    supabase
      .from("reservations")
      .select("property_id, check_in, check_out")
      .gte("check_out", todayStr)
      .lte("check_in", in30Str)
      .order("check_in"),
    supabase
      .from("sync_log")
      .select("source, status, started_at, error")
      .order("started_at", { ascending: false })
      .limit(20),
    supabase.from("message_drafts").select("id, thread_id").eq("status", "pending"),
    supabase
      .from("cleanings")
      .select("id, property_id, scheduled_for, status")
      .eq("status", "issue"),
  ]);

  const activeProperties = (properties ?? []).filter((p) => p.status === "active");
  const allReservations = reservations ?? [];
  const alerts: Alert[] = [];

  // ── 1. Vacancy gaps (1-3 night orphan gaps between bookings) ─────────────────
  for (const prop of activeProperties) {
    const propRes = allReservations
      .filter((r) => r.property_id === prop.id)
      .sort((a, b) => new Date(a.check_in).getTime() - new Date(b.check_in).getTime());

    for (let i = 0; i < propRes.length - 1; i++) {
      const gapStart = new Date(propRes[i].check_out);
      const gapEnd = new Date(propRes[i + 1].check_in);
      const gapNights = differenceInDays(gapEnd, gapStart);
      if (gapNights >= 1 && gapNights <= 3) {
        alerts.push({
          id: `gap-${prop.id}-${i}`,
          severity: "warning",
          title: `${gapNights}-night gap at ${prop.name}`,
          detail: `${format(gapStart, "MMM d")} – ${format(gapEnd, "MMM d")} is unbooked between two reservations. Consider a last-minute discount.`,
          action: { label: "Review pricing", href: "/pricing" },
        });
      }
    }
  }

  // ── 2. Properties with no bookings in next 14 days ────────────────────────────
  const in14Str = format(addDays(now, 14), "yyyy-MM-dd");
  for (const prop of activeProperties) {
    const hasBooking = allReservations.some(
      (r) =>
        r.property_id === prop.id &&
        r.check_in <= in14Str &&
        r.check_out >= todayStr
    );
    if (!hasBooking) {
      alerts.push({
        id: `no-booking-${prop.id}`,
        severity: "warning",
        title: `No bookings in next 14 days — ${prop.name}`,
        detail: "This property has no reservations in the next two weeks. Review pricing or promote the listing.",
        action: { label: "Review pricing", href: "/pricing" },
      });
    }
  }

  // ── 3. Sync failures ────────────────────────────────────────────────────────
  const recentLogs = syncLogs ?? [];
  const sourceLatest = new Map<string, typeof recentLogs[0]>();
  for (const log of recentLogs) {
    if (!sourceLatest.has(log.source)) sourceLatest.set(log.source, log);
  }
  for (const [source, log] of sourceLatest.entries()) {
    if (log.status === "error") {
      alerts.push({
        id: `sync-error-${source}`,
        severity: "critical",
        title: `${source} sync is failing`,
        detail: log.error ?? "Unknown error during last sync run.",
        action: { label: "View sync log", href: "/settings" },
      });
    }
  }

  // ── 4. Properties missing iCal or PriceLabs ────────────────────────────────
  for (const prop of activeProperties) {
    if (!prop.ical_url) {
      alerts.push({
        id: `no-ical-${prop.id}`,
        severity: "critical",
        title: `No iCal URL — ${prop.name}`,
        detail: "This property has no Airbnb iCal feed configured. Reservations won't sync.",
        action: { label: "Fix in Settings", href: `/settings/properties/${prop.id}` },
      });
    }
    if (!prop.pricelabs_listing_id) {
      alerts.push({
        id: `no-pl-${prop.id}`,
        severity: "info",
        title: `PriceLabs not connected — ${prop.name}`,
        detail: "Link a PriceLabs listing ID to enable smart pricing suggestions.",
        action: { label: "Fix in Settings", href: `/settings/properties/${prop.id}` },
      });
    }
  }

  // ── 5. Cleaning issues ─────────────────────────────────────────────────────
  const propMap = new Map((properties ?? []).map((p) => [p.id, p.name]));
  for (const c of cleaningIssues ?? []) {
    alerts.push({
      id: `cleaning-issue-${c.id}`,
      severity: "critical",
      title: `Cleaning issue — ${propMap.get(c.property_id) ?? "Unknown"}`,
      detail: `A cleaning scheduled for ${format(new Date(c.scheduled_for), "MMM d")} is flagged as an issue.`,
      action: { label: "View cleaning", href: "/cleaning" },
    });
  }

  // ── 6. Pending AI drafts ────────────────────────────────────────────────────
  const draftsCount = pendingDrafts?.length ?? 0;
  if (draftsCount > 0) {
    alerts.push({
      id: "pending-drafts",
      severity: "info",
      title: `${draftsCount} guest message draft${draftsCount > 1 ? "s" : ""} awaiting review`,
      detail: "AI has composed replies in Donovan's voice. Review and paste into Airbnb.",
      action: { label: "Review messages", href: "/messages" },
    });
  }

  // ── Sort: critical → warning → info ───────────────────────────────────────
  const order = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => order[a.severity] - order[b.severity]);

  return (
    <div>
      <PageHeader
        title="Alerts"
        description="Live intelligence — issues that need your attention."
      />

      {alerts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-emerald-500/40 bg-emerald-500/10 p-12 text-center">
          <div className="text-4xl">✅</div>
          <div className="mt-3 text-sm font-semibold text-emerald-300">All clear!</div>
          <div className="mt-1 text-xs text-emerald-400">No alerts at this time. Check back later.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Summary bar */}
          <div className="flex flex-wrap gap-3 rounded-lg border border-navy-700/40 bg-navy-900/60 backdrop-blur-sm px-4 py-3 text-xs">
            {(["critical", "warning", "info"] as const).map((sev) => {
              const n = alerts.filter((a) => a.severity === sev).length;
              if (!n) return null;
              const colors = {
                critical: "text-red-300 bg-red-500/15",
                warning: "text-amber-300 bg-amber-500/15",
                info: "text-cream-100 bg-navy-700/50",
              }[sev];
              return (
                <span key={sev} className={`rounded-full px-2.5 py-1 font-semibold ${colors}`}>
                  {n} {sev}
                </span>
              );
            })}
          </div>

          {alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </div>
      )}
    </div>
  );
}

function AlertCard({ alert }: { alert: Alert }) {
  const config = {
    critical: {
      border: "border-red-500/30",
      bg: "bg-red-500/10",
      icon: "🚨",
      titleColor: "text-red-300",
      badgeBg: "bg-red-500/15 text-red-300",
      badgeLabel: "Critical",
    },
    warning: {
      border: "border-amber-500/30",
      bg: "bg-amber-500/10",
      icon: "⚠️",
      titleColor: "text-amber-300",
      badgeBg: "bg-amber-500/15 text-amber-300",
      badgeLabel: "Warning",
    },
    info: {
      border: "border-navy-400/50",
      bg: "bg-navy-700/40",
      icon: "ℹ️",
      titleColor: "text-cream-50",
      badgeBg: "bg-navy-700/50 text-cream-100",
      badgeLabel: "Info",
    },
  }[alert.severity];

  return (
    <div className={`rounded-lg border p-4 ${config.border} ${config.bg}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="text-lg leading-none">{config.icon}</span>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-semibold ${config.titleColor}`}>{alert.title}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${config.badgeBg}`}>
                {config.badgeLabel}
              </span>
            </div>
            <p className="mt-1 text-xs text-cream-200/80">{alert.detail}</p>
          </div>
        </div>
        {alert.action && (
          <a
            href={alert.action.href}
            className="shrink-0 rounded-md border border-navy-400/50 bg-navy-900/60 backdrop-blur-sm px-3 py-1.5 text-xs font-medium text-cream-100 hover:bg-navy-700/40 transition whitespace-nowrap"
          >
            {alert.action.label} →
          </a>
        )}
      </div>
    </div>
  );
}
