"use client";

import { usePathname, useRouter } from "next/navigation";

import { inputClass } from "@/components/ui";

export function PeriodPicker({
  periods,
  value,
}: {
  periods: Array<{ id: string; label: string }>;
  value: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <select
      aria-label="Reporting period"
      className={`${inputClass} w-auto min-w-52`}
      value={value ?? ""}
      onChange={(event) => {
        const period = event.target.value;
        router.push(period ? `${pathname}?period=${period}` : pathname);
      }}
    >
      {!value && <option value="">Custom range</option>}
      {periods.map((period) => (
        <option key={period.id} value={period.id}>
          {period.label}
        </option>
      ))}
    </select>
  );
}
