"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

type Property = Database["public"]["Tables"]["properties"]["Row"];

type Field = keyof Pick<
  Property,
  | "name"
  | "nickname"
  | "address"
  | "airbnb_listing_id"
  | "ical_url"
  | "pricelabs_listing_id"
  | "turno_property_id"
  | "owner_name"
  | "owner_email"
>;

const FIELDS: Array<{ key: Field; label: string; placeholder?: string; type?: string }> = [
  { key: "name", label: "Property name", placeholder: "Lakeview Cabin" },
  { key: "nickname", label: "Internal nickname (optional)" },
  { key: "address", label: "Address" },
  { key: "airbnb_listing_id", label: "Airbnb listing ID", placeholder: "e.g. 12345678" },
  {
    key: "ical_url",
    label: "Airbnb iCal export URL",
    placeholder: "https://www.airbnb.com/calendar/ical/...",
  },
  { key: "pricelabs_listing_id", label: "PriceLabs listing ID" },
  { key: "turno_property_id", label: "Turno property ID" },
  { key: "owner_name", label: "Owner name" },
  { key: "owner_email", label: "Owner email", type: "email" },
];

type Initial = Partial<Property> & { id?: string };

export function PropertyForm({ property }: { property?: Initial }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [values, setValues] = useState<Record<Field, string>>(() => ({
    name: property?.name ?? "",
    nickname: property?.nickname ?? "",
    address: property?.address ?? "",
    airbnb_listing_id: property?.airbnb_listing_id ?? "",
    ical_url: property?.ical_url ?? "",
    pricelabs_listing_id: property?.pricelabs_listing_id ?? "",
    turno_property_id: property?.turno_property_id ?? "",
    owner_name: property?.owner_name ?? "",
    owner_email: property?.owner_email ?? "",
  }));

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = createClient();
    const payload = FIELDS.reduce<Record<Field, string | null>>(
      (acc, f) => {
        const v = values[f.key].trim();
        acc[f.key] = v === "" ? null : v;
        return acc;
      },
      {} as Record<Field, string | null>,
    );
    if (!payload.name) {
      setError("Name is required.");
      setSubmitting(false);
      return;
    }

    const insertPayload = {
      ...payload,
      name: payload.name as string,
    };

    const { error: upsertError } = property?.id
      ? await supabase
          .from("properties")
          .update(insertPayload)
          .eq("id", property.id)
      : await supabase.from("properties").insert(insertPayload);

    if (upsertError) {
      setError(upsertError.message);
      setSubmitting(false);
      return;
    }

    router.push("/settings");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {FIELDS.map((f) => (
          <label
            key={f.key}
            className={`block text-sm ${
              f.key === "address" || f.key === "ical_url" ? "md:col-span-2" : ""
            }`}
          >
            <span className="font-medium text-neutral-700">{f.label}</span>
            <input
              type={f.type ?? "text"}
              value={values[f.key]}
              placeholder={f.placeholder}
              onChange={(e) =>
                setValues((v) => ({ ...v, [f.key]: e.target.value }))
              }
              className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            />
          </label>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {submitting ? "Saving…" : property?.id ? "Save changes" : "Add property"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
