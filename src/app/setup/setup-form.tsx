"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { setupOrganizationAction, type SetupState } from "./actions";

const initialState: SetupState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-12 bg-[var(--foreground)] px-5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "Creating\u2026" : "Create organization"}
    </button>
  );
}

export function SetupForm() {
  const [state, action] = useActionState(setupOrganizationAction, initialState);

  return (
    <form
      action={action}
      className="grid gap-5 border bg-[var(--surface-strong)] p-6 sm:p-8"
    >
      <label className="grid gap-2 text-sm font-semibold">
        Organization name
        <input
          name="organization_name"
          type="text"
          required
          placeholder="e.g. The Bronze Door"
          className="h-12 border bg-white px-3 text-base font-normal"
          aria-invalid={Boolean(state.errors?.organization_name)}
        />
        {state.errors?.organization_name && (
          <span className="text-xs text-[#a63f2f]">
            {state.errors.organization_name}
          </span>
        )}
      </label>
      <label className="grid gap-2 text-sm font-semibold">
        Location name
        <input
          name="location_name"
          type="text"
          required
          placeholder="e.g. Main Bar"
          className="h-12 border bg-white px-3 text-base font-normal"
          aria-invalid={Boolean(state.errors?.location_name)}
        />
        {state.errors?.location_name && (
          <span className="text-xs text-[#a63f2f]">
            {state.errors.location_name}
          </span>
        )}
      </label>
      {state.message && (
        <p
          role="status"
          className="border-l-2 border-[var(--accent)] bg-[#f6eee7] px-3 py-2.5 text-sm leading-6 text-[#713d20]"
        >
          {state.message}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}
