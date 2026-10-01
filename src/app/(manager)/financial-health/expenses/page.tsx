import type { Metadata } from "next";

import {
  Badge,
  EmptyState,
  PageBody,
  Panel,
  TableScroll,
  buttonClass,
  formatMoney,
  tableClass,
  tdClass,
  tdNumClass,
  thClass,
  thNumClass,
} from "@/components/ui";
import { getGlAccounts, getPlEntries } from "@/lib/reporting/queries";

import { deleteExpenseAction } from "../actions";
import {
  FinancialsHeader,
  loadFinancialsContext,
  type FinancialsSearchParams,
} from "../financials-context";
import { ExpenseForm } from "./expense-form";

export const metadata: Metadata = { title: "Expenses" };

const GROUP_LABELS: Record<string, string> = {
  labor: "Labor",
  operating_expense: "Operating expenses",
  other_income: "Other income",
  other_expense: "Other expense",
};

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: FinancialsSearchParams;
}) {
  const loaded = await loadFinancialsContext(searchParams);
  if (!loaded) return null;
  const { context, locationId, periods, range } = loaded;
  const [accounts, entries] = await Promise.all([
    getGlAccounts(context.organizationId!),
    getPlEntries(locationId, range.start, range.end),
  ]);

  const options = accounts
    .filter((account) => account.account_type in GROUP_LABELS)
    .map((account) => ({
      id: account.id,
      label: `${account.code} ${account.name}`,
      group: GROUP_LABELS[account.account_type],
    }));

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
  const defaultDate =
    today >= range.start && today <= range.end ? today : range.end;

  const byAccount = new Map<string, number>();
  for (const entry of entries) {
    byAccount.set(
      entry.accountLabel,
      (byAccount.get(entry.accountLabel) ?? 0) + entry.amount,
    );
  }
  const total = entries.reduce((sum, entry) => sum + entry.amount, 0);

  return (
    <>
      <FinancialsHeader
        title="Expenses"
        active="/financial-health/expenses"
        range={range}
        periods={periods}
      />
      <PageBody>
        <div className="grid items-start gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
          <div className="grid gap-5">
            <Panel
              title="Add entry"
              description="Labor, rent, utilities and other costs that don't come from inventory."
            >
              <ExpenseForm accounts={options} defaultDate={defaultDate} />
            </Panel>
            {byAccount.size > 0 && (
              <Panel title="By account" flush>
                <table className={tableClass}>
                  <tbody>
                    {[...byAccount.entries()]
                      .sort((a, b) => b[1] - a[1])
                      .map(([label, amount]) => (
                        <tr key={label}>
                          <td className={tdClass}>{label}</td>
                          <td className={tdNumClass}>{formatMoney(amount)}</td>
                        </tr>
                      ))}
                    <tr className="font-semibold">
                      <td className={tdClass}>Total</td>
                      <td className={tdNumClass}>{formatMoney(total)}</td>
                    </tr>
                  </tbody>
                </table>
              </Panel>
            )}
          </div>

          <Panel
            title="Entries"
            description={`${entries.length} in this range`}
            flush
          >
            {entries.length === 0 ? (
              <EmptyState
                title="No expenses entered"
                detail="Until labor and operating costs are entered, the P&L shows gross profit only."
              />
            ) : (
              <TableScroll>
                <table className={tableClass}>
                  <thead>
                    <tr>
                      <th className={thClass}>Date</th>
                      <th className={thClass}>Account</th>
                      <th className={thClass}>Memo</th>
                      <th className={thNumClass}>Amount</th>
                      <th className={thClass}>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={entry.id}>
                        <td
                          className={`${tdClass} whitespace-nowrap tabular-nums`}
                        >
                          {entry.entryDate}
                        </td>
                        <td className={tdClass}>{entry.accountLabel}</td>
                        <td className={`${tdClass} text-[var(--muted)]`}>
                          {entry.memo || "—"}
                          {entry.sourceType !== "manual" && (
                            <span className="ml-2">
                              <Badge>
                                {entry.sourceType.replace("_", " ")}
                              </Badge>
                            </span>
                          )}
                        </td>
                        <td className={tdNumClass}>
                          {formatMoney(entry.amount)}
                        </td>
                        <td className={`${tdClass} w-px text-right`}>
                          {entry.sourceType === "manual" && (
                            <form action={deleteExpenseAction}>
                              <input type="hidden" name="id" value={entry.id} />
                              <button
                                type="submit"
                                className={buttonClass("ghost", "sm")}
                                aria-label={`Delete ${entry.accountLabel} entry on ${entry.entryDate}`}
                              >
                                Delete
                              </button>
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            )}
          </Panel>
        </div>
      </PageBody>
    </>
  );
}
