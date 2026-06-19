import Link from "next/link";

export function BrandMark({
  compact = false,
  inverse = false,
}: {
  compact?: boolean;
  inverse?: boolean;
}) {
  return (
    <Link
      href="/today"
      className={`inline-flex items-center gap-3 ${
        inverse ? "text-white" : "text-[var(--foreground)]"
      }`}
      aria-label="Static OS home"
    >
      <span
        className={`grid size-9 grid-cols-2 gap-1 border p-1 ${
          inverse
            ? "border-white bg-white"
            : "border-[var(--foreground)] bg-[var(--foreground)]"
        }`}
      >
        <span className={inverse ? "bg-[#20241f]" : "bg-[var(--surface)]"} />
        <span className="bg-[var(--accent)]" />
        <span
          className={`col-span-2 ${
            inverse ? "bg-[#20241f]" : "bg-[var(--surface)]"
          }`}
        />
      </span>
      {!compact && (
        <span>
          <span className="block text-[13px] font-semibold tracking-[-0.02em]">
            STATIC OS
          </span>
          <span
            className={`block font-mono text-[9px] tracking-[0.18em] uppercase ${
              inverse ? "text-[#9ea49b]" : "text-[var(--muted)]"
            }`}
          >
            Cost control
          </span>
        </span>
      )}
    </Link>
  );
}
