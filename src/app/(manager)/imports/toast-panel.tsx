import {
  Badge,
  buttonClass,
  formatMoney,
  Panel,
  type Tone,
} from "@/components/ui";
import { localToday } from "@/lib/inventory/count-period";
import { createClient } from "@/lib/supabase/server";
import { addDays } from "@/lib/toast/sync";

import { ToastConnectForm, ToastSyncForm } from "./toast-forms";
import { disconnectToastAction, setToastAutoPostAction } from "./toast-actions";

const STATUS_TONE: Record<string, Tone> = {
  posted: "good",
  staged: "accent",
  empty: "neutral",
  skipped: "neutral",
  failed: "danger",
};

const shortDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/** Toast API connection, nightly sync status and a manual "pull a day". */
export async function ToastPanel({ locationId }: { locationId: string }) {
  const supabase = await createClient();
  const [{ data: connection }, { data: runs }] = await Promise.all([
    supabase
      .from("toast_connections")
      .select(
        "restaurant_guid, client_id, api_host, auto_post, last_synced_date, last_error, updated_at",
      )
      .eq("location_id", locationId)
      .maybeSingle(),
    supabase
      .from("toast_sync_runs")
      .select(
        "id, business_date, trigger, status, order_count, net_sales, message, started_at",
      )
      .eq("location_id", locationId)
      .order("started_at", { ascending: false })
      .limit(8),
  ]);
  const yesterday = addDays(localToday(), -1);

  return (
    <Panel
      title="Toast API"
      description={
        connection
          ? connection.last_synced_date
            ? `Synced through ${shortDate(connection.last_synced_date)} · pulls nightly at about 6 AM`
            : "Connected · first nightly pull at about 6 AM"
          : "Pull sales from Toast every night instead of uploading exports."
      }
      actions={
        connection ? (
          <Badge tone={connection.last_error ? "danger" : "good"}>
            {connection.last_error ? "Needs attention" : "Connected"}
          </Badge>
        ) : undefined
      }
      flush
    >
      {connection?.last_error && (
        <p className="border-b px-4 py-3 text-sm text-[var(--danger)]">
          {connection.last_error}
        </p>
      )}

      {connection && (
        <div className="grid gap-3 border-b px-4 py-4">
          <ToastSyncForm defaultDate={yesterday} maxDate={yesterday} />
          <form
            action={setToastAutoPostAction}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="text-[var(--muted)]">
              {connection.auto_post
                ? "Posts each day automatically."
                : "Stages each day for you to post."}
            </span>
            <input
              type="hidden"
              name="auto_post"
              value={connection.auto_post ? "false" : "true"}
            />
            <button className={buttonClass("ghost", "sm")}>
              {connection.auto_post ? "Review first" : "Auto-post"}
            </button>
          </form>
        </div>
      )}

      {runs && runs.length > 0 && (
        <ul className="border-b">
          {runs.map((run) => (
            <li
              key={run.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b px-4 py-2.5 text-sm last:border-b-0"
            >
              <span className="font-medium">
                {shortDate(run.business_date)}
              </span>
              <span className="text-right tabular-nums">
                {run.status === "posted" || run.status === "staged"
                  ? formatMoney(Number(run.net_sales))
                  : ""}
              </span>
              <span className="truncate text-xs text-[var(--muted)]">
                {run.order_count > 0 && `${run.order_count} orders · `}
                {run.message}
              </span>
              <span className="text-right">
                <Badge tone={STATUS_TONE[run.status] ?? "neutral"}>
                  {run.status}
                </Badge>
              </span>
            </li>
          ))}
        </ul>
      )}

      <details className="group px-4 py-4" open={!connection}>
        <summary className="cursor-pointer text-sm font-medium">
          {connection ? "Credentials" : "Connect Toast"}
        </summary>
        <ToastConnectForm
          connected={Boolean(connection)}
          defaults={{
            restaurantGuid: connection?.restaurant_guid ?? "",
            clientId: connection?.client_id ?? "",
            sandbox: connection?.api_host.includes("sandbox") ?? false,
            autoPost: connection?.auto_post ?? true,
          }}
        />
        {connection && (
          <form action={disconnectToastAction} className="mt-3">
            <button className={buttonClass("danger", "sm")}>Disconnect</button>
          </form>
        )}
      </details>
    </Panel>
  );
}
