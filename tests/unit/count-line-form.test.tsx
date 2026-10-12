import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(staff)/count/actions", () => ({
  saveCountLineAction: vi.fn(),
}));

import { CountLineForm } from "@/components/inventory/count-line-form";

const line = {
  id: "line-1",
  name: "Campari 1 L",
  unit: "btl",
  allowsTenths: true,
  countedQuantity: null,
  countedTenths: 0,
  isOpenContainer: false,
  notes: "",
  status: "pending",
  expectedQuantity: "3 btl",
};

describe("CountLineForm", () => {
  afterEach(cleanup);

  it("steps whole bottles and adds the open bottle from a tenths chip", async () => {
    const user = userEvent.setup();
    const { container } = render(<CountLineForm line={line} next />);

    await user.click(screen.getByRole("button", { name: "One more" }));
    await user.click(screen.getByRole("button", { name: "One more" }));
    await user.click(screen.getByRole("button", { name: "One more" }));
    await user.click(screen.getByRole("button", { name: "One less" }));
    expect(screen.getByLabelText("Quantity")).toHaveValue(2);

    await user.click(screen.getByText(".4", { exact: true }));
    expect(
      screen.getByRole("button", { name: "Save 2.4 btl" }),
    ).toBeInTheDocument();
    expect(
      container.querySelector('input[name="is_open_container"]'),
    ).toHaveValue("on");

    await user.click(screen.getByText("0", { exact: true }));
    expect(
      container.querySelector('input[name="is_open_container"]'),
    ).toBeNull();
  });

  it("folds a counted line to one row until it is edited", async () => {
    const user = userEvent.setup();
    render(
      <CountLineForm
        line={{
          ...line,
          status: "counted",
          countedQuantity: 1,
          countedTenths: 0.5,
          isOpenContainer: true,
        }}
      />,
    );

    expect(screen.getByText("1.5 btl")).toBeInTheDocument();
    expect(screen.queryByLabelText("Quantity")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Quantity")).toHaveValue(1);
  });
});
