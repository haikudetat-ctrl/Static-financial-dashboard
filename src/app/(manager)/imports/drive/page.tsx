import type { Metadata } from "next";

import { DriveInboxView } from "@/components/drive/inbox-view";
import { getUserContext } from "@/lib/auth/session";
import { getDriveInbox } from "@/lib/drive/queries";
import { readServiceAccount } from "@/lib/google/drive";
import { getPrimaryLocation } from "@/lib/inventory/queries";

export const metadata: Metadata = { title: "Drive inbox" };

function serviceAccountEmail() {
  try {
    return readServiceAccount()?.clientEmail ?? null;
  } catch {
    return null;
  }
}

export default async function DriveInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const context = await getUserContext();
  if (!context?.organizationId) return null;
  const locationId = await getPrimaryLocation(
    context.organizationId,
    context.locationId,
  );
  if (!locationId) return null;
  const { show } = await searchParams;
  const { source, documents } = await getDriveInbox(locationId);
  return (
    <DriveInboxView
      source={source}
      documents={documents}
      view={show === "done" || show === "all" ? show : "todo"}
      serviceAccount={serviceAccountEmail()}
    />
  );
}
