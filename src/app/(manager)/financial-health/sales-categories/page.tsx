import type { Metadata } from "next";

import {
  EmptyState,
  PageBody,
  Panel,
  TableScroll,
  formatMoney,
  tableClass,
  tdClass,
  tdNumClass,
  thClass,
  thNumClass,
} from "@/components/ui";
import { getGlAccounts, getSalesClassification } from "@/lib/reporting/queries";

import {
  FinancialsHeader,
  loadFinancialsContext,
  type FinancialsSearchParams,
} from "../financials-context";
import { AccountSelect } from "./account-select";

export const metadata: Metadata = { title: "Sales categories" };

const FIELDS = [
  {
    field: "menu_group",
    title: "Menu groups",
    description: "The broadest grouping. Mapping these covers most sales.",
  },
  {
    field: "subgroup",
    title: "Subgroups",
    description: "Overrides the menu group for items in this subgroup.",
  },
  {
    field: "category",
    title: "Sales categories",
    description:
      "Toast sales categories, used when no subgroup mapping applies.",
  },
];

export default async function SalesCategoriesPage({
  searchParams,
}: {
  searchParams: FinancialsSearchParams;
}) {
  const loaded = await loadFinancialsContext(searchParams);
  if (!loaded) return null;
  const { context, locationId, periods, range } = loaded;
  const organizationId = context.organizationId!;
  const [accounts, classification] = await Promise.all([
    getGlAccounts(organizationId),
    getSalesClassification(organizationId, locationId, range.start, range.end),
  ]);
  const revenueAccounts = accounts
    .filter((account) => account.account_type === "revenue")
    .map((account) => ({
      id: account.id,
      label: `${account.code} ${account.name}`,
    }));

  return (
    <>
      <FinancialsHeader
        title="Sales categories"
        active="/financial-health/sales-categories"
        range={range}
        periods={periods}
      />
      <PageBody narrow>
        <p className="text-sm text-[var(--muted)]">
          Each Toast grouping points at a sales account, which sets the class
          its cost % is measured against. Item-level mappings win over
          subgroups, subgroups over categories, and categories over menu groups.
          Changes apply to every period, including past ones.
        </p>
        {classification.groups.length === 0 ? (
          <Panel>
            <EmptyState
              title="No sales posted in this range"
              detail="Groupings appear here once a Toast export is posted."
            />
          </Panel>
        ) : (
          FIELDS.map(({ field, title, description }) => {
            const groups = classification.groups.filter(
              (group) => group.field === field,
            );
            if (groups.length === 0) return null;
            return (
              <Panel key={field} title={title} description={description} flush>
                <TableScroll>
                  <table className={tableClass}>
                    <thead>
                      <tr>
                        <th className={thClass}>Toast value</th>
                        <th className={thNumClass}>Sales in range</th>
                        <th className={thClass}>Account</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map((group) => (
                        <tr key={group.value}>
                          <td className={tdClass}>{group.value}</td>
                          <td className={tdNumClass}>
                            {formatMoney(group.sales, { cents: false })}
                          </td>
                          <td className={`${tdClass} py-1.5`}>
                            <AccountSelect
                              field={field}
                              value={group.value}
                              accountId={group.accountId}
                              accounts={revenueAccounts}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScroll>
              </Panel>
            );
          })
        )}
      </PageBody>
    </>
  );
}
