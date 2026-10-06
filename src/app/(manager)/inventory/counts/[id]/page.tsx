import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  Badge,
  ButtonLink,
  PageBody,
  PageHeader,
  buttonClass,
} from "@/components/ui";
import { getCountSheet } from "@/lib/inventory/count-sheet";
import { loadCountUnits } from "@/lib/inventory/count-units";
import { createClient } from "@/lib/supabase/server";

import { cancelCountAction } from "../actions";
import { COUNT_STATUS_LABEL, COUNT_STATUS_TONE } from "../status";
import { CountSheet } from "./count-sheet";

export const metadata: Metadata = { title: "Count sheet" };

export default async function CountSheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sheet = await getCountSheet(id);
  const units = sheet
    ? await loadCountUnits(await createClient(), sheet.organizationId)
    : [];
  if (!sheet) notFound();

  const editable = ["draft", "in_progress", "counted"].includes(sheet.status);
  const title = `${sheet.countType === "full" ? "Full" : "Spot"} count`;

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Inventory", href: "/inventory" },
          { label: "Counts", href: "/inventory/counts" },
        ]}
        title={title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {sheet.periodLabel}
            {" · "}
            started{" "}
            {new Date(sheet.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
            <Badge tone={COUNT_STATUS_TONE[sheet.status] ?? "neutral"}>
              {COUNT_STATUS_LABEL[sheet.status] ?? sheet.status}
            </Badge>
          </span>
        }
        actions={
          <>
            {editable && (
              <form action={cancelCountAction.bind(null, sheet.id)}>
                <button type="submit" className={buttonClass("ghost")}>
                  Cancel count
                </button>
              </form>
            )}
            <ButtonLink href={`/inventory/counts/${sheet.id}/review`}>
              Review variances
            </ButtonLink>
          </>
        }
      />
      <PageBody>
        <CountSheet
          countId={sheet.id}
          areas={sheet.areas}
          units={units}
          editable={editable}
        />
      </PageBody>
    </>
  );
}
