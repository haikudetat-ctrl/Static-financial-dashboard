"use client";

import { useTransition } from "react";

import { inputClass } from "@/components/ui";

import { setSalesMappingAction } from "../actions";

export function AccountSelect({
  field,
  value,
  accountId,
  accounts,
}: {
  field: string;
  value: string;
  accountId: string | null;
  accounts: Array<{ id: string; label: string }>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      aria-label={`Sales account for ${value}`}
      disabled={pending}
      defaultValue={accountId ?? ""}
      className={`${inputClass} h-8 min-w-48 ${accountId ? "" : "border-[var(--warning)]"}`}
      onChange={(event) => {
        const formData = new FormData();
        formData.set("match_field", field);
        formData.set("match_value", value);
        formData.set("gl_account_id", event.target.value);
        startTransition(() => setSalesMappingAction(formData));
      }}
    >
      <option value="">Not mapped</option>
      {accounts.map((account) => (
        <option key={account.id} value={account.id}>
          {account.label}
        </option>
      ))}
    </select>
  );
}
