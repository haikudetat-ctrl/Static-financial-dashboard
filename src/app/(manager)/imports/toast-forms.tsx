"use client";

import { type FormEvent, useActionState, useState } from "react";

import {
  buttonClass,
  formatMoney,
  inputClass,
  labelClass,
} from "@/components/ui";

import {
  pullToastDayAction,
  refreshToastViewsAction,
  saveToastConnectionAction,
  type ToastDayResult,
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

const MAX_RANGE_DAYS = 70;

function datesBetween(from: string, to: string) {
  const dates: string[] = [];
  const day = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (day <= end && dates.length <= MAX_RANGE_DAYS) {
    dates.push(day.toISOString().slice(0, 10));
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return dates;
}

/** Pull one day or a whole range (e.g. a past period), a day at a time. */
export function ToastSyncForm({
  defaultDate,
  maxDate,
}: {
  defaultDate: string;
  maxDate: string;
}) {
  const [from, setFrom] = useState(defaultDate);
  const [to, setTo] = useState(defaultDate);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ToastDayResult[]>([]);
  const [error, setError] = useState("");

  async function run(event: FormEvent) {
    event.preventDefault();
    setError("");
    const dates = datesBetween(from, to);
    if (!dates.length) return setError("The start date is after the end date.");
    if (dates.length > MAX_RANGE_DAYS) {
      return setError(`Pull at most ${MAX_RANGE_DAYS} days at a time.`);
    }
    setRunning(true);
    setResults([]);
    for (const date of dates) {
      const result = await pullToastDayAction(date);
      setResults((previous) => [...previous, result]);
      // Credentials or access problems won't fix themselves on the next day.
      if (result.status === "failed" && /login|refused/i.test(result.message)) {
        break;
      }
    }
    await refreshToastViewsAction();
    setRunning(false);
  }

  const posted = results.filter((result) => result.status === "posted");
  const failed = results.filter((result) => result.status === "failed");
  const total = datesBetween(from, to).length;

  return (
    <form onSubmit={run} className="grid gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className={`${labelClass} min-w-32 flex-1`}>
          Pull business days from
          <input
            type="date"
            required
            value={from}
            max={maxDate}
            onChange={(event) => setFrom(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className={`${labelClass} min-w-32 flex-1`}>
          to
          <input
            type="date"
            required
            value={to}
            min={from}
            max={maxDate}
            onChange={(event) => setTo(event.target.value)}
            className={inputClass}
          />
        </label>
        <button disabled={running} className={buttonClass("secondary")}>
          {running ? `Pulling ${results.length + 1} of ${total}…` : "Pull"}
        </button>
      </div>
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      {results.length > 0 && (
        <div role="status" className="grid gap-1 text-sm">
          <p
            className={
              failed.length ? "text-[var(--danger)]" : "text-[var(--success)]"
            }
          >
            {posted.length} posted ·{" "}
            {formatMoney(
              posted.reduce((sum, result) => sum + result.netSales, 0),
            )}{" "}
            net sales
            {failed.length > 0 && ` · ${failed.length} failed`}
          </p>
          <ul className="max-h-40 overflow-y-auto text-xs text-[var(--muted)]">
            {results.map((result) => (
              <li key={result.date}>
                {result.date}: {result.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
