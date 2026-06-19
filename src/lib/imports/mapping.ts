import { createClient } from "@/lib/supabase/server";
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

  return { confirmed: ids.length, failed: 0 };
}
