import { createAdminClient } from "@/lib/supabase/admin";
import { extractOrderDetail } from "@/lib/toast/detail";
import {
  createToastClient,
  summarizeOrders,
  toastLogin,
  type ToastCredentials,
  type ToastMenuIndex,
  type ToastOrder,
} from "@/lib/toast/api";

export const TOAST_PARSER_VERSION = "toast-api-1";
/** How far back the nightly job catches up after missed runs. */
export const TOAST_CATCH_UP_DAYS = 7;

type Admin = ReturnType<typeof createAdminClient>;

export type ToastConnectionCredentials = ToastCredentials & {
  connectionId: string;
  organizationId: string;
  locationId: string;
  autoPost: boolean;
  actingProfileId: string;
};

export type ToastSyncResult = {
  businessDate: string;
  status: "posted" | "staged" | "empty" | "skipped" | "failed";
  orderCount: number;
  itemCount: number;
  netSales: number;
  unmappedCount: number;
  importId: string | null;
  message: string;
};

export async function loadToastCredentials(
  locationId: string,
  admin: Admin = createAdminClient(),
): Promise<ToastConnectionCredentials | null> {
  const { data, error } = await admin.rpc("get_toast_credentials", {
    target_location_id: locationId,
  });
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0];
  if (!row) return null;
  return {
    connectionId: row.connection_id,
    organizationId: row.organization_id,
    locationId: row.location_id,
    restaurantGuid: row.restaurant_guid,
    apiHost: row.api_host,
    clientId: row.client_id,
    clientSecret: row.client_secret,
    autoPost: row.auto_post,
    actingProfileId: row.acting_profile_id,
  };
}

export function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * Business dates the nightly job should pull: the day after the last
 * synced date (at most a week back) through yesterday.
 */
