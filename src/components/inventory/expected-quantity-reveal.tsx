"use client";

import { useState } from "react";

export function ExpectedQuantityReveal({ value }: { value: string }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="mt-3 border-l-2 border-[var(--accent)] pl-3">
      <button
        type="button"
        onClick={() => setRevealed((current) => !current)}
        className="text-xs font-semibold text-[var(--accent-strong)] underline underline-offset-4"
      >
        {revealed ? "Hide expected" : "Reveal expected"}
      </button>
      {revealed && (
        <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
      )}
    </div>
  );
}
