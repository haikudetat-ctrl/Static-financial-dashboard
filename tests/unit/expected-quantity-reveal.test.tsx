import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ExpectedQuantityReveal } from "@/components/inventory/expected-quantity-reveal";

describe("ExpectedQuantityReveal", () => {
  it("keeps expected quantity hidden until explicitly revealed", async () => {
    const user = userEvent.setup();
    render(<ExpectedQuantityReveal value="4.5 btl" />);

    expect(screen.queryByText("4.5 btl")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reveal expected" }));
    expect(screen.getByText("4.5 btl")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Hide expected" }));
    expect(screen.queryByText("4.5 btl")).not.toBeInTheDocument();
  });
});
