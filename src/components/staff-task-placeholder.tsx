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
      <p className="text-xs font-medium text-[var(--accent-strong)]">
        Staff task
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-[-0.02em]">
        {title}
      </h1>
      <p className="mt-4 max-w-sm text-sm leading-6 text-[var(--muted)]">
        {description}
      </p>
      <section className="mt-6 rounded-lg border bg-[var(--surface-strong)] p-6">
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
