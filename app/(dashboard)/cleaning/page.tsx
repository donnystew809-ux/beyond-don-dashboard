import { format, isToday, isTomorrow, addDays } from "date-fns";

import { createClient } from "@/lib/supabase/server";

import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function CleaningPage() {
  const supabase = await createClient();
  const now = new Date();

  const [{ data: properties }, { data: cleanings }] = await Promise.all([
    supabase.from("properties").select("id, name"),
    supabase
      .from("cleanings")
      .select("id, property_id, scheduled_for, cleaner_name, status, notes")
      .gte("scheduled_for", addDays(now, -1).toISOString())
      .order("scheduled_for", { ascending: true })
      .limit(60),
  ]);

  const propertyName = new Map(
    (properties ?? []).map((p) => [p.id, p.name] as const),
  );

  const groups = {
    today: [] as typeof cleanings,
    tomorrow: [] as typeof cleanings,
    later: [] as typeof cleanings,
  };

  for (const c of cleanings ?? []) {
    const when = new Date(c.scheduled_for);
    if (isToday(when)) groups.today!.push(c);
    else if (isTomorrow(when)) groups.tomorrow!.push(c);
    else groups.later!.push(c);
  }

  return (
    <div>
      <PageHeader
        title="Cleaning schedule"
        description="Synced from Turno hourly."
      />

      <div className="space-y-8">
        <CleaningGroup
          title="Today"
          items={groups.today ?? []}
          propertyName={propertyName}
          empty="No cleanings today."
        />
        <CleaningGroup
          title="Tomorrow"
          items={groups.tomorrow ?? []}
          propertyName={propertyName}
          empty="No cleanings tomorrow."
        />
        <CleaningGroup
          title="Upcoming"
          items={groups.later ?? []}
          propertyName={propertyName}
          empty="No further cleanings on the schedule."
        />
      </div>
    </div>
  );
}

function CleaningGroup({
  title,
  items,
  propertyName,
  empty,
}: {
  title: string;
  items: NonNullable<Awaited<ReturnType<typeof getCleanings>>>;
  propertyName: Map<string, string>;
  empty: string;
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-500">{empty}</p>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          {items.map((c, i) => (
            <li
              key={c.id}
              className={`flex items-center justify-between px-4 py-3 ${
                i > 0 ? "border-t border-neutral-100" : ""
              }`}
            >
              <div>
                <div className="text-sm font-medium">
                  {propertyName.get(c.property_id) ?? "Unknown"}
                </div>
                <div className="text-xs text-neutral-500">
                  {c.cleaner_name ?? "Unassigned"}
                  {c.notes ? ` · ${c.notes}` : ""}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm">
                  {format(new Date(c.scheduled_for), "h:mm a")}
                </div>
                <div className="text-xs uppercase tracking-wide text-neutral-500">
                  {c.status}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// helper used purely for type inference of the Cleaning rows
async function getCleanings() {
  const supabase = await createClient();
  return supabase
    .from("cleanings")
    .select("id, property_id, scheduled_for, cleaner_name, status, notes")
    .then((r) => r.data);
}
