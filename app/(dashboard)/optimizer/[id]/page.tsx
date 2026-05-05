import { format } from "date-fns";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { PageHeader } from "@/components/page-header";

import { AnalyzeButton } from "./_components/analyze-button";
import { AnalysisView } from "./_components/analysis-view";

export const dynamic = "force-dynamic";

export default async function OptimizerDetailPage(
  props: PageProps<"/optimizer/[id]">,
) {
  const { id } = await props.params;
  const supabase = await createClient();

  const { data: property } = await supabase
    .from("properties")
    .select("id, name, address, status, pricelabs_listing_id, airbnb_listing_id")
    .eq("id", id)
    .maybeSingle();

  if (!property) notFound();

  const { data: optimization } = await supabase
    .from("optimizations")
    .select("*")
    .eq("property_id", id)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div>
      <PageHeader
        title={property.name}
        description={property.address ?? undefined}
        action={<AnalyzeButton propertyId={id} hasExisting={Boolean(optimization)} />}
      />

      {!optimization ? (
        <div className="rounded-lg border border-dashed border-cream-300 bg-white p-10 text-center">
          <p className="text-sm text-navy-600">
            No analysis yet for this property.
          </p>
          <p className="mt-1 text-xs text-navy-500">
            Click <strong>Analyze with AI</strong> to generate one.
          </p>
        </div>
      ) : (
        <AnalysisView optimization={optimization} />
      )}

      {optimization && (
        <p className="mt-8 text-xs text-navy-500">
          Generated {format(new Date(optimization.generated_at), "MMM d, yyyy 'at' h:mma")}{" "}
          using {optimization.model}
          {optimization.cost_usd != null && (
            <> · ${Number(optimization.cost_usd).toFixed(2)} ·{" "}
              {optimization.input_tokens?.toLocaleString()} in /{" "}
              {optimization.output_tokens?.toLocaleString()} out tokens
            </>
          )}
        </p>
      )}
    </div>
  );
}
