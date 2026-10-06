import { NextResponse } from "next/server";

import { localToday } from "@/lib/inventory/count-period";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  datesToSync,
  loadToastCredentials,
  openToastSession,
  syncToastDay,
  type ToastSyncResult,
} from "@/lib/toast/sync";

// Several days of orders can take a while to page through.
export const maxDuration = 300;

/**
 * Nightly Toast sales sync, called by Vercel Cron. Pulls yesterday (and
 * any days missed in the last week) for every connected location.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: connections, error } = await admin
    .from("toast_connections")
    .select("location_id, last_synced_date")
    .eq("active", true);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const today = localToday();
  const report: Array<{ locationId: string; results: ToastSyncResult[] }> = [];
  for (const connection of connections ?? []) {
    const results: ToastSyncResult[] = [];
    const dates = datesToSync(connection.last_synced_date, today);
    if (dates.length) {
      const credentials = await loadToastCredentials(
        connection.location_id,
        admin,
      );
      if (credentials) {
        let session;
        try {
          session = await openToastSession(credentials, { admin });
        } catch {
          // syncToastDay logs the login failure.
        }
        for (const date of dates) {
          const result = await syncToastDay(credentials, date, {
            trigger: "schedule",
            admin,
            session,
          });
          results.push(result);
          // Stop at the first failure so the next run retries from there.
          if (result.status === "failed") break;
        }
      }
    }
    report.push({ locationId: connection.location_id, results });
  }

  return NextResponse.json({ today, report });
}
