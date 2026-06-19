import { expect, test } from "@playwright/test";

test("protected manager routes redirect anonymous users to sign in", async ({
  page,
}) => {
  await page.goto("/today");

  await expect(page).toHaveURL(/\/auth\/login\?next=%2Ftoday$/);
  await expect(
    page.getByRole("heading", { name: "Sign in to the shift." }),
  ).toBeVisible();
});

test("manager signs in to the desktop workspace", async ({ page }) => {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill("manager@static.local");
  await page.getByLabel("Password").fill("StaticOS123!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/today$/);
  await expect(
    page.getByRole("heading", { name: "The room is quiet." }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Manager navigation" }),
  ).toContainText("Financial health");
});

test("staff is routed away from manager pages", async ({ page }) => {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill("staff@static.local");
  await page.getByLabel("Password").fill("StaticOS123!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/receive$/);

  await page.goto("/today");
  await expect(page).toHaveURL(/\/receive$/);
});
