import { test, expect } from "@playwright/test";
test("marketplace filters real seeded services and opens hiring form", async ({
  page,
}) => {
  await page.goto("/marketplace");
  await expect(
    page.getByRole("heading", { name: "Agent marketplace" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Search services" }).fill("7-Day");
  await expect(
    page.getByRole("heading", { name: "7-Day Weather Forecast", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "View service" }).click();
  await expect(page.getByLabel("City", { exact: true })).toHaveValue("Lima");
  await expect(page.getByRole("button", { name: "Hire Agent" })).toBeVisible();
});
test("dashboard shows measured empty state or actual ledger", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Total settled", { exact: true })).toBeVisible();
  await expect(
    page.getByText("pcUSD — Test Stablecoin", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: ".local/screenshots/dashboard.png",
    fullPage: true,
  });
});
test("mobile marketplace has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/marketplace");
  await expect(
    page.getByRole("heading", { name: "Agent marketplace" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/screenshots/mobile.png",
    fullPage: true,
  });
});
test("missing chain configuration is honestly reported", async ({
  page,
  request,
}) => {
  const health = await (
    await request.get("http://127.0.0.1:4000/health")
  ).json();
  test.skip(
    health.chainReady,
    "Escrow is connected; covered by chain flow tests",
  );
  await page.goto("/services/weather-7d");
  await page.getByRole("button", { name: "Hire Agent" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "mint" }),
  ).toBeVisible();
});
for (const malicious of [false, true])
  test(`real escrow UI ${malicious ? "rejects and refunds" : "settles"} delivery`, async ({
    page,
    request,
  }) => {
    test.skip(
      process.env.E2E_CHAIN !== "true",
      "Requires deployed Solana escrow; enable E2E_CHAIN=true. This is not a mocked settlement test.",
    );
    const health = await (
      await request.get("http://127.0.0.1:4000/health")
    ).json();
    expect(health.chainReady).toBe(true);
    await page.goto(
      `/services/${malicious ? "weather-7d-malicious" : "weather-7d"}`,
    );
    await page.getByRole("button", { name: "Hire Agent" }).click();
    await expect(page).toHaveURL(/\/agreements\//);
    await page.getByRole("button", { name: "Fund escrow & continue" }).click();
    if (malicious) {
      await expect(
        page.getByText("Delivery rejected", { exact: true }),
      ).toBeVisible({ timeout: 90000 });
      await page
        .getByRole("button", { name: "Refund protected funds" })
        .click();
      await expect(
        page.getByText("Refund completed", { exact: true }),
      ).toBeVisible({ timeout: 30000 });
    } else
      await expect(
        page.getByText("Payment released", { exact: true }),
      ).toBeVisible({ timeout: 90000 });
    await page.getByRole("button", { name: "View Evidence" }).click();
    await expect(page.locator("pre")).toContainText("Lima");
    await page.screenshot({
      path: `.local/screenshots/${malicious ? "failure" : "success"}.png`,
      fullPage: true,
    });
  });
