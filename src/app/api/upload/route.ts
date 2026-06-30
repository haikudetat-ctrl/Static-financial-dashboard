import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  registerImport,
  stageImportRows,
  IMPORT_SOURCE_TYPES,
} from "@/lib/imports";
import { getUserContext } from "@/lib/auth/session";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { extractOrderMetadata, parsePlcbLineItems } from "@/lib/plcb";
import { extractPdfText } from "@/lib/plcb/pdf";
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

    // Re-extract if previous attempt never created mapping queue items
    if (result.duplicate && result.existingImportId) {
      const { data: queueItem } = await supabase
        .from("mapping_queue_items")
        .select("id")
        .eq("source_context->>import_id", result.existingImportId)
        .limit(1)
        .maybeSingle();
      if (!queueItem) {
        await supabase
          .from("source_import_rows")
          .delete()
          .eq("source_import_id", result.existingImportId);
        result.duplicate = false;
        result.importId = result.existingImportId;
      }
    }

    if (!result.duplicate && sourceType === IMPORT_SOURCE_TYPES.PLCB) {
      const text = await extractPdfText(buffer);
      const metadata = extractOrderMetadata(text);
      const lines = parsePlcbLineItems(
        text,
        metadata.orderId ?? "unknown",
        metadata.date ?? "",
        metadata.type ?? "Pickup",
        metadata.status ?? "Posted",
      );

      if (lines.length === 0) {
        await supabase
          .from("source_imports")
          .update({
            status: "failed",
            error_message:
              "No PLCB line items were found in this PDF. Confirm it is a Licensee Online Order Portal PDF.",
          })
          .eq("id", result.importId);
      } else {
        await stageImportRows(
          result.importId,
          lines.map((line, index) => ({
            rowIndex: index,
            rawData: {
              ...line,
              order_total: metadata.totalAmount ?? 0,
              total_bottles: metadata.totalBottles ?? 0,
            },
            normalizedData: {
              order_id: line.order_id,
              date: line.date,
              type: line.type,
              status: line.status,
              item_code: line.item_code,
              product_name: line.product,
              bottle_size: line.bottle_size,
              quantity_ordered: line.ordered_quantity,
              quantity_shipped: line.shipped_quantity,
              unit_price: line.unit_price,
              line_total: line.total,
            },
          })),
        );
      }
    } else if (!result.duplicate) {
      const functionName =
        sourceType === IMPORT_SOURCE_TYPES.PLCB
          ? "plcb-extract"
          : sourceType === IMPORT_SOURCE_TYPES.TOAST_PMIX ||
              sourceType === IMPORT_SOURCE_TYPES.TOAST_SALES
            ? "import-toast"
            : "extract-invoice";
      const admin = createAdminClient();
      admin.functions
        .invoke(functionName, {
          body: {
            importId: result.importId,
            filePath,
            organizationId: context.organizationId,
            locationId,
            sourceType,
          },
        })
        .catch(() => {
          // Edge function invocation is fire-and-forget;
          // extraction status updates happen inside the function.
        });
    }

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
