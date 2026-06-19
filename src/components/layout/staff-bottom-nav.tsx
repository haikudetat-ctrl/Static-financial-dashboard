"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { staffNavigation } from "@/lib/navigation";

export function StaffBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-[#20241f] px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] text-white shadow-[0_-10px_30px_rgba(32,36,31,.12)]"
      aria-label="Staff task navigation"
    >
      {staffNavigation.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[10px] font-medium transition active:scale-[0.98] ${
              active ? "text-[#f1aa72]" : "text-[#b7bcb4]"
            }`}
          >
            <Icon size={21} strokeWidth={1.7} aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
