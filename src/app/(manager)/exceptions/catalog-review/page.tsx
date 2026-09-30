import type { Metadata } from "next";

import { getUserContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { closeCatalogReviewItemAction } from "./actions";

export const metadata: Metadata = { title: "Catalog review" };

const ISSUE_GROUPS = [
  {
    type: "missing_cost",
    label: "Products with no cost",
    detail: "These value at $0 until a cost is entered or an invoice posts.",
  },
  {
    type: "missing_recipe",
    label: "Missing recipes and Toast mappings",
    detail:
      "House prep without a recipe, and Toast items that deplete nothing yet.",
  },
  {
    type: "unmatched_count_item",
    label: "Shelf items with no product",
    detail: "Recorded on the walk but not matched to a product.",
  },
  {
    type: "unverified_assumption",
    label: "Assumptions to confirm",
    detail: "Choices made during the import that a person should check.",
  },
  {
    type: "missing_invoice_date",
    label: "Invoices without a date",
    detail: "Undated invoices count toward no period's cost of goods.",
  },
] as const;

type ReviewItem = {
  id: string;
  issue_type: string;
  title: string;
  detail: string;
  inventory_items: { item_code: string | null } | null;
};

export default async function CatalogReviewPage() {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("catalog_review_items")
    .select("id, issue_type, title, detail, inventory_items(item_code)")
    .eq("organization_id", context.organizationId)
    .eq("status", "open")
    .order("title");
  const items = (data ?? []) as unknown as ReviewItem[];
  const canResolve = context.role === "manager";

  return (
    <div className="px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <p className="font-mono text-[10px] tracking-[0.16em] text-[#b77a22] uppercase">
          Incomplete data
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-[-0.045em]">
          Catalog review.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          Everything the workbook import could not settle on its own. Resolve an
          item once it is fixed, or dismiss it if it does not apply.
        </p>

        {ISSUE_GROUPS.map((group) => {
          const rows = items.filter((item) => item.issue_type === group.type);
          if (rows.length === 0) return null;
          return (
            <section key={group.type} className="mt-9">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-xl font-semibold">{group.label}</h2>
                <span className="font-mono text-xs text-[var(--muted)] tabular-nums">
                  {rows.length}
                </span>
              </div>
              <p className="mt-1 text-sm text-[var(--muted)]">{group.detail}</p>
              <div className="mt-4 grid gap-2">
                {rows.map((row) => (
                  <article
                    key={row.id}
                    className="flex flex-col gap-3 border-l-4 border-l-[#b77a22] bg-white p-4 md:flex-row md:items-start md:justify-between"
                  >
                    <div className="min-w-0">
                      <h3 className="font-semibold">
                        {row.inventory_items?.item_code && (
                          <span className="mr-2 font-mono text-xs text-[var(--muted)]">
                            #{row.inventory_items.item_code}
                          </span>
                        )}
                        {row.title}
                      </h3>
                      <p className="mt-1 text-sm leading-5 text-[var(--muted)]">
                        {row.detail}
                      </p>
                    </div>
                    {canResolve && (
                      <form
                        action={closeCatalogReviewItemAction}
                        className="flex shrink-0 flex-wrap items-center gap-2"
                      >
                        <input type="hidden" name="id" value={row.id} />
                        <input
                          name="resolution_note"
                          placeholder="Note (optional)"
                          className="w-44 border px-2 py-1.5 text-sm"
                        />
                        <button
                          name="status"
                          value="resolved"
                          className="border bg-[var(--foreground)] px-3 py-1.5 text-sm text-white"
                        >
                          Resolve
                        </button>
                        <button
                          name="status"
                          value="dismissed"
                          className="border px-3 py-1.5 text-sm"
                        >
                          Dismiss
                        </button>
                      </form>
                    )}
                  </article>
                ))}
              </div>
            </section>
          );
        })}

        {items.length === 0 && (
          <div className="mt-8 border bg-[var(--surface-strong)] p-6">
            <p className="font-semibold">Nothing left to review.</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Every catalog question from the import has been settled.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
