import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const matchInvoiceLineAction = vi.fn();
const addItemFromInvoiceLineAction = vi.fn();
vi.mock("@/app/(manager)/invoices/actions", () => ({
  matchInvoiceLineAction: (...args: unknown[]) =>
    matchInvoiceLineAction(...args),
  addItemFromInvoiceLineAction: (...args: unknown[]) =>
    addItemFromInvoiceLineAction(...args),
  postInvoiceAction: vi.fn(),
}));

import { LineMatch } from "@/app/(manager)/invoices/[id]/review/review-controls";

const items = [
  { id: "oranges", name: "Oranges", code: "1023" },
  { id: "ojuice", name: "House Orange Juice", code: "1013" },
  { id: "mint", name: "Mint", code: "1036" },
];

const newItem = {
  description: "HONEY CLOVER 5 LB USA",
  packSize: "5 LB",
  invoiceUnit: "EACH",
  defaults: {
    name: "Honey Clover",
    cogsClass: "bar_consumables",
    pack: { countUnitId: "lb", quantity: 5 },
  },
  options: {
    categories: [{ id: "pantry", name: "Pantry & Spices" }],
    units: [
      { id: "each", name: "Each", unitType: "each", factor: 1 },
      { id: "lb", name: "Pound", unitType: "weight", factor: 16 },
    ],
    cogsClasses: [
      { value: "bar_consumables", label: "Bar consumables" },
      { value: "food", label: "Food" },
    ],
  },
};

describe("LineMatch", () => {
  beforeEach(() => {
    matchInvoiceLineAction.mockResolvedValue({ ok: true });
    addItemFromInvoiceLineAction.mockResolvedValue({ ok: true, itemId: "new" });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("offers the top suggestion and matches it in one click", async () => {
    const user = userEvent.setup();
    render(
      <LineMatch
        invoiceId="inv"
        lineId="line"
        current={null}
        source={null}
        items={items}
        editable
        suggestions={[
          {
            itemId: "oranges",
            name: "Oranges",
            code: "1023",
            score: 0.86,
            reason: "Name matches, and sold under code orah",
          },
        ]}
      />,
    );

    expect(screen.getByText("Not matched")).toBeInTheDocument();
    expect(
      screen.getByText("Name matches, and sold under code orah"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use Oranges" }));
    expect(matchInvoiceLineAction).toHaveBeenCalledWith(
      "inv",
      "line",
      "oranges",
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("lists suggestions first when the search opens", async () => {
    const user = userEvent.setup();
    render(
      <LineMatch
        invoiceId="inv"
        lineId="line"
        current={null}
        source={null}
        items={items}
        editable
        suggestions={[
          {
            itemId: "ojuice",
            name: "House Orange Juice",
            code: "1013",
            score: 0.95,
            reason: "Name matches, and sold under code houorah",
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Search items" }));
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveTextContent("House Orange Juice");
    expect(options[0]).toHaveTextContent("sold under code houorah");
  });

  it("creates a new item from the line and matches it", async () => {
    const user = userEvent.setup();
    render(
      <LineMatch
        invoiceId="inv"
        lineId="line"
        current={null}
        source={null}
        items={items}
        editable
        newItem={newItem}
      />,
    );

    await user.click(screen.getByRole("button", { name: "New item" }));
    expect(screen.getByLabelText("Name")).toHaveValue("Honey Clover");
    expect(
      screen.getByLabelText("How many count units one EACH holds"),
    ).toHaveValue(5);
    await user.selectOptions(screen.getByLabelText("Category"), "pantry");
    await user.click(screen.getByRole("button", { name: "Create and match" }));

    expect(addItemFromInvoiceLineAction).toHaveBeenCalledWith("inv", "line", {
      name: "Honey Clover",
      categoryId: "pantry",
      cogsClass: "bar_consumables",
      countUnitId: "lb",
      countUnitsPerInvoiceUnit: 5,
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps the form open and shows why when creating fails", async () => {
    addItemFromInvoiceLineAction.mockResolvedValue({
      ok: false,
      error: "An item named Honey Clover already exists.",
    });
    const user = userEvent.setup();
    render(
      <LineMatch
        invoiceId="inv"
        lineId="line"
        current={null}
        source={null}
        items={items}
        editable
        newItem={newItem}
      />,
    );

    await user.click(screen.getByRole("button", { name: "New item" }));
    await user.click(screen.getByRole("button", { name: "Create and match" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "already exists",
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
