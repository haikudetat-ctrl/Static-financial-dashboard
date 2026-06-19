import { saveCountLineAction } from "@/app/(staff)/count/actions";
import { ExpectedQuantityReveal } from "@/components/inventory/expected-quantity-reveal";

export function CountLineForm({
  line,
}: {
  line: {
    id: string;
    name: string;
    unit: string;
    allowsTenths: boolean;
    countedQuantity: number | null;
    countedTenths: number;
    isOpenContainer: boolean;
    notes: string;
    status: string;
    expectedQuantity: string;
  };
}) {
  const action = saveCountLineAction.bind(null, line.id);

  return (
    <form action={action} className="border-t bg-[var(--surface-strong)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{line.name}</h3>
          <p className="mt-1 font-mono text-[10px] tracking-[0.12em] text-[var(--muted)] uppercase">
            Count in {line.unit}
          </p>
        </div>
        <span className="bg-[#f3eee8] px-2 py-1 text-[10px] font-semibold tracking-wide uppercase">
          {line.status.replace("_", " ")}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto] gap-3">
        <label className="grid gap-1.5 text-xs font-semibold">
          Quantity
          <input
            name="counted_quantity"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.001"
            defaultValue={line.countedQuantity ?? ""}
            required
            className="h-12 min-w-0 border bg-white px-3 text-lg"
          />
        </label>
        {line.allowsTenths && (
          <label className="grid gap-1.5 text-xs font-semibold">
            Bottle tenths
            <select
              name="counted_tenths"
              defaultValue={line.countedTenths}
              className="h-12 border bg-white px-3 text-base"
            >
              {Array.from({ length: 10 }, (_, index) => (
                <option key={index} value={index / 10}>
                  {index}/10
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {line.allowsTenths && (
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="is_open_container"
            defaultChecked={line.isOpenContainer}
            className="size-4 accent-[var(--accent)]"
          />
          Include the bottle tenths above
        </label>
      )}

      <ExpectedQuantityReveal value={line.expectedQuantity} />

      <label className="mt-3 grid gap-1.5 text-xs font-semibold">
        Note
        <input
          name="notes"
          defaultValue={line.notes}
          className="h-10 border bg-white px-3 text-sm font-normal"
          placeholder="Optional condition or location note"
        />
      </label>
      <button className="mt-4 min-h-11 w-full bg-[var(--foreground)] px-4 text-sm font-semibold text-white">
        Save item
      </button>
    </form>
  );
}
