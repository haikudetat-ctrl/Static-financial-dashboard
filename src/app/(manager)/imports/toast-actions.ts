"use server";

import { revalidatePath } from "next/cache";

import { getUserContext } from "@/lib/auth/session";
import { localToday } from "@/lib/inventory/count-period";
import { getPrimaryLocation } from "@/lib/inventory/queries";
import { createClient } from "@/lib/supabase/server";
import { TOAST_HOSTS } from "@/lib/toast/api";
import {
  addDays,
  loadToastCredentials,
  openToastSession,
  syncToastDay,
} from "@/lib/toast/sync";

export type ToastFormState = { ok?: boolean; message?: string };

async function requireManager() {
  const context = await getUserContext();
  if (!context || context.role !== "manager" || !context.organizationId) {
    throw new Error("Manager access required.");
  }
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) throw new Error("No location is configured.");
  return { context, locationId };
}

function refresh() {
  revalidatePath("/imports");
  revalidatePath("/recipes/sales");
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

export async function saveToastConnectionAction(
  _state: ToastFormState,
  formData: FormData,
): Promise<ToastFormState> {
  try {
    const { locationId } = await requireManager();
    const restaurantGuid = String(formData.get("restaurant_guid") ?? "").trim();
    const clientId = String(formData.get("client_id") ?? "").trim();
    const clientSecret = String(formData.get("client_secret") ?? "");
    const apiHost =
      formData.get("environment") === "sandbox"
        ? TOAST_HOSTS.sandbox
        : TOAST_HOSTS.production;
    if (!/^[0-9a-f-]{36}$/i.test(restaurantGuid)) {
      return { message: "The restaurant GUID should look like 1a2b3c4d-…" };
    }
    if (!clientId) return { message: "Enter the client ID." };

    const supabase = await createClient();
    const { error } = await supabase.rpc("save_toast_connection", {
      target_location_id: locationId,
      new_restaurant_guid: restaurantGuid,
      new_client_id: clientId,
      new_client_secret: clientSecret,
      new_api_host: apiHost,
      new_auto_post: formData.get("auto_post") === "on",
    });
    if (error) return { message: error.message };

    // Check the credentials right away.
    const credentials = await loadToastCredentials(locationId);
    if (!credentials) return { message: "Saved, but couldn't read it back." };
    try {
      await openToastSession(credentials);
    } catch (loginError) {
      refresh();
      return {
        message: `Saved, but Toast login failed: ${errorMessage(loginError)}`,
      };
    }
    refresh();
    return { ok: true, message: "Connected to Toast." };
  } catch (error) {
    return { message: errorMessage(error) };
  }
}

export async function syncToastDateAction(
  _state: ToastFormState,
  formData: FormData,
): Promise<ToastFormState> {
  try {
    const { locationId } = await requireManager();
    const date = String(formData.get("business_date") ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { message: "Choose a business date." };
    }
    if (date > addDays(localToday(), -1)) {
      return {
        message:
          "Toast closes a business day after 4 AM; pick yesterday or earlier.",
      };
    }
    const credentials = await loadToastCredentials(locationId);
    if (!credentials) return { message: "Connect Toast first." };
    const result = await syncToastDay(credentials, date, { trigger: "manual" });
    refresh();
    return {
      ok: result.status !== "failed",
      message: `${date}: ${result.message}`,
    };
  } catch (error) {
    return { message: errorMessage(error) };
  }
}

export async function setToastAutoPostAction(formData: FormData) {
  const { locationId } = await requireManager();
  const supabase = await createClient();
  const { error } = await supabase
    .from("toast_connections")
    .update({ auto_post: formData.get("auto_post") === "true" })
    .eq("location_id", locationId);
  if (error) throw new Error(error.message);
  refresh();
}

export async function disconnectToastAction() {
  const { locationId } = await requireManager();
  const supabase = await createClient();
  const { error } = await supabase
    .from("toast_connections")
    .delete()
    .eq("location_id", locationId);
  if (error) throw new Error(error.message);
  refresh();
}
