// Turno (formerly TurnoverBnB) Partner API client.
// Docs: https://turno.com/partners (request access from Turno support)
// Authentication is API key in `Authorization: Bearer <key>` header.
//
// Field names below are based on common partner-API patterns; verify against
// the live response shape on first sync and adjust the parser.

const BASE = "https://api.turno.com/v1";

function headers() {
  const key = process.env.TURNO_API_KEY;
  if (!key) throw new Error("TURNO_API_KEY is not set");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

export type TurnoCleaning = {
  turno_project_id: string;
  property_external_id: string | null;
  scheduled_for: string; // ISO timestamp
  cleaner_name: string | null;
  status: "scheduled" | "in_progress" | "completed" | "issue" | "cancelled";
  notes: string | null;
};

export async function fetchTurnoCleanings(
  fromIso: string,
  toIso: string,
): Promise<TurnoCleaning[]> {
  const url = `${BASE}/projects?start_date=${encodeURIComponent(fromIso)}&end_date=${encodeURIComponent(toIso)}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    throw new Error(`Turno fetch failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = Array.isArray(data) ? data : (data.projects ?? data.data ?? []);

  return items.map(parseTurnoProject).filter((x): x is TurnoCleaning => x !== null);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseTurnoProject(row: any): TurnoCleaning | null {
  const id = row.id ?? row.project_id;
  if (!id) return null;
  return {
    turno_project_id: String(id),
    property_external_id: row.property_id
      ? String(row.property_id)
      : (row.property?.id ?? null),
    scheduled_for: row.scheduled_for ?? row.start_time ?? row.date,
    cleaner_name:
      row.cleaner?.name ?? row.assigned_cleaner ?? row.cleaner_name ?? null,
    status: mapStatus(row.status),
    notes: row.notes ?? null,
  };
}

function mapStatus(s: unknown): TurnoCleaning["status"] {
  const v = String(s ?? "").toLowerCase();
  if (v.includes("progress")) return "in_progress";
  if (v.includes("complete") || v.includes("done")) return "completed";
  if (v.includes("issue") || v.includes("problem")) return "issue";
  if (v.includes("cancel")) return "cancelled";
  return "scheduled";
}
