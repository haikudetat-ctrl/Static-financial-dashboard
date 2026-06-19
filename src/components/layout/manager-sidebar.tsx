"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import { usePathname } from "next/navigation";

import { signOutAction } from "@/app/auth/actions";
import { BrandMark } from "@/components/brand-mark";
import { managerNavigation } from "@/lib/navigation";

export function ManagerSidebar({
  organization,
  email,
}: {
  organization: string | null;
  email: string;
}) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-[100dvh] w-[256px] shrink-0 border-r bg-[#e9e6de] p-5 lg:flex lg:flex-col">
      <BrandMark />
      <div className="mt-10 border-y py-4">
        <p className="font-mono text-[9px] tracking-[0.14em] text-[var(--muted)] uppercase">
          Organization
        </p>
        <p className="mt-1 truncate text-sm font-semibold">
          {organization ?? "Workspace pending"}
        </p>
      </div>
      <nav className="mt-5 grid gap-1" aria-label="Manager navigation">
        {managerNavigation.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group grid min-h-11 grid-cols-[20px_1fr] items-center gap-3 border-l-2 px-3 text-sm transition active:translate-y-px ${
                active
                  ? "border-[var(--accent)] bg-[var(--surface)] font-semibold text-[var(--foreground)]"
                  : "border-transparent text-[#62685f] hover:bg-white/55 hover:text-[var(--foreground)]"
              }`}
            >
              <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto border-t pt-4">
        <p className="truncate text-xs font-medium">{email}</p>
        <form action={signOutAction}>
          <button
            type="submit"
            className="mt-3 inline-flex min-h-10 w-full items-center gap-2 text-left text-xs font-semibold text-[var(--muted)] transition hover:text-[var(--foreground)] active:translate-y-px"
          >
            <LogOut size={15} strokeWidth={1.7} aria-hidden="true" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
