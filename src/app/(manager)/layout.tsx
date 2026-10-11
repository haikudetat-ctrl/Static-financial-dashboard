import { redirect } from "next/navigation";

import { AccessPending } from "@/components/layout/access-pending";
import { ManagerSidebar } from "@/components/layout/manager-sidebar";
import { MobileManagerNav } from "@/components/layout/mobile-manager-nav";
import { getUserContext } from "@/lib/auth/session";
import { localToday } from "@/lib/inventory/count-period";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import {
  getAttentionQueues,
  navigationCounts,
} from "@/lib/reporting/attention";
import {
  currentPeriod,
  periodName,
  rangeProgress,
} from "@/lib/reporting/period-range";
import { getPeriods } from "@/lib/reporting/queries";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function ManagerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const context = await getUserContext();

  if (!context) {
    redirect("/auth/login");
  }

  if (context.role === "staff") {
    redirect("/receive");
  }

  if (!context.role) {
    const admin = createAdminClient();
    const { count } = await admin
      .from("organizations")
      .select("*", { count: "exact", head: true });
    if (count === 0) {
      redirect("/setup");
    }
    return <AccessPending email={context.user.email ?? "This account"} />;
  }

  const shell = await loadShell(context.organizationId, context.locationId);

  return (
    <div className="min-h-[100dvh] lg:flex">
      <ManagerSidebar
        organization={context.organization}
        email={context.user.email ?? "Signed in"}
        {...shell}
      />
      <div className="min-w-0 flex-1">
        <MobileManagerNav
          organization={context.organization}
          email={context.user.email ?? "Signed in"}
          {...shell}
        />
        <main>{children}</main>
      </div>
    </div>
  );
}

/** Open-work counts and period progress shown in the navigation. */
async function loadShell(
  organizationId: string | null,
  preferredLocationId: string | null,
) {
  if (!organizationId) return { counts: {}, period: null };
  const locationId = await getPrimaryLocation(
    organizationId,
    preferredLocationId,
  );
  if (!locationId) return { counts: {}, period: null };
  const [queues, periods] = await Promise.all([
    getAttentionQueues(organizationId, locationId),
    getPeriods(organizationId, locationId),
  ]);
  const today = localToday();
  const current = currentPeriod(periods, today);
  const inPeriod =
    current && current.periodStart <= today && today <= current.periodEnd;
  return {
    counts: navigationCounts(queues),
    period: inPeriod
      ? {
          name: periodName(current) ?? "This period",
          ...rangeProgress(
            { start: current.periodStart, end: current.periodEnd },
            today,
          ),
          href: `/periods/${current.id}/readiness`,
        }
      : null,
  };
}
