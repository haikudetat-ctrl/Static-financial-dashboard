// Toast PMIX/Sales/Labor CSV Import Edge Function
// Parses uploaded Toast CSV/ZIP files and stages the rows.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

interface ImportRequest {
  importId: string;
  filePath: string;
  organizationId: string;
  locationId: string;
  sourceType: string;
}

serve(async (req) => {
  try {
    const {
      importId,
      filePath,
      organizationId,
      locationId,
      sourceType,
    }: ImportRequest = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    await supabase
      .from("source_imports")
      .update({ status: "extracting" })
      .eq("id", importId);

    // Download file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("source-documents")
      .download(filePath);

    if (downloadError || !fileData) {
      throw new Error(`Download failed: ${downloadError?.message}`);
    }

    const text = await fileData.text();
    const rows = parseCsv(text);

    // Determine business date from filename or content
    const businessDate = extractBusinessDate(filePath, rows);

    // Build normalized rows
    const stagedRows = rows.map((row, index) => {
      const normalized = normalizeToastRow(row, sourceType);
      return {
        source_import_id: importId,
        row_index: index,
        raw_data: row,
        normalized_data: normalized,
        status: "staged",
        error_message: "",
      };
    });

    await supabase.from("source_import_rows").insert(stagedRows);

    await supabase
      .from("source_imports")
      .update({
        status: "staged",
        row_count: rows.length,
        parser_version: "1.0.0",
      })
      .eq("id", importId);

    return new Response(
      JSON.stringify({ success: true, rowCount: rows.length, businessDate }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

function parseCsv(text: string): Record<string, string>[] {
  const raw = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = raw.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length === headers.length) {
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h.trim()] = (values[idx] ?? "").trim();
      });
      rows.push(row);
    }
  }

  return rows;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);

  return result;
}

function extractBusinessDate(
  filePath: string,
  rows: Record<string, string>[],
): string {
  // Try to find business date in the data
  if (rows.length > 0) {
    const firstRow = rows[0];
    const dateField =
      firstRow["BusinessDate"] ||
      firstRow["Business Date"] ||
      firstRow["Date"] ||
      "";
    if (dateField) return dateField;
  }

  // Fall back to filename pattern
  const match = filePath.match(/(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? "";
}

function normalizeToastRow(
  row: Record<string, string>,
  sourceType: string,
): Record<string, unknown> {
  if (sourceType === "toast_pmix") {
    return {
      item_guid: row["ItemGuid"] || row["Item GUID"] || "",
      item_name: row["ItemName"] || row["Item Name"] || "",
      business_date: row["BusinessDate"] || row["Business Date"] || "",
      quantity_sold: parseFloat(row["Quantity"] || row["Qty"] || "0"),
      net_sales: parseFloat(
        row["NetSales"] || row["Net Sales"] || row["Amount"] || "0",
      ),
      void_quantity: parseFloat(row["VoidQuantity"] || row["Void Qty"] || "0"),
      comp_quantity: parseFloat(row["CompQuantity"] || row["Comp Qty"] || "0"),
      category: row["Category"] || row["SalesCategory"] || "",
      menu_group: row["MenuGroup"] || row["Menu Group"] || "",
      service_period: row["ServicePeriod"] || row["Service Period"] || "",
    };
  }

  if (sourceType === "toast_sales_summary") {
    return {
      business_date: row["BusinessDate"] || row["Date"] || "",
      net_sales: parseFloat(row["NetSales"] || row["Net Sales"] || "0"),
      category: row["Category"] || row["SalesCategory"] || "",
      total_transactions: parseFloat(
        row["Transactions"] || row["Count"] || "0",
      ),
    };
  }

  return { ...row };
}
