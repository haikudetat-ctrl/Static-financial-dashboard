import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Set up your organization" };

export default async function SetupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  return (
    <main className="grid min-h-[100dvh] place-items-center px-5">
      <section className="w-full max-w-lg">
        <div className="mb-8">
          <p className="text-xs font-medium text-[var(--accent-strong)]">
            First time setup
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-[-0.02em]">
            Name your bar.
          </h1>
          <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
            You&rsquo;re creating the first organization. You&rsquo;ll be set as
            the manager and can invite staff once setup is complete.
          </p>
        </div>
        <SetupForm />
      </section>
    </main>
  );
}
