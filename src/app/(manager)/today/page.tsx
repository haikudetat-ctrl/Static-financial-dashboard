import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleAlert, Clock3 } from "lucide-react";

export const metadata: Metadata = {
  title: "Today",
};

const queues = [
  {
    label: "Blocking exceptions",
    value: "0",
    detail: "Nothing is preventing the next close.",
    icon: CircleAlert,
  },
  {
    label: "Awaiting review",
    value: "0",
    detail: "Imports, receipts, and invoices will appear here.",
    icon: Clock3,
  },
  {
    label: "System status",
    value: "Ready",
    detail: "Tenancy and access controls are configured.",
    icon: CheckCircle2,
  },
];

export default function TodayPage() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
      <header className="grid gap-5 border-b pb-8 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-end">
        <div>
          <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
            Thursday · June 18
          </p>
          <h1 className="mt-3 text-5xl leading-[0.95] font-semibold tracking-[-0.06em] sm:text-6xl">
            The room is quiet.
          </h1>
        </div>
        <p className="max-w-md text-sm leading-6 text-[var(--muted)] xl:justify-self-end">
          Reviews, cutoffs, count tasks, and material exceptions will collect
          here as operational data enters the system.
        </p>
      </header>

      <section className="grid border-b md:grid-cols-3">
        {queues.map((queue) => {
          const Icon = queue.icon;
          return (
            <article
              key={queue.label}
              className="border-b py-6 md:border-r md:border-b-0 md:px-6 md:first:pl-0 md:last:border-r-0"
            >
              <div className="flex items-center justify-between">
                <p className="font-mono text-[9px] tracking-[0.13em] text-[var(--muted)] uppercase">
                  {queue.label}
                </p>
                <Icon
                  size={17}
                  strokeWidth={1.6}
                  className="text-[var(--accent)]"
                  aria-hidden="true"
                />
              </div>
              <p className="mt-5 text-3xl font-semibold tracking-[-0.05em]">
                {queue.value}
              </p>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                {queue.detail}
              </p>
            </article>
          );
        })}
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <div className="min-h-[360px] border bg-[var(--surface)] p-6 shadow-[8px_8px_0_#dedbd2] sm:p-8">
          <div className="flex items-center justify-between border-b pb-5">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.03em]">
                Priority queue
              </h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Highest-impact work, ordered automatically.
              </p>
            </div>
            <span className="border border-[#bfd0c3] bg-[#edf4ee] px-2.5 py-1 font-mono text-[9px] tracking-[0.1em] text-[#3f6d55] uppercase">
              All clear
            </span>
          </div>
          <div className="grid min-h-[250px] place-items-center text-center">
            <div className="max-w-sm">
              <CheckCircle2
                size={32}
                strokeWidth={1.4}
                className="mx-auto text-[var(--success)]"
                aria-hidden="true"
              />
              <h3 className="mt-5 text-lg font-semibold">
                No action is required yet.
              </h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Slice 1 will add imports, mapping queues, and master-data work.
              </p>
            </div>
          </div>
        </div>

        <aside className="border bg-[#20241f] p-6 text-white sm:p-8">
          <p className="font-mono text-[9px] tracking-[0.15em] text-[#e5a36d] uppercase">
            Next foundation
          </p>
          <h2 className="mt-4 text-3xl leading-[1.02] font-semibold tracking-[-0.045em]">
            Build the source of truth.
          </h2>
          <p className="mt-4 text-sm leading-6 text-[#c7cbc4]">
            Units, inventory items, vendors, order guides, and historical source
            staging arrive in the next slice.
          </p>
          <Link
            href="/inventory"
            className="mt-8 inline-flex min-h-11 items-center gap-2 border border-[#697067] px-4 text-sm font-semibold transition hover:bg-white hover:text-[#20241f] active:translate-y-px"
          >
            View inventory shell
            <ArrowRight size={16} strokeWidth={1.7} aria-hidden="true" />
          </Link>
        </aside>
      </section>
    </div>
  );
}
