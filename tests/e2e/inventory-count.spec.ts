import { expect, test } from "@playwright/test";

test("manager inventory workspace exposes count and projection actions", async ({
  page,
}) => {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill("manager@static.local");
  await page.getByLabel("Password").fill("StaticOS123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/today$/);

  await page.goto("/inventory");

  await expect(
    page.getByRole("link", { name: "Start full count" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Start spot count" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "View on hand" })).toBeVisible();
});

test("full count moves from manager setup to staff entry and ledger posting", async ({
  page,
}) => {
  test.setTimeout(300_000);

  await page.goto("/auth/login");
  await page.getByLabel("Email").fill("manager@static.local");
  await page.getByLabel("Password").fill("StaticOS123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/today$/);

  await page.goto("/inventory/counts/new");
  const zones = page.getByRole("checkbox");
  await expect(zones).toHaveCount(2);
  await zones.nth(1).uncheck();
  await page.getByRole("button", { name: "Generate assignments" }).click();
  await expect(page).toHaveURL(/\/inventory\/counts\/[^/]+\/review$/);
  const reviewUrl = page.url();

  await page.context().clearCookies();
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill("staff@static.local");
  await page.getByLabel("Password").fill("StaticOS123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/receive$/);
  await page.goto("/count");

  for (const itemName of ["Bourbon 750 ml", "Gin 750 ml"]) {
    const form = page.locator("form").filter({ hasText: itemName });
    await form.getByLabel("Quantity").fill("1");
    await form
      .locator('select[name="counted_tenths"]')
      .selectOption({ label: "5/10" });
    await form
      .getByLabel("Include the bottle tenths above", { exact: true })
      .check();
    await form.getByRole("button", { name: "Save item" }).click();
    await expect(
      page.locator("form").filter({ hasText: itemName }).getByText("counted", {
        exact: true,
      }),
    ).toBeVisible();
  }

  await page.getByRole("button", { name: "Submit Back Bar" }).click();
  await expect(page.getByText("No count is assigned right now.")).toBeVisible();

  await page.context().clearCookies();
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill("manager@static.local");
  await page.getByLabel("Password").fill("StaticOS123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/today$/);
  await page.goto(reviewUrl);
  await page.getByRole("button", { name: "Approve and post" }).click();

  await expect(page).toHaveURL(/\/inventory\/on-hand$/);
  await expect(page.getByText("Last verified:")).toBeVisible();
  await expect(page.getByText("Bourbon 750 ml")).toBeVisible();
});
