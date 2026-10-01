"use client";

import { Menu, X } from "lucide-react";
import { useState } from "react";

import { BrandMark } from "@/components/brand-mark";
import {
  AccountFooter,
  ManagerNavList,
} from "@/components/layout/manager-sidebar";

export function MobileManagerNav({
  organization,
  email,
}: {
  organization: string | null;
  email: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-[var(--sidebar)] px-4 lg:hidden">
        <BrandMark compact />
        <p className="min-w-0 truncate px-3 text-sm font-semibold">
          {organization ?? "Static OS"}
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex size-9 items-center justify-center rounded-md border bg-[var(--surface-strong)]"
          aria-label="Open navigation"
          aria-expanded={open}
        >
          <Menu size={18} strokeWidth={1.8} />
        </button>
      </header>
      {open && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[min(280px,85vw)] flex-col gap-5 bg-[var(--sidebar)] px-3 py-4 shadow-xl">
            <div className="flex items-center justify-between px-1">
              <BrandMark />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex size-8 items-center justify-center rounded-md"
                aria-label="Close navigation"
              >
                <X size={18} strokeWidth={1.8} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ManagerNavList onNavigate={() => setOpen(false)} />
            </div>
            <AccountFooter email={email} />
          </div>
        </div>
      )}
    </>
  );
}
