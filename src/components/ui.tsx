import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/* App-wide building blocks. Pages compose these instead of styling headers,
   panels and tables from scratch, so every screen reads as one app. */

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  actions?: ReactNode;
}) {
  return (
    <header className="border-b bg-[var(--surface)]">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-3 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav
              aria-label="Breadcrumb"
              className="mb-1 flex flex-wrap items-center gap-1 text-xs text-[var(--muted)]"
            >
              {breadcrumbs.map((crumb, index) => (
                <span key={crumb.label} className="flex items-center gap-1">
                  {index > 0 && <span aria-hidden="true">/</span>}
                  {crumb.href ? (
                    <Link
                      href={crumb.href}
                      className="hover:text-[var(--foreground)]"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span>{crumb.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
          <h1 className="truncate text-xl font-semibold tracking-[-0.02em]">
            {title}
          </h1>
          {description && (
            <p className="mt-0.5 text-sm text-[var(--muted)]">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}

export function PageBody({
  children,
  narrow,
}: {
  children: ReactNode;
  narrow?: boolean;
}) {
  return (
    <div
      className={`mx-auto grid w-full gap-5 px-4 py-5 sm:px-6 ${
        narrow ? "max-w-4xl" : "max-w-[1400px]"
      }`}
    >
      {children}
    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  flush,
  className = "",
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** No inner padding: for tables and lists that run edge to edge. */
  flush?: boolean;
  className?: string;
}) {
  return (
    <section
      className={`min-w-0 rounded-lg border bg-[var(--surface-strong)] ${className}`}
    >
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {description && (
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

export type Tone = "neutral" | "good" | "warning" | "danger" | "accent";

const toneText: Record<Tone, string> = {
  neutral: "text-[var(--foreground)]",
  good: "text-[var(--success)]",
  warning: "text-[var(--warning)]",
  danger: "text-[var(--danger)]",
  accent: "text-[var(--accent-strong)]",
};

export function StatTile({
  label,
  value,
  detail,
  tone = "neutral",
  href,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: Tone;
  href?: string;
}) {
  const body = (
    <>
      <p className="text-xs font-medium text-[var(--muted)]">{label}</p>
      <p
        className={`mt-1.5 text-2xl font-semibold tracking-[-0.02em] ${toneText[tone]}`}
      >
        {value}
      </p>
      {detail && (
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{detail}</p>
      )}
    </>
  );
  const className =
    "block min-w-0 rounded-lg border bg-[var(--surface-strong)] px-4 py-3.5";
  return href ? (
    <Link
      href={href}
      className={`${className} transition hover:border-[var(--line-strong)] hover:bg-[var(--surface)]`}
    >
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
  );
}

const badgeTone: Record<Tone, string> = {
  neutral: "border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]",
  good: "border-[#bfd0c3] bg-[#edf4ee] text-[var(--success)]",
  warning: "border-[#ead6b2] bg-[#fbf3e4] text-[var(--warning)]",
  danger: "border-[#e5c3bc] bg-[#fbeeeb] text-[var(--danger)]",
  accent: "border-[#efcfb6] bg-[#fbefe5] text-[var(--accent-strong)]",
};

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${badgeTone[tone]}`}
    >
      {children}
    </span>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonVariant: Record<ButtonVariant, string> = {
  primary:
    "border-[var(--foreground)] bg-[var(--foreground)] text-white hover:bg-[#343a32]",
  secondary:
    "border-[var(--line-strong)] bg-[var(--surface-strong)] text-[var(--foreground)] hover:bg-[var(--surface)]",
  ghost:
    "border-transparent bg-transparent text-[var(--foreground)] hover:bg-[var(--surface)]",
  danger:
    "border-[var(--danger)] bg-[var(--surface-strong)] text-[var(--danger)] hover:bg-[#fbeeeb]",
};

export function buttonClass(
  variant: ButtonVariant = "secondary",
  size: "sm" | "md" = "md",
) {
  return `inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${
    size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3.5 text-sm"
  } ${buttonVariant[variant]}`;
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: "sm" | "md";
}) {
  return (
    <Link className={`${buttonClass(variant, size)} ${className}`} {...props} />
  );
}

export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="grid place-items-center px-4 py-10 text-center">
      <p className="text-sm font-semibold">{title}</p>
      {detail && (
        <p className="mt-1 max-w-md text-sm leading-6 text-[var(--muted)]">
          {detail}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* Tables: wrap in <TableScroll> so wide tables scroll inside their panel. */
export function TableScroll({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

export const tableClass = "w-full border-collapse text-sm";
export const thClass =
  "border-b bg-[var(--surface)] px-4 py-2 text-left text-xs font-medium whitespace-nowrap text-[var(--muted)]";
export const thNumClass = `${thClass} text-right`;
export const tdClass = "border-b px-4 py-2.5 align-top";
export const tdNumClass = `${tdClass} text-right tabular-nums whitespace-nowrap`;

export const inputClass =
  "h-9 w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface-strong)] px-3 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]";
export const labelClass = "grid gap-1 text-xs font-medium text-[var(--muted)]";

export function formatMoney(
  value: number | null | undefined,
  options: { cents?: boolean; compact?: boolean } = {},
) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    notation: options.compact ? "compact" : "standard",
    minimumFractionDigits: options.cents === false ? 0 : 2,
    maximumFractionDigits: options.cents === false ? 0 : 2,
  });
}

export function formatPercent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return `${(value * 100).toFixed(digits)}%`;
}

export function Tabs({
  items,
}: {
  items: Array<{ label: string; href: string; active?: boolean }>;
}) {
  return (
    <nav
      className="-mb-px flex gap-1 overflow-x-auto border-b"
      aria-label="Section"
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={`border-b-2 px-3 py-2 text-sm whitespace-nowrap transition ${
            item.active
              ? "border-[var(--accent)] font-semibold text-[var(--foreground)]"
              : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

const calloutTone: Record<Tone, string> = {
  neutral: "border-[var(--line)] bg-[var(--surface)]",
  good: "border-[#bfd0c3] bg-[#f3f8f4]",
  warning: "border-[#ead6b2] bg-[#fdf8ee]",
  danger: "border-[#e5c3bc] bg-[#fcf2f0]",
  accent: "border-[#efcfb6] bg-[#fdf5ee]",
};

export function Callout({
  tone = "neutral",
  title,
  children,
  action,
}: {
  tone?: Tone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${calloutTone[tone]}`}
      role={tone === "danger" ? "alert" : undefined}
    >
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${toneText[tone]}`}>{title}</p>
        {children && (
          <div className="mt-0.5 text-sm text-[var(--muted)]">{children}</div>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Tab strip that sits directly under a PageHeader for multi-screen sections. */
export function SectionTabs({
  items,
}: {
  items: Array<{ label: string; href: string; active?: boolean }>;
}) {
  return (
    <div className="border-b bg-[var(--surface)]">
      <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6">
        <Tabs items={items} />
      </div>
    </div>
  );
}
