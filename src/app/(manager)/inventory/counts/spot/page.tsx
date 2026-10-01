import type { Metadata } from "next";

import { CountSetup } from "../count-setup";

export const metadata: Metadata = { title: "New spot count" };

export default function SpotCountPage() {
  return <CountSetup countType="spot" />;
}
