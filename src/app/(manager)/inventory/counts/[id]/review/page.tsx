import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  approveInventoryCountAction,
  requestRecountAction,
  setCountDateAction,
} from "@/app/(manager)/inventory/counts/actions";
import {
  Badge,
  ButtonLink,
  Callout,
  EmptyState,
  PageBody,
  PageHeader,
  Panel,
  SectionTabs,
  StatGrid,
  StatTile,
  TableScroll,
  buttonClass,
  formatMoney,
  inputClass,
  tableClass,
  tdClass,
  tdNumClass,
  thClass,
  thNumClass,
} from "@/components/ui";
import {
  COUNT_DATE_MAX_AGE_DAYS,
  businessToday,
  shiftDate,
} from "@/lib/inventory/count-period";
import { getCountReview, getCountSheet } from "@/lib/inventory/count-sheet";
import { formatInventoryQuantity } from "@/lib/inventory/counts";

import { COUNT_STATUS_LABEL, COUNT_STATUS_TONE } from "../../status";

export const metadata: Metadata = { title: "Count review" };

const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

/** A line is worth a look at ±1 count unit or ±$10. */
const MATERIAL_QUANTITY = 1;
const MATERIAL_VALUE = 10;

export default async function CountReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ show?: string }>;
}) {
  const { id } = await params;
  const today = businessToday();
  const { show } = await searchParams;
  const sheet = await getCountSheet(id);
  if (!sheet) notFound();
  const review = await getCountReview(id, sheet.period?.id ?? null);

  const rows = sheet.areas.flatMap((area) =>
    area.lines.map((line) => {
      const detail = review.get(line.id);
      const expected = detail?.expectedQuantity ?? 0;
      const counted = detail?.countedTotal ?? null;
      const factor = detail?.conversionFactor ?? 1;
      const unitCost = detail?.unitCost ?? 0;
      const quantityVariance = counted === null ? null : counted - expected;
      const valueVariance =
        quantityVariance === null ? null : quantityVariance * factor * unitCost;
      return {
        line,
        area,
        expected,
        counted,
        quantityVariance,
        valueVariance,
        countedValue: (counted ?? 0) * factor * unitCost,
        expectedValue: expected * factor * unitCost,
        material:
          quantityVariance !== null &&
          (Math.abs(quantityVariance) >= MATERIAL_QUANTITY ||
            Math.abs(valueVariance ?? 0) >= MATERIAL_VALUE),
        approved: detail?.approved ?? false,
      };
    }),
  );

  const uncounted = rows.filter((row) => row.counted === null).length;
  const materialRows = rows.filter((row) => row.material);
  const countedValue = rows.reduce((sum, row) => sum + row.countedValue, 0);
  const expectedValue = rows.reduce((sum, row) => sum + row.expectedValue, 0);
  const netVariance = countedValue - expectedValue;
  const showAll = show === "all";
  const visible = showAll ? rows : materialRows;
  const canApprove = sheet.status === "counted";
  const editable = ["draft", "in_progress", "counted"].includes(sheet.status);
  const title = `Review ${sheet.countType === "full" ? "full" : "spot"} count`;

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Inventory", href: "/inventory" },
          { label: "Counts", href: "/inventory/counts" },
          { label: "Count sheet", href: `/inventory/counts/${id}` },
        ]}
        title={title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {sheet.periodLabel}
            <span>· Shelf as of {dayLabel(sheet.countDate)} close</span>
            <Badge tone={COUNT_STATUS_TONE[sheet.status] ?? "neutral"}>
              {COUNT_STATUS_LABEL[sheet.status] ?? sheet.status}
            </Badge>
          </span>
        }
        actions={
          <>
            {editable && (
              <ButtonLink href={`/inventory/counts/${id}`}>
                Back to count sheet
              </ButtonLink>
            )}
            {canApprove && (
              <form action={approveInventoryCountAction.bind(null, id)}>
                <button type="submit" className={buttonClass("primary")}>
                  Approve and post
                </button>
              </form>
            )}
          </>
        }
      />
      <SectionTabs
        items={[
          {
            label: `Variances (${materialRows.length})`,
            href: `/inventory/counts/${id}/review`,
            active: !showAll,
          },
          {
            label: `All items (${rows.length})`,
            href: `/inventory/counts/${id}/review?show=all`,
            active: showAll,
          },
        ]}
      />
      <PageBody>
        {uncounted > 0 && (
          <Callout
            tone="warning"
            title={`${uncounted} item${uncounted === 1 ? "" : "s"} not counted yet`}
            action={
              <ButtonLink href={`/inventory/counts/${id}`} size="sm">
                Open count sheet
              </ButtonLink>
            }
          >
            Finish every area on the count sheet before approving. Blank items
            can be counted as zero when you finish an area.
          </Callout>
        )}
        {sheet.status === "approved" && (
          <Callout tone="good" title="Approved and posted to inventory" />
        )}
        {sheet.status !== "approved" && (
          <form
            action={setCountDateAction.bind(null, id)}
            className="flex flex-wrap items-end gap-3 rounded-lg border bg-[var(--surface-strong)] px-4 py-3 text-sm"
          >
            <label className="grid gap-1 text-xs font-medium text-[var(--muted)]">
              Count date
              <input
                type="date"
                name="count_date"
                defaultValue={sheet.countDate}
                min={shiftDate(today, -COUNT_DATE_MAX_AGE_DAYS)}
                max={today}
                className={inputClass}
              />
            </label>
            <button type="submit" className={buttonClass("secondary", "sm")}>
              Change date
            </button>
            <p className="max-w-md text-xs text-[var(--muted)]">
              The business day whose close this count records. A count taken
              before opening stands for the night before. It posts as of the end
              of that day, whenever you approve it.
            </p>
          </form>
        )}

        <StatGrid>
          <StatTile
            label="Counted value"
            value={formatMoney(countedValue, { cents: false })}
            detail={`${rows.length - uncounted} of ${rows.length} items counted`}
          />
          <StatTile
            label="Expected value"
            value={formatMoney(expectedValue, { cents: false })}
            detail="Posted on hand when the count started"
          />
          <StatTile
            label="Net variance"
            value={`${netVariance > 0 ? "+" : ""}${formatMoney(netVariance, { cents: false })}`}
            detail="Counted minus expected, at current cost"
            tone={netVariance < -MATERIAL_VALUE ? "danger" : "neutral"}
          />
          <StatTile
            label="Items to look at"
            value={materialRows.length}
            detail={`Off by ${MATERIAL_QUANTITY}+ unit or $${MATERIAL_VALUE}+`}
            tone={materialRows.length > 0 ? "warning" : "good"}
          />
        </StatGrid>

        <Panel flush>
          {visible.length === 0 ? (
            <EmptyState
              title={
                showAll ? "This count has no items" : "No items to look at"
              }
              detail={
                showAll
                  ? undefined
                  : `Every counted item is within ${MATERIAL_QUANTITY} unit and $${MATERIAL_VALUE} of expected.`
              }
              action={
                showAll ? undefined : (
                  <ButtonLink href={`/inventory/counts/${id}/review?show=all`}>
                    See all items
                  </ButtonLink>
                )
              }
            />
          ) : (
            <TableScroll>
              <table className={`${tableClass} min-w-[760px]`}>
                <thead>
                  <tr>
                    <th className={thClass}>Item</th>
                    <th className={thClass}>Area</th>
                    <th className={thNumClass}>Expected</th>
                    <th className={thNumClass}>Counted</th>
                    <th className={thNumClass}>Variance</th>
                    <th className={thNumClass}>Value</th>
                    <th className={thClass}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr
                      key={row.line.id}
                      className={row.material ? "bg-[#fdf8ee]" : undefined}
                    >
                      <td className={tdClass}>
                        <span className="font-medium">{row.line.name}</span>
                        <span className="block text-xs text-[var(--muted)]">
                          {row.line.unit}
                          {row.line.status === "recount_requested" &&
                            " · recount requested"}
                        </span>
                      </td>
                      <td className={`${tdClass} text-[var(--muted)]`}>
                        {row.area.name}
                      </td>
                      <td className={tdNumClass}>
                        {formatInventoryQuantity(row.expected)}
                      </td>
                      <td className={tdNumClass}>
                        {row.counted === null
                          ? "—"
                          : formatInventoryQuantity(row.counted)}
                      </td>
                      <td
                        className={`${tdNumClass} ${
                          row.material ? "font-semibold" : ""
                        } ${
                          (row.quantityVariance ?? 0) < 0
                            ? "text-[var(--danger)]"
                            : ""
                        }`}
                      >
                        {row.quantityVariance === null
                          ? "—"
                          : `${row.quantityVariance > 0 ? "+" : ""}${formatInventoryQuantity(row.quantityVariance)}`}
                      </td>
                      <td className={tdNumClass}>
                        {row.valueVariance === null
                          ? "—"
                          : `${row.valueVariance > 0 ? "+" : ""}${formatMoney(row.valueVariance)}`}
                      </td>
                      <td className={`${tdClass} text-right`}>
                        {editable &&
                          row.material &&
                          row.line.status !== "recount_requested" && (
                            <form
                              action={requestRecountAction.bind(
                                null,
                                row.line.id,
                              )}
                            >
                              <button
                                type="submit"
                                className={buttonClass("ghost", "sm")}
                              >
                                Recount
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
      </PageBody>
    </>
  );
}
