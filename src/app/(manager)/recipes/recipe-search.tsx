"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { inputClass } from "@/components/ui";

/** Filters the recipe library by name, keeping the selected tab. */
export function RecipeSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(initial);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (value === (params.get("q") ?? "")) return;
      const next = new URLSearchParams(params);
      if (value) next.set("q", value);
      else next.delete("q");
      router.replace(`${pathname}?${next.toString()}`);
    }, 250);
    return () => clearTimeout(handle);
  }, [value, params, pathname, router]);

  return (
    <div className="relative w-56">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-[var(--muted)]"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search recipes"
        aria-label="Search recipes"
        className={`${inputClass} pl-8`}
      />
    </div>
  );
}
