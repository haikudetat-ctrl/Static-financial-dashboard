// PLCB Invoice PDF Text Extraction Edge Function
// Receives uploaded PDF path, extracts text, parses order lines.
// Called asynchronously after file upload.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

interface ExtractionRequest {
  importId: string;
  filePath: string;
  organizationId: string;
  locationId: string;
}

interface PlcbLineItem {
  itemCode: string;
  product: string;
  bottleSize: string;
  orderedQty: number;
  shippedQty: number;
  unitPrice: number;
  lineTotal: number;
}

serve(async (req) => {
  try {
    const {
      importId,
      filePath,
      organizationId,
      locationId,
    }: ExtractionRequest = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update status to extracting
    await supabase
      .from("source_imports")
      .update({ status: "extracting" })
      .eq("id", importId);

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("source-documents")
      .download(filePath);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message}`);
    }

    // Extract text from PDF (basic approach — returns raw text)
    const pdfBytes = await fileData.arrayBuffer();
    const text = await extractTextFromPdf(pdfBytes);

    // Parse order metadata and line items
    const metadata = extractOrderMetadata(text);
    const lines = parseLineItems(text, metadata.orderId, metadata.date);

    // Update import status
    await supabase
      .from("source_imports")
      .update({ status: "extracted", row_count: lines.length })
      .eq("id", importId);

    // Stage rows
    if (lines.length > 0) {
      const rows = lines.map((line, index) => ({
        source_import_id: importId,
        row_index: index,
        raw_data: line,
        normalized_data: {
          item_code: line.itemCode,
          product_name: line.product,
          bottle_size: line.bottleSize,
          quantity_ordered: line.orderedQty,
          quantity_shipped: line.shippedQty,
          unit_price: line.unitPrice,
          line_total: line.lineTotal,
        },
        status: "staged",
      }));

      await supabase.from("source_import_rows").insert(rows);

      await supabase
        .from("source_imports")
        .update({ status: "staged" })
        .eq("id", importId);
    }

    return new Response(
      JSON.stringify({ success: true, lineCount: lines.length }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Extraction failed";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

// Simple PDF text extraction (works for text-based PDFs like PLCB invoices)
async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  // For PLCB invoices, the PDFs contain extractable text.
  // In production, use a PDF parsing library.
  // For now, return a placeholder. The actual extraction is done
  // by reading the PDF's text content.
  const decoder = new TextDecoder("utf-8");
  const text = decoder.decode(buffer);

  // Simple heuristic: extract content between stream/endstream markers
  const textContent: string[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    // Look for text showing operators in PDF
    const textMatch = line.match(/\(([^)]*)\)\s*Tj/);
    if (textMatch) {
      textContent.push(textMatch[1]);
    }
  }

  return textContent.join("\n");
}

function extractOrderMetadata(text: string) {
  const orderIdMatch = text.match(
    /(?:Order|ORD|Order\s+#?)\s*[#]?\s*(\d{6,})/i,
  );
  const dateMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const typeMatch = text.match(/(Pickup|Special\s*Order)/i);

  return {
    orderId: orderIdMatch?.[1] ?? "unknown",
    date: dateMatch
      ? `${dateMatch[3]}-${dateMatch[1].padStart(2, "0")}-${dateMatch[2].padStart(2, "0")}`
      : "",
    type: typeMatch?.[1] ?? "Pickup",
  };
}

function parseLineItems(
  text: string,
  orderId: string,
  date: string,
): PlcbLineItem[] {
  const items: PlcbLineItem[] = [];
  const lines = text.split("\n");

  // Pattern: item code + product name + size + qty ordered + qty shipped + unit price + total
  const lineItemPattern =
    /^(\S+(?:\s+\S+)?)\s+(.+?)\s+(\d+\s*(?:ml|L|oz|gal|qt|pt|cl)?)\s+(\d+)\s+(\d+)\s+\$?([\d,]+\.\d{2})\s+\$?([\d,]+\.\d{2})/i;

  for (const line of lines) {
    const match = line.trim().match(lineItemPattern);
    if (match) {
      items.push({
        itemCode: match[1].trim(),
        product: match[2].trim(),
        bottleSize: match[3].trim(),
        orderedQty: parseInt(match[4], 10),
        shippedQty: parseInt(match[5], 10),
        unitPrice: parseFloat(match[6].replace(",", "")),
        lineTotal: parseFloat(match[7].replace(",", "")),
      });
    }
  }

  return items;
}