export function datesToSync(
  lastSyncedDate: string | null,
  today: string,
  maxDays = TOAST_CATCH_UP_DAYS,
) {
  const yesterday = addDays(today, -1);
  const earliest = addDays(today, -maxDays);
  let start = lastSyncedDate ? addDays(lastSyncedDate, 1) : yesterday;
  if (start < earliest) start = earliest;
  const dates: string[] = [];
  for (let date = start; date <= yesterday; date = addDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}

async function recordRun(
  admin: Admin,
  connection: ToastConnectionCredentials,
  trigger: "schedule" | "manual",
  startedAt: string,
  result: ToastSyncResult,
) {
  await admin.from("toast_sync_runs").insert({
    organization_id: connection.organizationId,
    location_id: connection.locationId,
    business_date: result.businessDate,
    trigger,
    status: result.status,
    order_count: result.orderCount,
    item_count: result.itemCount,
    net_sales: result.netSales,
    source_import_id: result.importId,
    message: result.message.slice(0, 1000),
    started_at: startedAt,
    finished_at: new Date().toISOString(),
  });
  const succeeded = result.status !== "failed";
  const { data: current } = await admin
    .from("toast_connections")
    .select("last_synced_date")
    .eq("id", connection.connectionId)
    .maybeSingle();
  const advance =
    succeeded &&
    (!current?.last_synced_date ||
      result.businessDate > current.last_synced_date);
  await admin
    .from("toast_connections")
    .update({
      last_error: succeeded ? "" : result.message.slice(0, 1000),
      ...(advance ? { last_synced_date: result.businessDate } : {}),
    })
    .eq("id", connection.connectionId);
}

/**
 * Toast's "All Levels" export has no item GUIDs, so the first mappings
 * were keyed by name. When the API reports an item's GUID, add a GUID
 * mapping to the same recipe so renames in Toast don't break it.
 */
async function upgradeNameMappings(
  admin: Admin,
  connection: ToastConnectionCredentials,
  itemNames: Map<string, string>,
) {
  const { data: mappings } = await admin
    .from("recipe_menu_item_mappings")
    .select("recipe_id, external_item_guid")
    .eq("organization_id", connection.organizationId)
    .eq("source_system", "toast")
    .eq("active", true);
  const byKey = new Map(
    (mappings ?? []).map((mapping) => [
      mapping.external_item_guid,
      mapping.recipe_id,
    ]),
  );
  const additions = [...itemNames]
    .filter(([guid]) => !byKey.has(guid))
    .map(([guid, name]) => ({
      guid,
      name,
      recipeId: byKey.get(`name:${name.trim().toLowerCase()}`),
    }))
    .filter((addition) => addition.recipeId)
    .map((addition) => ({
      organization_id: connection.organizationId,
      recipe_id: addition.recipeId!,
      source_system: "toast",
      external_item_guid: addition.guid,
      external_item_name: addition.name,
      created_by: connection.actingProfileId,
    }));
  if (additions.length) {
    await admin.from("recipe_menu_item_mappings").insert(additions);
  }
  return new Set([
    ...byKey.keys(),
    ...additions.map((a) => a.external_item_guid),
  ]);
}

/** Pulls one business day from Toast and posts it as that day's sales. */
export async function syncToastDay(
  connection: ToastConnectionCredentials,
  businessDate: string,
  {
    trigger,
    admin = createAdminClient(),
    session,
  }: {
    trigger: "schedule" | "manual";
    admin?: Admin;
    /** Reuse a login and menu across days in one run. */
    session?: ToastSession;
  },
): Promise<ToastSyncResult> {
  const startedAt = new Date().toISOString();
  const base: ToastSyncResult = {
    businessDate,
    status: "failed",
    orderCount: 0,
    itemCount: 0,
    netSales: 0,
    unmappedCount: 0,
    importId: null,
    message: "",
  };

  let result: ToastSyncResult;
  try {
    result = await pullDay(admin, connection, businessDate, base, session);
  } catch (error) {
    result = {
      ...base,
      status: "failed",
      message: error instanceof Error ? error.message : "Toast sync failed.",
    };
  }
  await recordRun(admin, connection, trigger, startedAt, result);
  return result;
}

export type ToastSession = {
  client: ReturnType<typeof createToastClient>;
  menu: ToastMenuIndex;
  categories: Map<string, string>;
};

export async function openToastSession(
  credentials: ToastCredentials,
): Promise<ToastSession> {
  const token = await toastLogin(credentials);
  const client = createToastClient(credentials, token);
  // Menu and category names are nice to have; the credential may not
  // carry those scopes.
  const [menu, categories] = await Promise.all([
    client.menuIndex().catch(() => new Map() as ToastMenuIndex),
    client.salesCategories().catch(() => new Map<string, string>()),
  ]);
  return { client, menu, categories };
}

const CHUNK = 500;

/**
 * Replaces a day's saved checks and items with what Toast reports now, and
 * records the day as saved. Returns how many checks were saved.
 */
export async function saveOrderDetail(
  admin: Admin,
  connection: Pick<ToastConnectionCredentials, "organizationId" | "locationId">,
  businessDate: string,
  orders: ToastOrder[],
  menu?: ToastMenuIndex,
) {
  const detail = extractOrderDetail(orders, businessDate, menu);
  const scope = {
    organization_id: connection.organizationId,
    location_id: connection.locationId,
  };
  for (const table of ["toast_check_items", "toast_checks"] as const) {
    const { error } = await admin
      .from(table)
      .delete()
      .eq("location_id", connection.locationId)
      .eq("business_date", businessDate);
    if (error) throw new Error(error.message);
  }
  for (const [table, rows] of [
    ["toast_checks", detail.checks],
    ["toast_check_items", detail.items],
  ] as const) {
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await admin
        .from(table)
        .insert(rows.slice(i, i + CHUNK).map((row) => ({ ...scope, ...row })));
      if (error) throw new Error(error.message);
    }
  }
  const { error } = await admin.from("toast_detail_days").upsert(
    {
      ...scope,
      business_date: businessDate,
      check_count: detail.checks.length,
      item_count: detail.items.length,
      net_sales: detail.netSales,
      saved_at: new Date().toISOString(),
    },
    { onConflict: "location_id,business_date" },
  );
  if (error) throw new Error(error.message);
  return detail.checks.length;
}

/** Saves detail without letting a failure stop the sales sync. */
async function trySaveDetail(
  admin: Admin,
  connection: ToastConnectionCredentials,
  businessDate: string,
  orders: ToastOrder[],
  menu: ToastMenuIndex,
) {
  try {
    const checks = await saveOrderDetail(
      admin,
      connection,
      businessDate,
      orders,
      menu,
    );
    return { ok: true, note: `${checks} checks saved` };
  } catch (error) {
    return {
      ok: false,
      note: `order detail not saved (${error instanceof Error ? error.message : "error"})`,
    };
  }
}

