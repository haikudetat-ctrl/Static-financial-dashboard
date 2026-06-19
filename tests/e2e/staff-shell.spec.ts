import { expect, test } from "@playwright/test";

test("staff task shell stays focused on four mobile actions", async ({
  page,
}) => {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill("staff@static.local");
  await page.getByLabel("Password").fill("StaticOS123!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/receive$/);
  await expect(
    page.getByRole("heading", { name: "Receive a delivery." }),
  ).toBeVisible();

  const navigation = page.getByRole("navigation", {
    name: "Staff task navigation",
  });
  await expect(navigation.getByRole("link")).toHaveCount(4);
  await expect(navigation).toContainText("Receive");
  await expect(navigation).toContainText("Count");
  await expect(navigation).toContainText("Production");
  await expect(navigation).toContainText("Waste");
});
