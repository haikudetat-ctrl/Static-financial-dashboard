import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { IMPORT_STATUS_LABELS } from "@/lib/imports";

type ImportRecord = {
  id: string;
  source_type: string;
  file_name: string;
  status: string;
  row_count: number;
  created_at: string;
  approved_at: string | null;
};

export function ImportTable({ imports }: { imports: ImportRecord[] }) {
  if (imports.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--muted)]">
        No imports yet. Upload a file above.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left font-mono text-[9px] tracking-[0.13em] text-[var(--muted)] uppercase">
            <th className="pr-4 pb-3 font-normal">File</th>
            <th className="pr-4 pb-3 font-normal">Type</th>
            <th className="pr-4 pb-3 font-normal">Rows</th>
            <th className="pr-4 pb-3 font-normal">Status</th>
            <th className="pr-4 pb-3 font-normal">Date</th>
            <th className="pb-3 font-normal" />
          </tr>
        </thead>
        <tbody>
          {imports.map((imp) => (
            <tr key={imp.id} className="border-b last:border-b-0">
              <td className="py-3 pr-4 font-medium">{imp.file_name}</td>
              <td className="py-3 pr-4 text-[var(--muted)]">
                {imp.source_type}
              </td>
              <td className="py-3 pr-4 text-[var(--muted)]">{imp.row_count}</td>
              <td className="py-3 pr-4">
                <span
                  className={`inline-block rounded px-2 py-0.5 font-mono text-[10px] uppercase ${
                    imp.status === "posted"
                      ? "bg-[#edf4ee] text-[#3f6d55]"
                      : imp.status === "failed"
                        ? "bg-[#f8e9e6] text-[#7e3025]"
                        : imp.status === "duplicate"
                          ? "bg-[#f7f3e6] text-[#7a6d27]"
                          : "bg-[#eef0ec] text-[#62685f]"
                  }`}
                >
                  {IMPORT_STATUS_LABELS[imp.status] ?? imp.status}
                </span>
              </td>
              <td className="py-3 pr-4 text-[var(--muted)]">
                {new Date(imp.created_at).toLocaleDateString()}
              </td>
              <td className="py-3">
                <Link
                  href={`/imports/${imp.id}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold hover:text-[var(--accent)]"
                >
                  Review
                  <ArrowUpRight size={13} strokeWidth={1.7} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
