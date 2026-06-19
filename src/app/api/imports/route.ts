import { NextResponse } from "next/server";
import { getUserContext } from "@/lib/auth/session";
import { getImports, updateImportStatus } from "@/lib/imports";

export async function GET(request: Request) {
  const context = await getUserContext();
  if (!context?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const sourceType = url.searchParams.get("sourceType") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const limit = url.searchParams.get("limit")
    ? parseInt(url.searchParams.get("limit")!)
    : undefined;

  const imports = await getImports(context.organizationId, {
    sourceType,
    status,
    limit,
  });

  return NextResponse.json({ imports });
}

export async function PATCH(request: Request) {
  const context = await getUserContext();
  if (!context?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { importId, status, errorMessage } = body;

  if (!importId || !status) {
    return NextResponse.json(
      { error: "importId and status required" },
      { status: 400 },
    );
  }

  await updateImportStatus(importId, status, errorMessage);
  return NextResponse.json({ success: true });
}
