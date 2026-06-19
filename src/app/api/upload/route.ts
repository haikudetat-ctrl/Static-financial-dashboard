import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { registerImport } from "@/lib/imports";
import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import crypto from "node:crypto";

export async function POST(request: Request) {
  const context = await getUserContext();
  if (!context || !context.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const sourceType = String(formData.get("sourceType") ?? "");
  const parserVersion = String(formData.get("parserVersion") ?? "1.0.0");

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!sourceType) {
    return NextResponse.json(
      { error: "No source type provided" },
      { status: 400 },
    );
  }

  try {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");

    const supabase = await createClient();

    // Build storage path: <organization_id>/<location_id>/<source_type>/<filename>
    const locationId = await getPrimaryLocation(
      context.organizationId,
      context.locationId,
    );
    if (!locationId) {
      return NextResponse.json(
        { error: "No location is configured." },
        { status: 400 },
      );
    }
    const filePath = `${context.organizationId}/${locationId}/${sourceType}/${Date.now()}_${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("source-documents")
      .upload(filePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const result = await registerImport({
      fileHash,
      fileName: file.name,
      filePath,
      sourceType,
      organizationId: context.organizationId,
      locationId,
      parserVersion,
    });

    return NextResponse.json({
      importId: result.importId,
      duplicate: result.duplicate,
      fileName: file.name,
      fileHash,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
