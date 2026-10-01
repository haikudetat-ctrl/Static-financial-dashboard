import type { Metadata } from "next";

import { CountSetup } from "../count-setup";

export const metadata: Metadata = { title: "New full count" };

export default function NewInventoryCountPage() {
  return <CountSetup countType="full" />;
}
