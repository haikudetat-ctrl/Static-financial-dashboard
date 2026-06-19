import { redirect } from "next/navigation";

import { AccessPending } from "@/components/layout/access-pending";
import { ManagerSidebar } from "@/components/layout/manager-sidebar";
import { MobileManagerNav } from "@/components/layout/mobile-manager-nav";
import { getUserContext } from "@/lib/auth/session";
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

  return (
    <div className="min-h-[100dvh] lg:flex">
      <ManagerSidebar
        organization={context.organization}
        email={context.user.email ?? "Signed in"}
      />
      <div className="min-w-0 flex-1">
        <MobileManagerNav />
        <main>{children}</main>
      </div>
    </div>
  );
}
