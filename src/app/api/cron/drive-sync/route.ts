import { NextResponse } from "next/server";

import { readServiceAccount } from "@/lib/google/drive";
import { loadDriveSource, syncDriveSource } from "@/lib/drive/sync";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

/**
 * Nightly Drive inbox sync, called by Vercel Cron, so files filed during
 * the day are waiting in the inbox in the morning.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!readServiceAccount()) {
    return NextResponse.json({ skipped: "Drive isn't connected." });
  }

  const admin = createAdminClient();
  const { data: sources, error } = await admin
    .from("drive_sources")
    .select("location_id")
    .eq("active", true);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const report = [];
  for (const { location_id } of sources ?? []) {
    const source = await loadDriveSource(location_id, admin);
    if (!source) continue;
    try {
      report.push({
        locationId: location_id,
        ...(await syncDriveSource(source, { admin })),
      });
    } catch (syncError) {
      report.push({
        locationId: location_id,
        error: syncError instanceof Error ? syncError.message : "Sync failed.",
      });
    }
  }
  return NextResponse.json({ report });
}
