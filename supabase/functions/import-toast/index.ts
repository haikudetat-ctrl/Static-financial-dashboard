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

    // Push each staged row into the mapping queue for user review
    const queueItems = stagedRows
      .filter((r) => {
        const raw = r.raw_data as Record<string, string>;
        return Object.values(raw).some((v) => v.trim());
      })
      .map((r) => {
        const raw = r.raw_data as Record<string, string>;
        const n = r.normalized_data as Record<string, unknown>;
        const namedFields = [
          "item_name",
          "menu_item_name",
          "item",
          "Item",
          "item_name",
          "Name",
          "name",
        ];
        let sourceValue = "";
        for (const field of [...namedFields, ...Object.keys(raw)]) {
          const v = n[field] || raw[field];
          if (v && String(v).trim()) {
            sourceValue = String(v).trim();
            break;
          }
        }
        return {
          organization_id: organizationId,
          queue_type: "toast_item_to_inventory",
          status: "pending",
          source_value: sourceValue,
          source_context: {
            import_id: importId,
            row_index: r.row_index,
            import_source_type: sourceType,
            raw_data: raw,
            normalized_data: n,
          },
        };
      });

    if (queueItems.length > 0) {
      await supabase.from("mapping_queue_items").insert(queueItems);
    }

    await supabase
      .from("source_imports")
      .update({
        status: "mapping",
        row_count: rows.length,
        parser_version: "1.0.0",
      })
      .eq("id", importId);

    return new Response(
      JSON.stringify({
        success: true,
        rowCount: rows.length,
        businessDate,
        mappingQueueItems: queueItems.length,
      }),
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

function matchCol(row: Record<string, string>, ...aliases: string[]): string {
  for (const alias of aliases) {
    if (alias in row) return row[alias];
  }
  return "";
}

function parseFloatSafe(v: string): number {
  const n = parseFloat(v.replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

function normalizeToastRow(
  row: Record<string, string>,
  sourceType: string,
): Record<string, unknown> {
  if (sourceType === "toast_pmix") {
    return {
      item_guid: matchCol(
        row,
        "ItemGuid",
        "Item GUID",
        "MenuItemGUID",
        "Menu Item GUID",
      ),
      item_name: matchCol(
        row,
        "ItemName",
        "Item Name",
        "MenuItemName",
        "Menu Item Name",
        "Item",
        "item_name",
      ),
      business_date: matchCol(
        row,
        "BusinessDate",
        "Business Date",
        "PeriodDate",
        "Period Date",
        "DayDate",
        "Day Date",
        "Date",
      ),
      quantity_sold: parseFloatSafe(
        matchCol(row, "Quantity", "Qty", "Qty sold"),
      ),
      net_sales: parseFloatSafe(
        matchCol(row, "NetSales", "Net Sales", "Amount"),
      ),
      void_quantity: parseFloatSafe(
        matchCol(row, "VoidQuantity", "Void Qty", "Void amt"),
      ),
      comp_quantity: parseFloatSafe(matchCol(row, "CompQuantity", "Comp Qty")),
      category: matchCol(row, "Category", "SalesCategory"),
      menu_group: matchCol(row, "MenuGroup", "Menu Group", "Menu"),
      service_period: matchCol(row, "ServicePeriod", "Service Period"),
      tax_amount: parseFloatSafe(matchCol(row, "Tax amt")),
      cogs: parseFloatSafe(matchCol(row, "COGS")),
      subgroup: matchCol(row, "Subgroup"),
      type: matchCol(row, "Type"),
      deferred: matchCol(row, "Deferred"),
    };
  }

  if (sourceType === "toast_sales_summary") {
    return {
      business_date: matchCol(
        row,
        "BusinessDate",
        "Business Date",
        "PeriodDate",
        "DayDate",
        "Date",
      ),
      net_sales: parseFloatSafe(matchCol(row, "NetSales", "Net Sales")),
      category: matchCol(row, "Category", "SalesCategory"),
      total_transactions: parseFloatSafe(
        matchCol(row, "Transactions", "Count"),
      ),
    };
  }

  return { ...row };
}
