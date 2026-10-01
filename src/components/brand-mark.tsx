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
      className={`inline-flex items-center gap-2.5 ${
        inverse ? "text-white" : "text-[var(--foreground)]"
      }`}
      aria-label="Static OS home"
    >
      <span
        className={`grid size-8 grid-cols-2 gap-[3px] rounded-md border p-1 ${
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
          <span className="block text-sm font-semibold tracking-[-0.01em]">
            Static OS
          </span>
        </span>
      )}
    </Link>
  );
}
