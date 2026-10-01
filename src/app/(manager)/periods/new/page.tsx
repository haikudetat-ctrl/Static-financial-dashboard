import { redirect } from "next/navigation";

/** Periods come from the fiscal calendar; there is no manual form. */
export default function NewPeriodPage() {
  redirect("/periods");
}
