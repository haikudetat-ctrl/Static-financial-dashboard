"use client";

import { useActionState, useEffect, useRef } from "react";

import { buttonClass, inputClass, labelClass } from "@/components/ui";

import { createExpenseAction, type ExpenseFormState } from "../actions";

type AccountOption = { id: string; label: string; group: string };

export function ExpenseForm({
  accounts,
  defaultDate,
}: {
  accounts: AccountOption[];
  defaultDate: string;
}) {
  const [state, action, pending] = useActionState<ExpenseFormState, FormData>(
    createExpenseAction,
    {},
  );
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.ok || !form.current) return;
    const amount = form.current.elements.namedItem("amount");
    const memo = form.current.elements.namedItem("memo");
    if (amount instanceof HTMLInputElement) {
      amount.value = "";
      amount.focus();
    }
    if (memo instanceof HTMLInputElement) memo.value = "";
  }, [state.ok]);

  const groups = [...new Set(accounts.map((account) => account.group))];

  return (
    <form ref={form} action={action} className="grid gap-3">
      <label className={labelClass}>
        Account
        <select
          name="gl_account_id"
          required
          className={inputClass}
          defaultValue=""
        >
          <option value="" disabled>
            Choose an account
          </option>
          {groups.map((group) => (
            <optgroup key={group} label={group}>
              {accounts
                .filter((account) => account.group === group)
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}>
          Date
          <input
            name="entry_date"
            type="date"
            required
            defaultValue={defaultDate}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Amount
          <input
            name="amount"
            inputMode="decimal"
            required
            placeholder="0.00"
            className={`${inputClass} text-right tabular-nums`}
          />
        </label>
      </div>
      <label className={labelClass}>
        Memo
        <input
          name="memo"
          placeholder="e.g. PECO electric, Sept"
          className={inputClass}
        />
      </label>
      {state.error && (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {state.error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className={buttonClass("primary")}
        >
          {pending ? "Saving…" : "Add entry"}
        </button>
        {state.ok && !pending && (
          <span className="text-xs text-[var(--success)]" role="status">
            Saved
          </span>
        )}
      </div>
    </form>
  );
}
