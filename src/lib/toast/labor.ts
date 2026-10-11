import { createAdminClient } from "@/lib/supabase/admin";
import { ToastApiError, toToastDate } from "@/lib/toast/api";
import {
  openToastSession,
  type ToastConnectionCredentials,
  type ToastSession,
} from "@/lib/toast/sync";

/*
 * Hourly labor from the Toast Labor API. Toast knows clocked hours and the
 * hourly wage on each shift; it does not know salaries, payroll taxes or
 * benefits, so those stay manual P&L entries. Each business day posts one
 * hourly-wage entry, replaced (never duplicated) when the day is re-pulled.
 */

/** Overtime pay rate over the shift's hourly wage (FLSA time-and-a-half). */
export const OVERTIME_MULTIPLIER = 1.5;

type Admin = ReturnType<typeof createAdminClient>;
type Reference = { guid?: string | null } | null | undefined;

export type ToastTimeEntry = {
  guid: string;
  businessDate?: string | null;
  inDate?: string | null;
  outDate?: string | null;
  employeeReference?: Reference;
  jobReference?: Reference;
  regularHours?: number | null;
  overtimeHours?: number | null;
  hourlyWage?: number | null;
  declaredCashTips?: number | null;
  nonCashTips?: number | null;
  deleted?: boolean | null;
};

export type ToastJob = {
  guid: string;
  title?: string | null;
  deleted?: boolean | null;
};

export type LaborRow = {
  time_entry_guid: string;
  employee_guid: string | null;
  job_guid: string | null;
  job_title: string;
  in_at: string | null;
  out_at: string | null;
  regular_hours: number;
  overtime_hours: number;
  hourly_wage: number | null;
  wage_cost: number;
  declared_cash_tips: number;
  non_cash_tips: number;
};

export type LaborSummary = {
  rows: LaborRow[];
  regularHours: number;
  overtimeHours: number;
  wageCost: number;
};

const money = (value: number) => Math.round(value * 100) / 100;
const num = (value: number | null | undefined) => Number(value ?? 0) || 0;

/** Turns a day's time entries into rows and totals; deleted shifts drop out. */
export function summarizeTimeEntries(
  entries: ToastTimeEntry[],
  jobs: Map<string, string>,
): LaborSummary {
  const rows = entries
    .filter((entry) => !entry.deleted)
    .map((entry): LaborRow => {
      const regular = num(entry.regularHours);
      const overtime = num(entry.overtimeHours);
      const wage =
        entry.hourlyWage === null || entry.hourlyWage === undefined
          ? null
          : Number(entry.hourlyWage);
      const jobGuid = entry.jobReference?.guid ?? null;
      return {
        time_entry_guid: entry.guid,
        employee_guid: entry.employeeReference?.guid ?? null,
        job_guid: jobGuid,
        job_title: (jobGuid && jobs.get(jobGuid)) || "",
        in_at: entry.inDate ?? null,
        out_at: entry.outDate ?? null,
        regular_hours: regular,
        overtime_hours: overtime,
        hourly_wage: wage,
        wage_cost: money(
          (wage ?? 0) * (regular + overtime * OVERTIME_MULTIPLIER),
        ),
        declared_cash_tips: money(num(entry.declaredCashTips)),
        non_cash_tips: money(num(entry.nonCashTips)),
      };
    });
  return {
    rows,
    regularHours: rows.reduce((total, row) => total + row.regular_hours, 0),
    overtimeHours: rows.reduce((total, row) => total + row.overtime_hours, 0),
    wageCost: money(rows.reduce((total, row) => total + row.wage_cost, 0)),
  };
}

/** The source key of a day's hourly-wage P&L entry. */
export const laborEntryRef = (businessDate: string) =>
  `toast-labor:${businessDate}`;

export type LaborSyncResult = {
  businessDate: string;
  ok: boolean;
  shifts: number;
  hours: number;
  wageCost: number;
  message: string;
};

/** Labor endpoints on a signed-in Toast session. */
function laborClient(session: ToastSession) {
  return {
    timeEntries: (date: string) =>
      session.client.get<ToastTimeEntry[]>(
        `/labor/v1/timeEntries?businessDate=${toToastDate(date)}`,
      ),
    jobs: async () => {
      const jobs = await session.client.get<ToastJob[]>("/labor/v1/jobs");
      return new Map(
        jobs
          .filter((job) => job.guid && job.title)
          .map((job) => [job.guid, job.title as string]),
      );
    },
  };
}

