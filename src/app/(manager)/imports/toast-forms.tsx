"use client";

import { useActionState } from "react";

import { buttonClass, inputClass, labelClass } from "@/components/ui";

import {
  saveToastConnectionAction,
  syncToastDateAction,
  type ToastFormState,
} from "./toast-actions";

function Message({ state }: { state: ToastFormState }) {
  if (!state.message) return null;
  return (
    <p
      role="status"
      className={`text-sm ${state.ok ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
    >
      {state.message}
    </p>
  );
}

export function ToastConnectForm({
  connected,
  defaults,
}: {
  connected: boolean;
  defaults: {
    restaurantGuid: string;
    clientId: string;
    sandbox: boolean;
    autoPost: boolean;
  };
}) {
  const [state, action, pending] = useActionState<ToastFormState, FormData>(
    saveToastConnectionAction,
    {},
  );
  return (
    <form action={action} className="mt-3 grid gap-3">
      <p className="text-xs text-[var(--muted)]">
        In Toast Web, open Integrations → Toast API access → Manage credentials
        and copy your credential&apos;s client ID and secret (its name
        doesn&apos;t matter). The restaurant GUID is listed with the
        credential&apos;s locations.
      </p>
      <label className={labelClass}>
        Restaurant GUID
        <input
          name="restaurant_guid"
          required
          defaultValue={defaults.restaurantGuid}
          autoComplete="off"
          spellCheck={false}
          className={`${inputClass} font-mono text-xs`}
          placeholder="1a2b3c4d-5e6f-…"
        />
      </label>
      <label className={labelClass}>
        Client ID
        <input
          name="client_id"
          required
          defaultValue={defaults.clientId}
          autoComplete="off"
          spellCheck={false}
          className={`${inputClass} font-mono text-xs`}
        />
      </label>
      <label className={labelClass}>
        Client secret
        <input
          name="client_secret"
          type="password"
          required={!connected}
          autoComplete="new-password"
          className={inputClass}
          placeholder={connected ? "Leave blank to keep the saved secret" : ""}
        />
      </label>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="auto_post"
            defaultChecked={defaults.autoPost}
          />
          Post each day automatically
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="environment"
            value="sandbox"
            defaultChecked={defaults.sandbox}
          />
          Sandbox
        </label>
      </div>
      <Message state={state} />
      <button
        disabled={pending}
        className={`${buttonClass("primary")} justify-self-start`}
      >
        {pending ? "Checking…" : connected ? "Save and test" : "Connect"}
      </button>
    </form>
  );
}

export function ToastSyncForm({
  defaultDate,
  maxDate,
}: {
  defaultDate: string;
  maxDate: string;
}) {
  const [state, action, pending] = useActionState<ToastFormState, FormData>(
    syncToastDateAction,
    {},
  );
  return (
    <form action={action} className="grid gap-2">
      <div className="flex items-end gap-2">
        <label className={`${labelClass} flex-1`}>
          Pull a business day
          <input
            type="date"
            name="business_date"
            required
            defaultValue={defaultDate}
            max={maxDate}
            className={inputClass}
          />
        </label>
        <button disabled={pending} className={buttonClass("secondary")}>
          {pending ? "Pulling…" : "Pull"}
        </button>
      </div>
      <Message state={state} />
    </form>
  );
}
