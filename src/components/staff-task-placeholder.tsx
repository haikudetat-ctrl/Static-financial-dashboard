import { ArrowRight, type LucideIcon } from "lucide-react";

export function StaffTaskPlaceholder({
  title,
  description,
  action,
  icon: Icon,
}: {
  title: string;
  description: string;
  action: string;
  icon: LucideIcon;
}) {
  return (
    <div className="mx-auto max-w-lg px-4 py-7">
      <p className="font-mono text-[10px] tracking-[0.15em] text-[var(--accent)] uppercase">
        Staff task
      </p>
      <h1 className="mt-3 text-4xl leading-[0.98] font-semibold tracking-[-0.055em]">
        {title}
      </h1>
      <p className="mt-4 max-w-sm text-sm leading-6 text-[var(--muted)]">
        {description}
      </p>
      <section className="mt-8 border bg-white p-6 shadow-[7px_7px_0_#dedbd2]">
        <div className="grid size-12 place-items-center bg-[#f4e8de] text-[var(--accent)]">
          <Icon size={25} strokeWidth={1.5} aria-hidden="true" />
        </div>
        <h2 className="mt-10 text-xl font-semibold tracking-[-0.03em]">
          No task is assigned.
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Assigned work will appear here with one clear next action.
        </p>
        <button
          type="button"
          disabled
          className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 bg-[#d8d8d2] px-5 text-sm font-semibold text-[#73776f]"
        >
          {action}
          <ArrowRight size={16} strokeWidth={1.7} aria-hidden="true" />
        </button>
      </section>
    </div>
  );
}