const describeLaborError = (error: unknown) =>
  error instanceof ToastApiError &&
  (error.status === 401 || error.status === 403)
    ? "Toast refused the labor data. The API credential needs Labor read access — turn it on for this client in Toast Web under Integrations → Toast API access, then pull again."
    : error instanceof Error
      ? error.message
      : "Toast labor pull failed.";

/**
 * Pulls one business day of time entries, saves the shifts, and posts the
 * day's hourly wages to the P&L. Pass `jobs` to reuse job titles across days.
 */
export async function syncToastLaborDay(
  connection: ToastConnectionCredentials,
  businessDate: string,
  {
    admin = createAdminClient(),
    session,
    jobs,
  }: {
    admin?: Admin;
    session?: ToastSession;
    jobs?: Map<string, string>;
  } = {},
): Promise<LaborSyncResult> {
  const fail = (message: string): LaborSyncResult => ({
    businessDate,
    ok: false,
    shifts: 0,
    hours: 0,
    wageCost: 0,
    message,
  });
  try {
    const live = session ?? (await openToastSession(connection, { admin }));
    const labor = laborClient(live);
    const [entries, jobTitles] = await Promise.all([
      labor.timeEntries(businessDate),
      jobs ?? labor.jobs().catch(() => new Map<string, string>()),
    ]);
    const summary = summarizeTimeEntries(entries, jobTitles);
    await saveLaborDay(admin, connection, businessDate, summary);
    const hours = summary.regularHours + summary.overtimeHours;
    return {
      businessDate,
      ok: true,
      shifts: summary.rows.length,
      hours,
      wageCost: summary.wageCost,
      message: `labor ${summary.rows.length} shifts, ${hours.toFixed(1)} h, $${summary.wageCost.toFixed(2)} hourly wages`,
    };
  } catch (error) {
    return fail(describeLaborError(error));
  }
}

async function saveLaborDay(
  admin: Admin,
  connection: ToastConnectionCredentials,
  businessDate: string,
  summary: LaborSummary,
) {
  const scope = {
    organization_id: connection.organizationId,
    location_id: connection.locationId,
  };
  const check = ({ error }: { error: { message: string } | null }) => {
    if (error) throw new Error(error.message);
  };

  check(
    await admin
      .from("toast_time_entries")
      .delete()
      .eq("location_id", connection.locationId)
      .eq("business_date", businessDate),
  );
  if (summary.rows.length) {
    check(
      await admin.from("toast_time_entries").insert(
        summary.rows.map((row) => ({
          ...scope,
          business_date: businessDate,
          ...row,
        })),
      ),
    );
  }
  check(
    await admin.from("toast_labor_days").upsert(
      {
        ...scope,
        business_date: businessDate,
        entry_count: summary.rows.length,
        regular_hours: summary.regularHours,
        overtime_hours: summary.overtimeHours,
        wage_cost: summary.wageCost,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "location_id,business_date" },
    ),
  );

  // Replace the day's hourly-wage entry on the P&L.
  const ref = laborEntryRef(businessDate);
  check(
    await admin
      .from("pl_entries")
      .delete()
      .eq("location_id", connection.locationId)
      .eq("source_ref", ref),
  );
  if (summary.wageCost === 0) return;
  const { data: account, error } = await admin
    .from("gl_accounts")
    .select("id")
    .eq("organization_id", connection.organizationId)
    .eq("system_key", "hourly_wages")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!account) {
    throw new Error(
      "Saved the shifts, but there is no hourly wages account to post them to.",
    );
  }
  const hours = summary.regularHours + summary.overtimeHours;
  check(
    await admin.from("pl_entries").insert({
      ...scope,
      gl_account_id: account.id,
      entry_date: businessDate,
      amount: summary.wageCost,
      memo: `Toast hourly wages · ${summary.rows.length} shifts · ${hours.toFixed(1)} h`,
      source_type: "payroll_import",
      source_ref: ref,
      created_by: connection.actingProfileId,
    }),
  );
}

/** The last business day whose labor has been pulled, if any. */
export async function lastLaborDate(admin: Admin, locationId: string) {
  const { data } = await admin
    .from("toast_labor_days")
    .select("business_date")
    .eq("location_id", locationId)
    .order("business_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.business_date as string | undefined) ?? null;
}
