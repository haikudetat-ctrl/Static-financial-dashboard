import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

interface ExtractionRequest {
  importId: string;
  filePath: string;
  organizationId: string;
  locationId: string;
}

interface InvoiceLine {
  vendorProductCode: string;
  productDescription: string;
  packSize: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface InvoiceMetadata {
  invoiceNumber: string;
  invoiceDate: string;
  vendorName: string;
  totalAmount: number;
  discountAmount: number;
  taxAmount: number;
  freightAmount: number;
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

    await supabase
      .from("source_imports")
      .update({ status: "extracting" })
      .eq("id", importId);

    const { data: fileData, error: downloadError } = await supabase.storage
      .from("source-documents")
      .download(filePath);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message}`);
    }

    const pdfBytes = await fileData.arrayBuffer();
    const text = await extractTextFromPdf(pdfBytes);
    const metadata = extractInvoiceMetadata(text);
    const lines = parseInvoiceLines(text);

    await supabase
      .from("source_imports")
      .update({ status: "extracted", row_count: lines.length })
      .eq("id", importId);

    if (lines.length > 0) {
      const rows = lines.map((line, index) => ({
        source_import_id: importId,
        row_index: index,
        raw_data: { ...line, ...metadata },
        normalized_data: {
          vendor_product_code: line.vendorProductCode,
          product_description: line.productDescription,
          pack_size: line.packSize,
          quantity_invoiced: line.quantity,
          unit_price: line.unitPrice,
          line_total: line.lineTotal,
          invoice_number: metadata.invoiceNumber,
          invoice_date: metadata.invoiceDate,
          vendor_name: metadata.vendorName,
          total_amount: metadata.totalAmount,
          discount_amount: metadata.discountAmount,
          tax_amount: metadata.taxAmount,
          freight_amount: metadata.freightAmount,
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

async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  const decoder = new TextDecoder("utf-8");
  const text = decoder.decode(buffer);
  const textContent: string[] = [];

  for (const line of text.split("\n")) {
    const textMatch = line.match(/\(([^)]*)\)\s*Tj/);
    if (textMatch) {
      textContent.push(textMatch[1]);
    }
  }

  return textContent.join("\n");
}

function extractInvoiceMetadata(text: string): InvoiceMetadata {
  const invoiceMatch = text.match(
    /(?:Invoice|INV|Invoice\s+#|Invoice\s+No)\s*[#:]?\s*(\S+)/i,
  );
  const dateMatch = text.match(
    /(?:Date|Invoice\s+Date|PO\s+Date)\s*[#:]?\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i,
  );
  const vendorMatch = text.match(
    /(?:Vendor|Supplier|From|Bill\s+From|Sold\s+By)\s*[#:]?\s*(.+)/i,
  );
  const totalMatch = text.match(
    /(?:Total|TOTAL\s+DUE|Amount\s+Due|Grand\s+Total)\s*\$?([\d,]+\.\d{2})/i,
  );
  const discountMatch = text.match(/(?:Discount)\s*\$?([\d,]+\.\d{2})/i);
  const taxMatch = text.match(
    /(?:Tax|Sales\s+Tax|HST|GST|VAT)\s*\$?([\d,]+\.\d{2})/i,
  );
  const freightMatch = text.match(
    /(?:Freight|Shipping|Delivery)\s*\$?([\d,]+\.\d{2})/i,
  );

  return {
    invoiceNumber: invoiceMatch?.[1] ?? "unknown",
    invoiceDate: dateMatch
      ? `${dateMatch[3]}-${dateMatch[1].padStart(2, "0")}-${dateMatch[2].padStart(2, "0")}`
      : "",
    vendorName: vendorMatch?.[1]?.trim() ?? "",
    totalAmount: totalMatch ? parseFloat(totalMatch[1].replace(",", "")) : 0,
    discountAmount: discountMatch
      ? parseFloat(discountMatch[1].replace(",", ""))
      : 0,
    taxAmount: taxMatch ? parseFloat(taxMatch[1].replace(",", "")) : 0,
    freightAmount: freightMatch
      ? parseFloat(freightMatch[1].replace(",", ""))
      : 0,
  };
}

function parseInvoiceLines(text: string): InvoiceLine[] {
  const items: InvoiceLine[] = [];
  const lines = text.split("\n");

  const lineItemPattern =
    /^(\S+(?:\s+\S+)?)\s+(.+?)\s+(\d+\s*(?:ml|L|oz|gal|qt|pt|cl|case|each|btl)?)?\s+(\d+(?:\.\d+)?)\s+\$?([\d,]+\.\d{2})\s+\$?([\d,]+\.\d{2})/i;

  for (const line of lines) {
    const match = line.trim().match(lineItemPattern);
    if (match) {
      items.push({
        vendorProductCode: match[1].trim(),
        productDescription: match[2].trim(),
        packSize: (match[3] ?? "").trim(),
        quantity: parseFloat(match[4]),
        unitPrice: parseFloat(match[5].replace(",", "")),
        lineTotal: parseFloat(match[6].replace(",", "")),
      });
    }
  }

  return items;
}
