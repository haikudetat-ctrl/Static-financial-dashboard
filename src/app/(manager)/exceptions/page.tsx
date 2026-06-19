import type { Metadata } from "next";
import Link from "next/link";

import { getUserContext } from "@/lib/auth/session";
import {
  getNegativeInventory,
  getPrimaryLocation,
} from "@/lib/inventory/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Exceptions" };

export default async function ExceptionsPage() {
  const context = await getUserContext();
  const locationId =
    context?.organizationId &&
    (await getPrimaryLocation(context.organizationId, context.locationId));

  const supabase = await createClient();

  // Negative stock
  const negatives =
    context?.organizationId && locationId
      ? await getNegativeInventory(context.organizationId, locationId)
      : [];

  // Below-par items
  const { count: belowPar } =
    context?.organizationId && locationId
      ? await supabase
          .from("order_guide_items")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", context.organizationId)
          .gt("default_par", 0)
      : { count: 0 };

  // Unmapped Toast items
  const { count: unmappedImports } = context?.organizationId
    ? await supabase
        .from("source_import_rows")
        .select("*", { count: "exact", head: true })
        .eq("status", "staged")
    : { count: 0 };

  // Unapproved invoices
  const { count: unapprovedInvoices } =
    context?.organizationId && locationId
      ? await supabase
          .from("invoices")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", context.organizationId)
          .eq("location_id", locationId)
          .not("status", "in", '("posted","rejected")')
      : { count: 0 };

  // Unapproved receipts
  const { count: unapprovedReceipts } =
    context?.organizationId && locationId
      ? await supabase
          .from("receipts")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", context.organizationId)
          .eq("location_id", locationId)
          .eq("status", "review_required")
      : { count: 0 };

  // Unmapped invoice lines
  const { count: unmappedLines } = context?.organizationId
    ? await supabase
        .from("invoice_lines")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", context.organizationId)
        .is("inventory_item_id", null)
    : { count: 0 };

  const sections = [
    {
      label: "Negative inventory",
      href: "/exceptions/negative-inventory",
      count: negatives.length,
      detail:
        "Physical negatives block period close. Investigate missing receipts, timing issues, production errors, or count mistakes.",
      severity: "blocking" as const,
    },
    {
      label: "Unapproved invoices",
      href: "/invoices/upload",
      count: unapprovedInvoices ?? 0,
      detail: "Invoices must be approved before cost is finalized.",
      severity: "blocking" as const,
    },
    {
      label: "Unapproved receipts",
      href: "/receiving/review",
      count: unapprovedReceipts ?? 0,
      detail: "No-PO deliveries and exception receipts need manager review.",
      severity: "incomplete" as const,
    },
    {
      label: "Unmapped invoice lines",
      href: "/invoices/upload",
      count: unmappedLines ?? 0,
      detail:
        "Every invoice line must map to an inventory item for accurate costing.",
      severity: "incomplete" as const,
    },
    {
      label: "Unmapped source items",
      href: "/mapping",
      count: unmappedImports ?? 0,
      detail:
        "Toast items or vendor codes that need recipe or inventory mappings.",
      severity: "incomplete" as const,
    },
    {
      label: "Below-par stock",
      href: "/purchasing/order-guide",
      count: belowPar ?? 0,
      detail: "Items with active pars that may need reordering.",
      severity: "estimated" as const,
    },
  ];

  return (
    <div className="px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
          Exceptions
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-[-0.045em]">
          Uncertainty belongs in the open.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          Blocking issues stay visible before they distort a period close or a
          financial result.
        </p>

        <div className="mt-7 grid gap-4">
          {sections.map((section) => (
            <Link
              key={section.label}
              href={section.href}
              className="flex items-center justify-between border bg-white p-5 transition hover:bg-[#f8f1ea]"
            >
              <div className="flex items-start gap-4">
                <span
                  className={`mt-0.5 flex min-h-6 min-w-6 items-center justify-center rounded-full text-[11px] font-semibold text-white ${
                    section.count > 0
                      ? section.severity === "blocking"
                        ? "bg-[#a63f2f]"
                        : section.severity === "incomplete"
                          ? "bg-[#b77a22]"
                          : "bg-[#3f6d55]"
                      : "bg-[var(--muted)]"
                  }`}
                >
                  {section.count > 9 ? "9+" : section.count}
                </span>
                <div>
                  <p className="font-semibold">{section.label}</p>
                  <p className="mt-1 text-sm leading-5 text-[var(--muted)]">
                    {section.detail}
                  </p>
                </div>
              </div>
              <span
                className={`font-mono text-[10px] tracking-[0.1em] uppercase ${
                  section.count > 0
                    ? section.severity === "blocking"
                      ? "text-[#a63f2f]"
                      : section.severity === "incomplete"
                        ? "text-[#b77a22]"
                        : "text-[#3f6d55]"
                    : "text-[var(--muted)]"
                }`}
              >
                {section.count}
              </span>
            </Link>
          ))}
        </div>
        {sections.every((s) => s.count === 0) && (
          <div className="mt-8 border bg-[var(--surface-strong)] p-6">
            <p className="font-semibold">No exceptions.</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              All checks passed. The system is ready for the next period close.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
