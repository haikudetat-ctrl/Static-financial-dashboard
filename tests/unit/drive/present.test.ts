import { describe, expect, it } from "vitest";

import { prettyName, shortFolder } from "@/lib/drive/present";
import { isSkipped } from "@/lib/drive/sync";

describe("prettyName", () => {
  it("reads a file named to the naming rule", () => {
    expect(prettyName("2026-10-18_Jared_Back-bar_Spot-count")).toBe(
      "2026-10-18 · Jared · Back bar · Spot count",
    );
    expect(prettyName("2026-10-14_Baldor_INV-88231.pdf")).toBe(
      "2026-10-14 · Baldor · INV 88231",
    );
  });

  it("leaves other names alone", () => {
    expect(prettyName("PECO bill Oct.pdf")).toBe("PECO bill Oct.pdf");
  });
});

describe("shortFolder", () => {
  it("shows the folder the file sits in, without its number", () => {
    expect(
      shortFolder(
        "P10 FY26 · Oct 5 – Nov 1 / 03 Inventory Counts / Spot Counts",
      ),
    ).toBe("Spot Counts");
    expect(shortFolder("P10 FY26 · Oct 5 – Nov 1 / 04 Waste & Spills")).toBe(
      "Waste & Spills",
    );
    expect(shortFolder("")).toBe("Top folder");
  });
});

describe("isSkipped", () => {
  it("skips templates and the Start Here doc", () => {
    const sheet = "application/vnd.google-apps.spreadsheet";
    expect(
      isSkipped({
        name: "TEMPLATE – Waste Log (make a copy)",
        mimeType: sheet,
      }),
    ).toBe(true);
    expect(
      isSkipped({
        name: "00 Start Here – how to file P10 documents",
        mimeType: "application/vnd.google-apps.document",
      }),
    ).toBe(true);
    expect(
      isSkipped({ name: "Copy of TEMPLATE – Waste Log", mimeType: sheet }),
    ).toBe(false);
    expect(
      isSkipped({ name: "2026-10-12_Back-bar_Waste-log", mimeType: sheet }),
    ).toBe(false);
  });
});
