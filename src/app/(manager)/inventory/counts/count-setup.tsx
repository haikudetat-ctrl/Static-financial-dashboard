import { CountSetupForm } from "@/components/inventory/count-setup-form";
import { SectionNav } from "@/components/layout/section-nav";
import { PageBody, PageHeader } from "@/components/ui";
import { getUserContext } from "@/lib/auth/session";
import {
  businessToday,
  findCountPeriod,
  shiftDate,
} from "@/lib/inventory/count-period";
import { getCountSetup, getPrimaryLocation } from "@/lib/inventory/queries";
import { formatPeriodLabel } from "@/lib/reporting/period-range";

type Related<T> = T | T[] | null | undefined;
const one = <T,>(value: Related<T>) =>
  (Array.isArray(value) ? value[0] : value) ?? null;

/** Shared server half of the full- and spot-count setup screens. */
export async function CountSetup({
  countType,
}: {
  countType: "full" | "spot";
}) {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) return null;
  const today = businessToday();
  const [setup, period] = await Promise.all([
    getCountSetup(context.organizationId, locationId),
    findCountPeriod(context.organizationId, locationId, today),
  ]);

  const staff = new Map<string, string>();
  staff.set(context.user.id, context.user.email ?? "You");
  for (const membership of setup.staffMemberships) {
    const member = one(
      membership.organization_memberships as Related<{
        profile_id: string;
        profiles: Related<{ name: string; email: string }>;
      }>,
    );
    if (!member) continue;
    const profile = one(member.profiles);
    staff.set(
      member.profile_id,
      profile?.name || profile?.email || "Staff member",
    );
  }

  const items = setup.storageItems.map((row) => {
    const item = one(
      row.inventory_items as Related<{
        name: string;
        category_id: string | null;
      }>,
    );
    return {
      id: row.inventory_item_id,
      name: item?.name ?? "Inventory item",
      categoryId: item?.category_id ?? null,
      storageLocationId: row.storage_location_id,
    };
  });

  const areas = setup.storageLocations.map((location) => ({
    id: location.id,
    name: location.name,
    area: location.area,
    walkOrder: location.walk_order,
    itemCount: items.filter((item) => item.storageLocationId === location.id)
      .length,
  }));

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Inventory", href: "/inventory" },
          { label: "Counts", href: "/inventory/counts" },
        ]}
        title={countType === "full" ? "New full count" : "New spot count"}
        description={
          countType === "full"
            ? "Every item in the selected areas, in shelf walk order."
            : "Check a few areas, categories or items between full counts."
        }
      />
      <SectionNav section="inventory" active="/inventory/counts" />
      <PageBody narrow>
        <CountSetupForm
          countType={countType}
          periodLabel={
            period
              ? formatPeriodLabel({
                  periodStart: period.period_start,
                  periodEnd: period.period_end,
                  fiscalYear: period.fiscal_year,
                  periodNumber: period.period_number,
                })
              : null
          }
          staff={[...staff.entries()].map(([id, name]) => ({ id, name }))}
          currentUserId={context.user.id}
          countDates={{ today, yesterday: shiftDate(today, -1) }}
          areas={areas}
          categories={countType === "spot" ? setup.categories : []}
          items={countType === "spot" ? items : []}
        />
      </PageBody>
    </>
  );
}
