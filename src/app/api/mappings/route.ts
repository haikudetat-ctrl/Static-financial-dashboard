import { NextResponse } from "next/server";
import { getUserContext } from "@/lib/auth/session";
import {
  getMappingQueue,
  confirmMapping,
  skipMapping,
  bulkConfirmMapping,
} from "@/lib/imports/mapping";
import type { MappingQueueType } from "@/lib/types";

export async function GET(request: Request) {
  const context = await getUserContext();
  if (!context?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const queueType = url.searchParams.get("queueType") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const limit = url.searchParams.get("limit")
    ? parseInt(url.searchParams.get("limit")!)
    : undefined;

  const items = await getMappingQueue(context.organizationId, {
    queueType: queueType as MappingQueueType | undefined,
    status,
    limit,
  });

  return NextResponse.json({ items });
}

export async function PATCH(request: Request) {
  const context = await getUserContext();
  if (!context?.organizationId || !context.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { action, queueItemId, confirmedMatchId, confirmedMatchType, ids } =
    body;

  if (action === "confirm" && queueItemId && confirmedMatchId) {
    await confirmMapping(
      queueItemId,
      confirmedMatchId,
      confirmedMatchType,
      context.user.id,
    );
    return NextResponse.json({ success: true });
  }

  if (action === "skip" && queueItemId) {
    await skipMapping(queueItemId, context.user.id);
    return NextResponse.json({ success: true });
  }

  if (action === "bulk-confirm" && Array.isArray(ids) && ids.length > 0) {
    const result = await bulkConfirmMapping(ids, context.user.id);
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
