"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import { usePathname } from "next/navigation";

import { signOutAction } from "@/app/auth/actions";
import { BrandMark } from "@/components/brand-mark";
import { managerNavigation } from "@/lib/navigation";

const groups = ["Overview", "Operations", "Data"] as const;

export function ManagerNavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="grid gap-5" aria-label="Manager navigation">
      {groups.map((group) => (
        <div key={group}>
          <p className="px-2.5 pb-1.5 text-[11px] font-medium text-[var(--muted)]">
            {group}
          </p>
          <div className="grid gap-0.5">
            {managerNavigation
              .filter((item) => item.group === group)
              .map((item) => {
                const section = item.href.split("/")[1];
                const active =
                  pathname === item.href ||
                  pathname.startsWith(`/${section}/`) ||
                  pathname === `/${section}`;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm transition ${
                      active
                        ? "bg-[var(--surface-strong)] font-semibold text-[var(--foreground)] shadow-[0_1px_0_var(--line-strong)]"
                        : "text-[#585e56] hover:bg-white/60 hover:text-[var(--foreground)]"
                    }`}
                  >
                    <Icon
                      size={16}
                      strokeWidth={1.8}
                      aria-hidden="true"
                      className={active ? "text-[var(--accent)]" : ""}
                    />
                    {item.label}
                  </Link>
                );
              })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function AccountFooter({ email }: { email: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-t pt-3">
      <p className="min-w-0 truncate text-xs text-[var(--muted)]">{email}</p>
      <form action={signOutAction}>
        <button
          type="submit"
          className="inline-flex size-8 items-center justify-center rounded-md text-[var(--muted)] transition hover:bg-white/60 hover:text-[var(--foreground)]"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut size={15} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}

export function ManagerSidebar({
  organization,
  email,
}: {
  organization: string | null;
  email: string;
}) {
  return (
    <aside className="sticky top-0 hidden h-[100dvh] w-[232px] shrink-0 flex-col gap-5 border-r bg-[var(--sidebar)] px-3 py-4 lg:flex">
      <div className="px-1">
        <BrandMark />
      </div>
      <div className="rounded-md border bg-[var(--surface)] px-2.5 py-2">
        <p className="truncate text-sm font-semibold">
          {organization ?? "Workspace pending"}
        </p>
        <p className="text-[11px] text-[var(--muted)]">Manager</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ManagerNavList />
      </div>
      <AccountFooter email={email} />
    </aside>
  );
}
