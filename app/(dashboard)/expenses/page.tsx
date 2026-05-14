import { format, startOfMonth, endOfMonth, startOfYear } from "date-fns";

import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { AddExpenseForm } from "./_components/add-expense-form";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  cleaning: "🧹 Cleaning",
  maintenance: "🔧 Maintenance",
  supplies: "🛒 Supplies",
  platform_fee: "💻 Platform Fee",
  utilities: "💡 Utilities",
  insurance: "🛡️ Insurance",
  other: "📦 Other",
};

function formatUSD(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default async function ExpensesPage() {
  const supabase = await createClient();
  const now = new Date();
  const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
  const yearStart = format(startOfYear(now), "yyyy-MM-dd");

  const [{ data: properties }, { data: expensesRaw }] = await Promise.all([
    supabase.from("properties").select("id, name").eq("status", "active").order("name"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("expenses")
      .select("id, property_id, date, category, amount, currency, vendor, description, created_at")
      .order("date", { ascending: false })
      .limit(200),
  ]);

  type ExpenseRow = {
    id: string;
    property_id: string;
    date: string;
    category: string;
    amount: number;
    currency: string | null;
    vendor: string | null;
    description: string | null;
    created_at: string;
  };

  const propMap = new Map((properties ?? []).map((p) => [p.id, p.name]));
  const expList = (expensesRaw ?? []) as unknown as ExpenseRow[];

  // KPI roll-ups
  const mtdTotal = expList
    .filter((e) => e.date >= monthStart)
    .reduce((s, e) => s + Number(e.amount), 0);
  const ytdTotal = expList
    .filter((e) => e.date >= yearStart)
    .reduce((s, e) => s + Number(e.amount), 0);

  // By category (MTD)
  const byCat: Record<string, number> = {};
  for (const e of expList.filter((e) => e.date >= monthStart)) {
    byCat[e.category] = (byCat[e.category] ?? 0) + Number(e.amount);
  }
  const topCategories = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Track property costs across all listings."
      />

      {/* KPI bar */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <KpiCard label="Month-to-date" value={formatUSD(mtdTotal)} />
        <KpiCard label="Year-to-date" value={formatUSD(ytdTotal)} />
        <KpiCard
          label="Top category (MTD)"
          value={topCategories[0] ? CATEGORY_LABELS[topCategories[0][0]] ?? topCategories[0][0] : "—"}
          sub={topCategories[0] ? formatUSD(topCategories[0][1]) : undefined}
        />
      </div>

      {/* Add expense form */}
      <div className="mb-6">
        <AddExpenseForm properties={properties ?? []} />
      </div>

      {/* Table */}
      {expList.length === 0 ? (
        <div className="rounded-lg border border-dashed border-navy-700/50 bg-navy-900/60 backdrop-blur-sm p-10 text-center text-sm text-cream-200/60">
          No expenses logged yet. Add one above.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-navy-700/40 bg-navy-900/60 backdrop-blur-sm">
          <table className="w-full text-sm">
            <thead className="bg-navy-800/40 text-left text-xs uppercase tracking-wide text-cream-200/60">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Property</th>
                <th className="px-4 py-3">Category</th>
                <th className="hidden px-4 py-3 sm:table-cell">Vendor</th>
                <th className="hidden px-4 py-3 md:table-cell">Notes</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-700/40">
              {expList.map((e) => (
                <tr key={e.id} className="hover:bg-navy-800/40">
                  <td className="px-4 py-3 text-cream-200/80">{format(new Date(e.date), "MMM d, yyyy")}</td>
                  <td className="px-4 py-3 font-medium text-cream-50">
                    {propMap.get(e.property_id) ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-cream-200/80">
                    {CATEGORY_LABELS[e.category] ?? e.category}
                  </td>
                  <td className="hidden px-4 py-3 text-cream-200/60 sm:table-cell">
                    {e.vendor ?? "—"}
                  </td>
                  <td className="hidden px-4 py-3 text-cream-200/50 md:table-cell">
                    <span className="line-clamp-1 max-w-[200px]">{e.description ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-cream-50">
                    {formatUSD(Number(e.amount))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-navy-700/50 bg-navy-800/40">
              <tr>
                <td colSpan={5} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-cream-200/80">
                  Total shown
                </td>
                <td className="px-4 py-3 text-right font-bold text-cream-50">
                  {formatUSD(expList.reduce((s, e) => s + Number(e.amount), 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-navy-700/40 bg-navy-900/60 backdrop-blur-sm p-4">
      <div className="text-xs uppercase tracking-wide text-cream-200/60">{label}</div>
      <div className="mt-1 text-xl font-bold text-cream-50">{value}</div>
      {sub && <div className="text-xs text-cream-200/50">{sub}</div>}
    </div>
  );
}
