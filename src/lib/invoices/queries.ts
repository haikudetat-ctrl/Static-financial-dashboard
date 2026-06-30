import { createClient } from "@/lib/supabase/server";

type InvoiceStatusRow = {
  id: string;
  status: string;
  validation_status: string;
};

type InvoiceJobStatusRow = {
  id: string;
  status: string;
  error_code: string;
  error_message: string;
};

type ReviewCardStatusRow = {
  status: string;
  blocking_reasons: string[];
};

export function buildInvoiceStatusSummary({
  invoice,
  job,
  reviewCards,
}: {
  invoice: InvoiceStatusRow | null;
  job: InvoiceJobStatusRow | null;
  reviewCards: ReviewCardStatusRow[];
}) {
  const openCards = reviewCards.filter(
    (card) => card.status === "open" || card.status === "in_review",
  );

  return {
    invoiceId: invoice?.id ?? null,
    invoiceStatus: invoice?.status ?? null,
    jobId: job?.id ?? null,
    jobStatus: job?.status ?? null,
    validationStatus: invoice?.validation_status ?? null,
    openReviewCount: openCards.length,
    blockingReviewCount: openCards.filter(
      (card) => card.blocking_reasons.length > 0,
    ).length,
    failed: job?.status === "failed",
    errorCode: job?.error_code ?? "",
    errorMessage: job?.error_message ?? "",
  };
}

export function buildInvoiceReviewPayload<
  TInvoice,
  TLine extends { id: string; line_index: number },
  TSuggestion extends { line_candidate_id: string; rank: number },
  TReview extends { entity_type: string; entity_id: string },
>({
  invoice,
  lineCandidates,
  matchSuggestions,
  reviewCards,
}: {
  invoice: TInvoice;
  lineCandidates: TLine[];
  matchSuggestions: TSuggestion[];
  reviewCards: TReview[];
}) {
  return {
    invoice,
    lines: [...lineCandidates]
      .sort((a, b) => a.line_index - b.line_index)
      .map((line) => ({
        ...line,
        suggestions: matchSuggestions
          .filter((suggestion) => suggestion.line_candidate_id === line.id)
          .sort((a, b) => a.rank - b.rank),
        reviewCards: reviewCards.filter(
          (card) =>
            card.entity_type === "invoice_line_candidate" &&
            card.entity_id === line.id,
        ),
      })),
  };
}

export function parseReviewApprovalInput(value: unknown) {
  const input = isRecord(value) ? value : {};
  const selectedMatchId = stringOrUndefined(input.selectedMatchId);
  const idempotencyKey = stringOrUndefined(input.idempotencyKey);
  const notes = stringOrUndefined(input.notes) ?? "";

  if (!idempotencyKey) {
    throw new Error("idempotencyKey is required");
  }

  return {
    selectedMatchId,
    idempotencyKey,
    notes,
  };
}

export async function getInvoiceStatusSummary({
  organizationId,
  invoiceId,
}: {
  organizationId: string;
  invoiceId: string;
}) {
  const supabase = await createClient();
  const [{ data: invoice }, { data: job }, { data: lineCandidates }] =
    await Promise.all([
      supabase
        .from("invoices")
        .select("id, status, validation_status")
        .eq("organization_id", organizationId)
        .eq("id", invoiceId)
        .maybeSingle(),
      supabase
        .from("invoice_processing_jobs")
        .select("id, status, error_code, error_message")
        .eq("organization_id", organizationId)
        .eq("invoice_id", invoiceId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("invoice_line_candidates")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("invoice_id", invoiceId),
    ]);
  const reviewEntityIds = [
    invoiceId,
    ...(((lineCandidates ?? []) as Array<{ id: string }>).map(
      (line) => line.id,
    ) ?? []),
  ];
  const { data: reviewCards } = await supabase
    .from("review_queue")
    .select("status, blocking_reasons")
    .eq("organization_id", organizationId)
    .in("entity_id", reviewEntityIds);

  return buildInvoiceStatusSummary({
    invoice: (invoice as InvoiceStatusRow | null) ?? null,
    job: (job as InvoiceJobStatusRow | null) ?? null,
    reviewCards: (reviewCards as ReviewCardStatusRow[] | null) ?? [],
  });
}

export async function getInvoiceReviewPayload({
  organizationId,
  invoiceId,
}: {
  organizationId: string;
  invoiceId: string;
}) {
  const supabase = await createClient();
  const [
    { data: invoice },
    { data: lineCandidates },
    { data: matchSuggestions },
    { data: reviewCards },
  ] = await Promise.all([
    supabase
      .from("invoices")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", invoiceId)
      .maybeSingle(),
    supabase
      .from("invoice_line_candidates")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("invoice_id", invoiceId)
      .order("line_index"),
    supabase
      .from("invoice_line_match_suggestions")
      .select("*")
      .eq("organization_id", organizationId)
      .order("rank"),
    supabase
      .from("review_queue")
      .select("*")
      .eq("organization_id", organizationId)
      .in("entity_type", ["invoice", "invoice_line_candidate"])
      .order("created_at"),
  ]);

  if (!invoice) {
    throw new Error("Invoice not found");
  }

  const candidateIds = new Set(
    ((lineCandidates ?? []) as Array<{ id: string }>).map((line) => line.id),
  );
  const invoiceReviewCards = (
    (reviewCards ?? []) as Array<{
      entity_type: string;
      entity_id: string;
    }>
  ).filter(
    (card) =>
      card.entity_id === invoiceId ||
      (card.entity_type === "invoice_line_candidate" &&
        candidateIds.has(card.entity_id)),
  );
  const candidateSuggestions = (
    (matchSuggestions ?? []) as Array<{
      line_candidate_id: string;
      rank: number;
    }>
  ).filter((suggestion) => candidateIds.has(suggestion.line_candidate_id));

  return buildInvoiceReviewPayload({
    invoice,
    lineCandidates: (lineCandidates ?? []) as Array<{
      id: string;
      line_index: number;
    }>,
    matchSuggestions: candidateSuggestions,
    reviewCards: invoiceReviewCards,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrUndefined(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
