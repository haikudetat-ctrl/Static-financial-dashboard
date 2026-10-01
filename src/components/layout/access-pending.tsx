import { Clock3 } from "lucide-react";

import { signOutAction } from "@/app/auth/actions";

export function AccessPending({ email }: { email: string }) {
  return (
    <main className="grid min-h-[100dvh] place-items-center px-5">
      <section className="max-w-lg rounded-lg border bg-[var(--surface-strong)] p-8">
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
          <button className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[var(--foreground)] bg-[var(--foreground)] px-3.5 text-sm font-medium text-white transition hover:bg-[#343a32] disabled:cursor-not-allowed disabled:opacity-50">
            Sign out
          </button>
        </form>
      </section>
    </main>
  );
}
