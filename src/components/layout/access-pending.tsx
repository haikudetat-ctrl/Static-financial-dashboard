import { Clock3 } from "lucide-react";

import { signOutAction } from "@/app/auth/actions";

export function AccessPending({ email }: { email: string }) {
  return (
    <main className="grid min-h-[100dvh] place-items-center px-5">
      <section className="max-w-lg border bg-[var(--surface)] p-8 shadow-[8px_8px_0_#dedbd2]">
        <Clock3
          size={32}
          strokeWidth={1.5}
          className="text-[var(--accent)]"
          aria-hidden="true"
        />
        <h1 className="mt-8 text-3xl font-semibold tracking-[-0.04em]">
          Your workspace is being assigned.
        </h1>
        <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
          {email} is authenticated, but it does not yet have an organization
          role. Ask a manager to add this account.
        </p>
        <form action={signOutAction} className="mt-7">
          <button className="min-h-11 bg-[var(--foreground)] px-5 text-sm font-semibold text-white">
            Sign out
          </button>
        </form>
      </section>
    </main>
  );
}
