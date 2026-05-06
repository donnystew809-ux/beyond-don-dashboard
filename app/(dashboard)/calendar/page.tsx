import { addDays, eachDayOfInterval, format, startOfWeek, isToday } from "date-fns";

import { createClient } from "@/lib/supabase/server";

import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

const DAYS_AHEAD = 28;

export default async function CalendarPage() {
  const supabase = await createClient();
  const today = new Date();
  const start = startOfWeek(today, { weekStartsOn: 1 });
  const end = addDays(start, DAYS_AHEAD - 1);

  const [{ data: properties }, { data: reservations }] = await Promise.all([
    supabase
      .from("properties")
      .select("id, name")
      .eq("status", "active")
      .order("name"),
    supabase
      .from("reservations")
      .select("property_id, check_in, check_out, source, guest_name")
      .gte("check_out", format(start, "yyyy-MM-dd"))
      .lte("check_in", format(end, "yyyy-MM-dd")),
  ]);

  const days = eachDayOfInterval({ start, end });

  const reservationsByProperty = new Map<
    string,
    Array<{ check_in: Date; check_out: Date; source: string; guest_name: string | null }>
  >();
  for (const r of reservations ?? []) {
    const list = reservationsByProperty.get(r.property_id) ?? [];
    list.push({
      check_in: new Date(r.check_in),
      check_out: new Date(r.check_out),
      source: r.source,
      guest_name: r.guest_name,
    });
    reservationsByProperty.set(r.property_id, list);
  }

  return (
    <div>
      <PageHeader
        title="Calendar"
        description={`${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`}
      />

      {!properties || properties.length === 0 ? (
        <div className="rounded-lg border border-dashed border-cream-300 bg-white p-10 text-center text-sm text-navy-500">
          Add properties to see the calendar.
        </div>
      ) : (
        <>
          {/* Scroll hint — mobile only */}
          <p className="mb-2 text-xs text-navy-400 sm:hidden">
            ← Swipe left to see more days →
          </p>
          <div className="overflow-x-auto rounded-lg border border-cream-200 bg-white">
            <table className="min-w-full text-xs">
              <thead className="bg-cream-50">
                <tr>
                  {/* Narrower property column on mobile */}
                  <th className="sticky left-0 z-10 w-24 bg-cream-50 px-2 py-2 text-left font-medium text-navy-600 sm:w-auto sm:px-3">
                    Property
                  </th>
                  {days.map((d) => {
                    const todayCell = isToday(d);
                    return (
                      <th
                        key={d.toISOString()}
                        className={`min-w-[40px] border-l border-cream-200 px-1 py-2 text-center ${
                          todayCell ? "bg-gold-50 text-gold-800" : "text-navy-600"
                        }`}
                      >
                        <div className="hidden sm:block">{format(d, "EEE")}</div>
                        <div className={`text-[10px] ${todayCell ? "font-bold text-gold-700" : "text-navy-400"}`}>
                          {format(d, "M/d")}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {properties.map((property) => {
                  const reservedDays = new Set<string>();
                  for (const r of reservationsByProperty.get(property.id) ?? []) {
                    for (const d of eachDayOfInterval({
                      start: r.check_in,
                      end: addDays(r.check_out, -1),
                    })) {
                      reservedDays.add(format(d, "yyyy-MM-dd"));
                    }
                  }

                  return (
                    <tr key={property.id} className="border-t border-cream-200">
                      <td className="sticky left-0 z-10 w-24 max-w-[96px] truncate bg-white px-2 py-2 text-left text-sm font-medium sm:w-auto sm:max-w-none sm:px-3">
                        {property.name}
                      </td>
                      {days.map((d) => {
                        const key = format(d, "yyyy-MM-dd");
                        const reserved = reservedDays.has(key);
                        const todayCell = isToday(d);
                        return (
                          <td
                            key={key}
                            className={`border-l border-cream-200 ${
                              reserved
                                ? "bg-emerald-200"
                                : todayCell
                                  ? "bg-gold-50/50"
                                  : d < today
                                    ? "bg-cream-50"
                                    : ""
                            }`}
                          >
                            <div className="h-6" />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-navy-500">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-4 rounded-sm bg-emerald-200" /> Booked
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-4 rounded-sm bg-gold-50 ring-1 ring-gold-300" /> Today
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-4 rounded-sm bg-cream-50 ring-1 ring-cream-200" /> Past
            </span>
          </div>
        </>
      )}

      <p className="mt-3 text-xs text-navy-500">
        Reservations sync from each Airbnb listing&apos;s iCal feed every 2 hours.
      </p>
    </div>
  );
}
