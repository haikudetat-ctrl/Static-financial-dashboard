import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MappingQueueType } from "@/lib/types";

export type QueueItemInput = {
  organizationId: string;
  queueType: MappingQueueType;
  sourceValue: string;
  sourceContext: Record<string, unknown>;
  suggestedMatchId?: string;
  suggestedMatchLabel?: string;
  suggestedConfidence?: number;
};

export async function addToMappingQueue(
  input: QueueItemInput,
): Promise<string> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("mapping_queue_items")
    .insert({
      organization_id: input.organizationId,
      queue_type: input.queueType,
      status: input.suggestedMatchId ? "suggested" : "pending",
      source_value: input.sourceValue,
      source_context: input.sourceContext,
      suggested_match_id: input.suggestedMatchId ?? null,
      suggested_match_label: input.suggestedMatchLabel ?? "",
      suggested_confidence: input.suggestedConfidence ?? null,
    })
    .select("id")
    .single();

  if (error)
    throw new Error(`Failed to add to mapping queue: ${error.message}`);
  return data.id;
}

export async function confirmMapping(
  queueItemId: string,
  confirmedMatchId: string,
  confirmedMatchType: string,
  profileId: string,
): Promise<void> {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { error } = await supabase
    .from("mapping_queue_items")
    .update({
      status: "confirmed",
      confirmed_match_id: confirmedMatchId,
      confirmed_match_type: confirmedMatchType,
      resolved_by: profileId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", queueItemId);

  if (error) throw new Error(`Failed to confirm mapping: ${error.message}`);

  const { data: item } = await admin
    .from("mapping_queue_items")
    .select("queue_type, organization_id, source_context, source_value")
    .eq("id", queueItemId)
    .single();

  if (!item) return;

  if (
    item.queue_type === "toast_item_to_recipe" &&
    confirmedMatchType === "recipe"
  ) {
    const ctx = item.source_context as Record<string, unknown>;
    const norm = (ctx?.normalized_data ?? {}) as Record<string, unknown>;
    const raw = (ctx?.raw_data ?? {}) as Record<string, string>;
    const externalItemGuid = String(norm.item_guid ?? raw.ItemGuid ?? "");
    const externalItemName = String(norm.item_name ?? item.source_value ?? "");

    if (externalItemGuid) {
      await admin.from("recipe_menu_item_mappings").upsert(
        {
          organization_id: item.organization_id,
          recipe_id: confirmedMatchId,
          source_system: "toast",
          external_item_guid: externalItemGuid,
          external_item_name: externalItemName,
          active: true,
          created_by: profileId,
        },
        {
          onConflict: "organization_id, source_system, external_item_guid",
          ignoreDuplicates: false,
        },
      );
    }
  }
}

export async function skipMapping(
  queueItemId: string,
  profileId: string,
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("mapping_queue_items")
    .update({
      status: "skipped",
      resolved_by: profileId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", queueItemId);

  if (error) throw new Error(`Failed to skip mapping: ${error.message}`);
}

export async function getMappingQueue(
  organizationId: string,
  options?: {
    queueType?: MappingQueueType;
    status?: string;
    limit?: number;
  },
): Promise<unknown[]> {
  const supabase = await createClient();

  let query = supabase
    .from("mapping_queue_items")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (options?.queueType) {
    query = query.eq("queue_type", options.queueType);
  }

  if (options?.status) {
    query = query.eq("status", options.status);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data } = await query;
  return data ?? [];
}

export async function bulkConfirmMapping(
  ids: string[],
  profileId: string,
): Promise<{ confirmed: number; failed: number }> {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { error } = await supabase
    .from("mapping_queue_items")
    .update({
      status: "confirmed",
      resolved_by: profileId,
      resolved_at: new Date().toISOString(),
    })
    .in("id", ids)
    .eq("status", "suggested");

  if (error) {
    return { confirmed: 0, failed: ids.length };
  }

  const { data: items } = await admin
    .from("mapping_queue_items")
    .select(
      "id, queue_type, organization_id, source_context, source_value, suggested_match_id, suggested_match_label",
    )
    .in("id", ids);

  if (items) {
    for (const item of items) {
      if (item.queue_type === "toast_item_to_recipe") {
        const ctx = item.source_context as Record<string, unknown>;
        const norm = (ctx?.normalized_data ?? {}) as Record<string, unknown>;
        const raw = (ctx?.raw_data ?? {}) as Record<string, string>;
        const externalItemGuid = String(norm.item_guid ?? raw.ItemGuid ?? "");
        const externalItemName = String(
          norm.item_name ?? item.source_value ?? "",
        );

        if (externalItemGuid && item.suggested_match_id) {
          await admin.from("recipe_menu_item_mappings").upsert(
            {
              organization_id: item.organization_id,
              recipe_id: item.suggested_match_id,
              source_system: "toast",
              external_item_guid: externalItemGuid,
              external_item_name: externalItemName,
              active: true,
              created_by: profileId,
            },
            {
              onConflict: "organization_id, source_system, external_item_guid",
              ignoreDuplicates: false,
            },
          );
        }
      }
    }
  }

  return { confirmed: ids.length, failed: 0 };
}
