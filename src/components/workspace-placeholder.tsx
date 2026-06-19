import Link from "next/link";
import { ArrowUpRight, CircleDashed } from "lucide-react";

export function WorkspacePlaceholder({
  title,
  eyebrow,
  description,
  actionLabel,
  actionHref,
  signals,
}: {
  title: string;
  eyebrow: string;
  description: string;
  actionLabel: string;
  actionHref: string;
  signals: Array<{ label: string; value: string; detail: string }>;
}) {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
      <header className="border-b pb-8">
        <p className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
          {eyebrow}
        </p>
        <div className="mt-3 grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-end">
          <h1 className="max-w-3xl text-4xl leading-[0.98] font-semibold tracking-[-0.055em] sm:text-5xl">
            {title}
          </h1>
          <p className="max-w-xl text-sm leading-6 text-[var(--muted)] xl:justify-self-end">
            {description}
          </p>
        </div>
      </header>
      <section className="grid border-b md:grid-cols-3">
        {signals.map((signal) => (
          <div
            key={signal.label}
            className="border-b py-6 md:border-r md:border-b-0 md:px-6 md:first:pl-0 md:last:border-r-0"
          >
            <p className="font-mono text-[9px] tracking-[0.13em] text-[var(--muted)] uppercase">
              {signal.label}
            </p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
              {signal.value}
            </p>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              {signal.detail}
            </p>
          </div>
        ))}
      </section>
      <section className="mt-8 grid min-h-[320px] place-items-center border bg-[var(--surface)] p-8 text-center shadow-[8px_8px_0_#dedbd2]">
        <div className="max-w-md">
          <CircleDashed
            size={34}
            strokeWidth={1.4}
            className="mx-auto text-[var(--accent)]"
            aria-hidden="true"
          />
          <h2 className="mt-6 text-2xl font-semibold tracking-[-0.035em]">
            This workspace is ready for data.
          </h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            The foundation is active. The next implementation slice connects
            master data and historical imports.
          </p>
          <Link
            href={actionHref}
            className="mt-6 inline-flex min-h-11 items-center gap-2 bg-[var(--foreground)] px-5 text-sm font-semibold text-white transition hover:bg-[#343a32] active:translate-y-px"
          >
            {actionLabel}
            <ArrowUpRight size={16} strokeWidth={1.7} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}
