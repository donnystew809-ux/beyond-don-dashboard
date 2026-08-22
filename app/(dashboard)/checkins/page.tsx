import { PageHeader } from "@/components/page-header";
import { GlassCard } from "@/components/glass-card";
import { requireStaff } from "@/lib/auth-guards";
import { createServiceClient } from "@/lib/supabase/server";
import { stayInfo } from "@/lib/messaging/checkin";

import { CheckinList, type CurrentStay } from "./_components/checkin-list";

export const dynamic = "force-dynamic";

export default async function CheckinsPage() {
  await requireStaff();
  const db = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: properties }, { data: reservations }] = await Promise.all([
    db.from("properties").select("id, name, nickname").eq("status", "active"),
    db
      .from("reservations")
      .select("id, property_id, check_in, check_out, reservation_code, guest_name")
      .lte("check_in", today)
      .gte("check_out", today)
      .order("check_in"),
  ]);

  const propMap = new Map(
    (properties ?? []).map((p) => [p.id, p.nickname || p.name]),
  );

  const stays: CurrentStay[] = (reservations ?? [])
    .filter((r) => propMap.has(r.property_id))
    .map((r) => {
      const info = stayInfo(r.check_in, r.check_out, today);
      return {
        id: r.id,
        property: propMap.get(r.property_id) as string,
        checkIn: r.check_in,
        checkOut: r.check_out,
        reservationCode: r.reservation_code,
        guestName: r.guest_name,
        stage: info.stage,
        label: info.label,
      };
    })
    .filter((s) => s.stage !== "not_current");

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Guest check-ins"
        description="Everyone staying with you right now. Claude drafts a message in your voice, matched to where each guest is in their stay."
      />

      {stays.length === 0 ? (
        <GlassCard className="p-8 text-center">
          <p className="text-sm text-cream-200/70">
            Nobody is checked in right now. This page fills up automatically as
            guests arrive.
          </p>
        </GlassCard>
      ) : (
        <CheckinList stays={stays} />
      )}
    </div>
  );
}
