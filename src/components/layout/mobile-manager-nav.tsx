import Link from "next/link";
import { Menu } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";

export function MobileManagerNav() {
  return (
    <header className="flex h-16 items-center justify-between border-b bg-[var(--surface)] px-4 lg:hidden">
      <BrandMark />
      <Link
        href="/today"
        className="inline-flex size-10 items-center justify-center border bg-white"
        aria-label="Open manager home"
      >
        <Menu size={19} strokeWidth={1.7} />
      </Link>
    </header>
  );
}
