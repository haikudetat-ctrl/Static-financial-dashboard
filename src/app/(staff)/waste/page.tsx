import type { Metadata } from "next";
import { Trash2 } from "lucide-react";

import { StaffTaskPlaceholder } from "@/components/staff-task-placeholder";

export const metadata: Metadata = { title: "Waste" };

export default function WastePage() {
  return (
    <StaffTaskPlaceholder
      title="Record known loss."
      description="Waste, breakage, and spillage will remain visible instead of disappearing into unexplained variance."
      action="Record loss"
      icon={Trash2}
    />
  );
}
