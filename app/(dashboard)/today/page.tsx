import { format, isToday, isTomorrow, addDays, differenceInDays } from "date-fns";

import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

function greet() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function relativeDay(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  const n = differenceInDays(d, new Date());
  return `In ${n} days`;
}

export default async function TodayPage() {
  const supabase = await createClient();
  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");
  const tomorrowStr = format(addDays(now, 1), "yyyy-MM-dd");
  const in3dStr = format(addDays(now, 3), "yyyy-MM-dd");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const meta = (user?.user_metadata ?? {}) as Record<string, string | undefined>;
  const displayName =
    meta.name ||
    meta.full_name ||
    user?.email?.split("@")[0] ||
    "there";

  const [
    { data: properties },
    { data: checkoutsToday },
    { data: checkinsToday },
    { data: checkoutsToday2 },
    { data: checkinsToday2 },
    { data: cleanings },
    { data: pendingDrafts },
    { data: upcomingRes },
  ] = await Promise.all([
    supabase.from("properties").select("id, name").eq("status", "active").order("name"),
    // Check-outs today
    supabase
      .from("reservations")
      .select("property_id, guest_name, check_in, check_out")
      .eq("check_out", todayStr),
    // Check-ins today
    supabase
      .from("reservations")
      .select("property_id, guest_name, check_in, check_out")
      .eq("check_in", todayStr),
    // Check-outs tomorrow
    supabase
      .from("reservations")
      .select("property_id, guest_name, check_in, check_out")
      .eq("check_out", tomorrowStr),
    // Check-ins tomorrow
    supabase
      .from("reservations")
      .select("property_id, guest_name, check_in, check_out")
      .eq("check_in", tomorrowStr),
    // Cleanings next 3 days
    supabase
      .from("cleanings")
      .select("id, property_id, scheduled_for, cleaner_name, status")
      .gte("scheduled_for", now.toISOString())
      .lte("scheduled_for", addDays(now, 3).toISOString())
      .order("scheduled_for"),
    // Pending AI drafts
    supabase.from("message_drafts").select("id, thread_id, status").eq("status", "pending"),
    // Next 7-day bookings
    supabase
      .from("reservations")
      .select("property_id, guest_name, check_in, check_out, source")
      .gte("check_in", todayStr)
      .lte("check_in", in3dStr)
      .order("check_in"),
  ]);

  const propMap = new Map((properties ?? []).map((p) => [p.id, p.name]));
  const draftsCount = pendingDrafts?.length ?? 0;

  const todayCheckouts = checkoutsToday ?? [];
  const todayCheckins = checkinsToday ?? [];
  const tomorrowCheckouts = checkoutsToday2 ?? [];
  const tomorrowCheckins = checkinsToday2 ?? [];
  const upcomingCleanings = cleanings ?? [];

  // Busy-ness score for Jasmin
  const busyScore = todayCheckouts.length + todayCheckins.length + upcomingCleanings.filter(
    (c) => isToday(new Date(c.scheduled_for))
  ).length;

  const dayLabel = busyScore === 0
    ? "Looks like a quiet day ✨"
    : busyScore <= 2
    ? "Light schedule today"
    : busyScore <= 5
    ? "Moderate activity today"
    : "Busy day — stay sharp!";

  return (
    <div>
      <PageHeader
        title={`${greet()}, ${displayName}`}
        description={`${format(now, "EEEE, MMMM d, yyyy")} · ${dayLabel}`}
      />

      {/* Pending drafts banner */}
      {draftsCount > 0 && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-gold-300 bg-gold-50 p-4">
          <span className="text-2xl">💬</span>
          <div>
            <div className="text-sm font-semibold text-gold-800">
              {draftsCount} AI draft{draftsCount > 1 ? "s" : ""} waiting for review
            </div>
            <a href="/messages" className="text-xs text-navy-600 underline">
              Go to Messages →
            </a>
          </div>
        </div>
      )}

      {/* TODAY */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Check-outs today */}
        <TodayCard
          emoji="🧳"
          title="Check-outs today"
          count={todayCheckouts.length}
          items={todayCheckouts.map((r) => ({
            primary: propMap.get(r.property_id) ?? "Unknown",
            secondary: r.guest_name ?? "Guest",
          }))}
          emptyText="No departures today"
          accent="blue"
        />

        {/* Check-ins today */}
        <TodayCard
          emoji="🔑"
          title="Check-ins today"
          count={todayCheckins.length}
          items={todayCheckins.map((r) => ({
            primary: propMap.get(r.property_id) ?? "Unknown",
            secondary: `${r.guest_name ?? "Guest"} · thru ${format(new Date(r.check_out), "MMM d")}`,
          }))}
          emptyText="No arrivals today"
          accent="green"
        />

        {/* Cleanings today/tomorrow */}
        <TodayCard
          emoji="🧹"
          title="Upcoming cleanings"
          count={upcomingCleanings.length}
          items={upcomingCleanings.map((c) => ({
            primary: propMap.get(c.property_id) ?? "Unknown",
            secondary: `${relativeDay(c.scheduled_for)} · ${c.cleaner_name ?? "Unassigned"} · ${c.status}`,
            badge: c.status === "issue" ? "⚠️ Issue" : undefined,
          }))}
          emptyText="No cleanings in next 3 days"
          accent="gold"
        />
      </div>

      {/* TOMORROW preview */}
      {(tomorrowCheckouts.length > 0 || tomorrowCheckins.length > 0) && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-navy-600">Tomorrow&apos;s preview</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {tomorrowCheckouts.length > 0 && (
              <div className="rounded-lg border border-cream-200 bg-white p-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-500">
                  🧳 Check-outs tomorrow ({tomorrowCheckouts.length})
                </div>
                <ul className="space-y-1.5">
                  {tomorrowCheckouts.map((r, i) => (
                    <li key={i} className="text-sm">
                      <span className="font-medium">{propMap.get(r.property_id) ?? "—"}</span>
                      <span className="ml-2 text-navy-500">{r.guest_name ?? "Guest"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {tomorrowCheckins.length > 0 && (
              <div className="rounded-lg border border-cream-200 bg-white p-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-500">
                  🔑 Check-ins tomorrow ({tomorrowCheckins.length})
                </div>
                <ul className="space-y-1.5">
                  {tomorrowCheckins.map((r, i) => (
                    <li key={i} className="text-sm">
                      <span className="font-medium">{propMap.get(r.property_id) ?? "—"}</span>
                      <span className="ml-2 text-navy-500">
                        {r.guest_name ?? "Guest"} · thru {format(new Date(r.check_out), "MMM d")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Quick links */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-navy-600">Quick actions</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { href: "/messages/new", label: "Paste guest message", emoji: "✍️" },
            { href: "/cleaning", label: "Cleaning schedule", emoji: "🧹" },
            { href: "/calendar", label: "Full calendar", emoji: "📅" },
            { href: "/alerts", label: "Check alerts", emoji: "🔔" },
          ].map((q) => (
            <a
              key={q.href}
              href={q.href}
              className="flex flex-col items-center gap-2 rounded-lg border border-cream-200 bg-white p-4 text-center text-sm font-medium text-navy-800 hover:border-gold-300 hover:bg-gold-50 transition"
            >
              <span className="text-2xl">{q.emoji}</span>
              {q.label}
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── Sub-component ─────────────────────────────────────────────────────────────

type TodayCardItem = { primary: string; secondary: string; badge?: string };

function TodayCard({
  emoji,
  title,
  count,
  items,
  emptyText,
  accent,
}: {
  emoji: string;
  title: string;
  count: number;
  items: TodayCardItem[];
  emptyText: string;
  accent: "blue" | "green" | "gold";
}) {
  const accentBg = {
    blue: "bg-navy-50 border-navy-200",
    green: "bg-emerald-50 border-emerald-200",
    gold: "bg-gold-50 border-gold-200",
  }[accent];

  const accentBadge = {
    blue: "bg-navy-100 text-navy-800",
    green: "bg-emerald-100 text-emerald-800",
    gold: "bg-gold-100 text-gold-800",
  }[accent];

  return (
    <div className={`rounded-lg border p-4 ${accentBg}`}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{emoji}</span>
          <span className="text-sm font-semibold text-navy-800">{title}</span>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${accentBadge}`}>
          {count}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-navy-400">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={i}>
              <div className="text-sm font-medium text-navy-900">{item.primary}</div>
              <div className="text-xs text-navy-500">{item.secondary}</div>
              {item.badge && (
                <span className="mt-0.5 inline-block rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                  {item.badge}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
