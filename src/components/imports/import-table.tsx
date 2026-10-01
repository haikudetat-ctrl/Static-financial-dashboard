import Link from "next/link";

import {
  Badge,
  EmptyState,
  TableScroll,
  tableClass,
  tdClass,
  tdNumClass,
  thClass,
  thNumClass,
  type Tone,
} from "@/components/ui";
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

const STATUS_TONE: Record<string, Tone> = {
  posted: "good",
  failed: "danger",
  duplicate: "warning",
  ready: "accent",
};

export function ImportTable({ imports }: { imports: ImportRecord[] }) {
  if (imports.length === 0) {
    return (
      <EmptyState
        title="No imports yet"
        detail="Upload last night's Toast export to get started."
      />
    );
  }

  return (
    <TableScroll>
      <table className={tableClass}>
        <thead>
          <tr>
            <th className={thClass}>File</th>
            <th className={thClass}>Type</th>
            <th className={thNumClass}>Rows</th>
            <th className={thClass}>Status</th>
            <th className={thClass}>Uploaded</th>
          </tr>
        </thead>
        <tbody>
          {imports.map((imp) => (
            <tr key={imp.id} className="hover:bg-[var(--surface)]">
              <td className={tdClass}>
                <Link
                  href={`/imports/${imp.id}`}
                  className="font-medium hover:underline"
                >
                  {imp.file_name}
                </Link>
              </td>
              <td className={`${tdClass} text-[var(--muted)]`}>
                {imp.source_type}
              </td>
              <td className={tdNumClass}>{imp.row_count}</td>
              <td className={tdClass}>
                <Badge tone={STATUS_TONE[imp.status] ?? "neutral"}>
                  {IMPORT_STATUS_LABELS[imp.status] ?? imp.status}
                </Badge>
              </td>
              <td
                className={`${tdClass} whitespace-nowrap text-[var(--muted)]`}
              >
                {new Date(imp.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}
