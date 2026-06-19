import { LogOut } from "lucide-react";

import { signOutAction } from "@/app/auth/actions";
import { BrandMark } from "@/components/brand-mark";
import { AccessPending } from "@/components/layout/access-pending";
import { StaffBottomNav } from "@/components/layout/staff-bottom-nav";
import { getUserContext } from "@/lib/auth/session";

export default async function StaffLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const context = await getUserContext();

  if (!context) {
    return null;
  }

  if (!context.role) {
    return <AccessPending email={context.user.email ?? "This account"} />;
  }

  return (
    <div className="min-h-[100dvh] bg-[var(--surface)] pb-20">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-[var(--surface)] px-4">
        <BrandMark compact />
        <div className="min-w-0 text-right">
          <p className="truncate text-xs font-semibold">
            {context.organization ?? "Static OS"}
          </p>
          <form action={signOutAction}>
            <button className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--muted)]">
              <LogOut size={12} strokeWidth={1.7} aria-hidden="true" />
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main>{children}</main>
      <StaffBottomNav />
    </div>
  );
}
