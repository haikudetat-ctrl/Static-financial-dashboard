import type { Tone } from "@/components/ui";

export const COUNT_STATUS_TONE: Record<string, Tone> = {
  draft: "neutral",
  in_progress: "accent",
  counted: "warning",
  approved: "good",
  cancelled: "neutral",
};

export const COUNT_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  in_progress: "Counting",
  counted: "Ready to review",
  approved: "Approved",
  cancelled: "Cancelled",
};
