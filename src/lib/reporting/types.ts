export type ReadinessCheck = {
  label: string;
  pass: boolean;
  severity: "blocking" | "incomplete" | "estimated" | "info";
  detail: string;
};

export type PeriodSummary = {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
};

export type CogsSummary = {
  actualCogs: number;
  openingValue: number;
  purchasesValue: number;
  closingValue: number;
  knownLoss: number;
  theoreticalCogs: number;
  varianceValue: number;
  variancePct: number | null;
};
