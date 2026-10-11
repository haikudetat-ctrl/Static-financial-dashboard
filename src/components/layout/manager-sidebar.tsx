"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import { usePathname } from "next/navigation";

import { signOutAction } from "@/app/auth/actions";
import { BrandMark } from "@/components/brand-mark";
import { CommandMenu } from "@/components/layout/command-menu";
import { managerNavigation } from "@/lib/navigation";

const groups = ["Overview", "Operations", "Data"] as const;

export type PeriodProgress = {
  name: string;
  day: number;
  length: number;
  daysLeft: number;
  href: string;
};

export function ManagerNavList({
  onNavigate,
  counts = {},
}: {
  onNavigate?: () => void;
  /** Open items per section, keyed by href. */
  counts?: Record<string, number>;
}) {
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
                const count = counts[item.href] ?? 0;
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
                    <span className="flex-1">{item.label}</span>
                    {count > 0 && (
                      <span
                        className="rounded-full bg-[var(--accent-soft)] px-1.5 text-[11px] font-medium text-[var(--accent-strong)] tabular-nums"
                        aria-label={`${count} open`}
                      >
                        {count}
                      </span>
                    )}
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

/** How far into the current period we are, pinned above the account. */
export function PeriodProgressCard({
  period,
  onNavigate,
}: {
  period: PeriodProgress;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={period.href}
      onClick={onNavigate}
      className="block rounded-md border bg-[var(--surface-strong)] px-3 py-2.5 transition hover:border-[var(--line-strong)]"
    >
      <span className="flex items-center justify-between text-xs">
        <span className="font-medium">{period.name}</span>
        <span className="text-[var(--muted)] tabular-nums">
          Day {period.day} / {period.length}
        </span>
      </span>
      <span className="mt-2 block h-1 rounded-full bg-[var(--line)]">
        <span
          className="block h-full rounded-full bg-[var(--accent)]"
          style={{ width: `${(period.day / period.length) * 100}%` }}
        />
      </span>
      <span className="mt-1.5 block text-[11px] text-[var(--muted)]">
        {period.daysLeft === 0
          ? "Last day — time to close"
          : `${period.daysLeft} ${period.daysLeft === 1 ? "day" : "days"} to close`}
      </span>
    </Link>
  );
}

export function ManagerSidebar({
  organization,
  email,
  counts,
  period,
}: {
  organization: string | null;
  email: string;
  counts?: Record<string, number>;
  period?: PeriodProgress | null;
}) {
  return (
    <aside className="sticky top-0 hidden h-[100dvh] w-[232px] shrink-0 flex-col gap-4 border-r bg-[var(--sidebar)] px-3 py-4 lg:flex">
      <div className="px-1">
        <BrandMark />
      </div>
      <div className="rounded-md border bg-[var(--surface)] px-2.5 py-2">
        <p className="truncate text-sm font-semibold">
          {organization ?? "Workspace pending"}
        </p>
        <p className="text-[11px] text-[var(--muted)]">Manager</p>
      </div>
      <CommandMenu />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ManagerNavList counts={counts} />
      </div>
      {period && <PeriodProgressCard period={period} />}
      <AccountFooter email={email} />
    </aside>
  );
}