async function pullDay(
  admin: Admin,
  connection: ToastConnectionCredentials,
  businessDate: string,
  base: ToastSyncResult,
  existingSession?: ToastSession,
): Promise<ToastSyncResult> {
  const [{ data: postedDay }, { data: detailDay }] = await Promise.all([
    admin
      .from("sales_business_days")
      .select("id, source_import_id")
      .eq("location_id", connection.locationId)
      .eq("business_date", businessDate)
      .limit(1)
      .maybeSingle(),
    admin
      .from("toast_detail_days")
      .select("business_date")
      .eq("location_id", connection.locationId)
      .eq("business_date", businessDate)
      .maybeSingle(),
  ]);
  if (postedDay && detailDay) {
    return {
      ...base,
      status: "skipped",
      importId: postedDay.source_import_id,
      message: "Sales and order detail for this day are already saved.",
    };
  }

  const session = existingSession ?? (await openToastSession(connection));
  const orders = await session.client.ordersForDate(businessDate);

  if (postedDay) {
    // Sales were posted before detail was kept: backfill the detail only.
    const saved = await trySaveDetail(
      admin,
      connection,
      businessDate,
      orders,
      session.menu,
    );
    if (!saved.ok) throw new Error(saved.note);
    return {
      ...base,
      status: "skipped",
      importId: postedDay.source_import_id,
      orderCount: orders.length,
      message: `Sales already posted; ${saved.note}.`,
    };
  }

  const detail = await trySaveDetail(
    admin,
    connection,
    businessDate,
    orders,
    session.menu,
  );
  const summary = summarizeOrders(orders, businessDate, {
    menu: session.menu,
    categories: session.categories,
  });
  const totals = {
    orderCount: summary.orderCount,
    itemCount: summary.rows.length,
    netSales: summary.netSales,
  };
  if (summary.rows.length === 0) {
    return {
      ...base,
      ...totals,
      status: "empty",
      message: `Toast reported no sales for this day; ${detail.note}.`,
    };
  }

  const fileHash = `toast-api:${connection.locationId}:${businessDate}`;
  const { data: existing } = await admin
    .from("source_imports")
    .select("id, status")
    .eq("location_id", connection.locationId)
    .eq("file_hash", fileHash)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let importId: string;
  if (existing) {
    importId = existing.id;
    await admin
      .from("source_import_rows")
      .delete()
      .eq("source_import_id", importId);
  } else {
    const { data: created, error } = await admin
      .from("source_imports")
      .insert({
        organization_id: connection.organizationId,
        location_id: connection.locationId,
        source_type: "toast_pmix",
        file_hash: fileHash,
        file_path: "",
        file_name: `Toast API · ${businessDate}`,
        parser_version: TOAST_PARSER_VERSION,
        status: "staging",
        business_date: businessDate,
      })
      .select("id")
      .single();
    if (error || !created) {
      throw new Error(error?.message ?? "Couldn't create the import.");
    }
    importId = created.id;
  }

  const { error: rowsError } = await admin.from("source_import_rows").insert(
    summary.rows.map((row, index) => ({
      source_import_id: importId,
      row_index: index,
      raw_data: row,
      normalized_data: row,
      status: "staged",
    })),
  );
  if (rowsError) throw new Error(rowsError.message);
  await admin
    .from("source_imports")
    .update({
      status: "mapping",
      row_count: summary.rows.length,
      error_message: "",
    })
    .eq("id", importId);

  const mapped = await upgradeNameMappings(
    admin,
    connection,
    summary.itemNames,
  );
  const unmapped = summary.rows.filter((row) => !mapped.has(row.item_guid));
  const unmappedNote = unmapped.length
    ? ` ${unmapped.length} item${unmapped.length === 1 ? " isn't" : "s aren't"} mapped to a recipe.`
    : "";

  if (!connection.autoPost) {
    return {
      ...base,
      ...totals,
      status: "staged",
      importId,
      unmappedCount: unmapped.length,
      message: `Staged for review.${unmappedNote} ${detail.note}.`,
    };
  }

  const { error: postError } = await admin.rpc("post_sales_import_as", {
    target_import_id: importId,
    acting_profile_id: connection.actingProfileId,
  });
  if (postError) throw new Error(postError.message);
  return {
    ...base,
    ...totals,
    status: "posted",
    importId,
    unmappedCount: unmapped.length,
    message: `Posted.${unmappedNote} ${detail.note}.`,
  };
}
