import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const workspace = process.cwd();
const accountsPath = resolve(workspace, "public/sample-data/accounts.csv");
const signalsPath = resolve(workspace, "public/sample-data/engagement_signals.json");
const invalidAccountsPath = resolve(workspace, "e2e/fixtures/invalid-accounts.csv");
const invalidSignalsPath = resolve(workspace, "e2e/fixtures/invalid-signals.json");

async function openDashboard(page: Page) {
  await page.goto("/");
  await expect(page.getByText("Team overview", { exact: true })).toBeVisible();
}

function watchRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("loads the supplied ranking and supports VP, SDR, reranking, and account evidence", async ({ page }) => {
  const errors = watchRuntimeErrors(page);
  await openDashboard(page);
  await expect(page.getByText("285", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("2026-07-28", { exact: true })).toBeVisible();
  await expect(page.getByTestId("ranking-table").locator("tbody tr")).toHaveCount(25);

  const defaultOrder = await page.getByTestId("ranking-table").locator("tbody tr .account-link").allTextContents();
  await page.getByLabel("Intent weight").fill("0");
  await expect(page.locator(".weight-panel output").nth(0)).toHaveText("0%");
  await expect(page.getByLabel("Reset score weights")).toBeEnabled();
  const rerankedOrder = await page.getByTestId("ranking-table").locator("tbody tr .account-link").allTextContents();
  expect(rerankedOrder).not.toEqual(defaultOrder);
  await page.getByLabel("Reset score weights").click();
  await expect(page.locator(".weight-panel output").nth(0)).toHaveText("55%");
  await expect(page.getByLabel("Reset score weights")).toBeDisabled();

  await page.getByLabel("Select persona").selectOption("Rep A");
  await expect(page.getByText("Rep A’s call list", { exact: true })).toBeVisible();
  await expect(page.getByTestId("ranking-table").locator("tbody tr")).toHaveCount(10);
  await expect(page.getByLabel("Published scoring strategy")).toContainText("Intent55%");
  await expect(page.getByLabel("Intent weight")).toHaveCount(0);
  await expect(page.getByLabel("Reset score weights")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Generate briefing", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Refresh data", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review issues", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export full ranking", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Prioritization week")).toBeDisabled();

  await page.getByTestId("ranking-table").locator("tbody tr").first().getByRole("button").first().click();
  await expect(page.getByRole("dialog").getByText("Factor breakdown", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").getByText("Inputs used", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Factor breakdown", { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("keeps failed uploads atomic and applies a validated two-file refresh", async ({ page }) => {
  const errors = watchRuntimeErrors(page);
  await openDashboard(page);
  const baselineLeader = await page.getByTestId("ranking-table").locator("tbody tr").first().locator("td").nth(1).innerText();

  await page.getByRole("button", { name: "Refresh data", exact: true }).click();
  await page.getByLabel("Account CSV file").setInputFiles(invalidAccountsPath);
  await page.getByLabel("Engagement JSON file").setInputFiles(signalsPath);
  await page.getByRole("button", { name: "Validate both files", exact: true }).click();
  await expect(page.locator(".upload-error")).toContainText("Current ranking unchanged");
  await page.getByLabel("Close data refresh").click();
  expect(await page.getByTestId("ranking-table").locator("tbody tr").first().locator("td").nth(1).innerText()).toBe(baselineLeader);

  await page.getByRole("button", { name: "Refresh data", exact: true }).click();
  await page.getByLabel("Account CSV file").setInputFiles(accountsPath);
  await page.getByLabel("Engagement JSON file").setInputFiles(signalsPath);
  await page.getByRole("button", { name: "Validate both files", exact: true }).click();
  await expect(page.getByLabel("Validation preview")).toContainText("300");
  await expect(page.getByLabel("Validation preview")).toContainText("286");
  await page.getByRole("button", { name: "Use this export", exact: true }).click();
  await expect(page.getByText("accounts.csv + engagement_signals.json", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Refresh data", exact: true }).click();
  await page.getByLabel("Account CSV file").setInputFiles(accountsPath);
  await page.getByLabel("Engagement JSON file").setInputFiles(invalidSignalsPath);
  await page.getByRole("button", { name: "Validate both files", exact: true }).click();
  await expect(page.locator(".upload-error")).toContainText("engagement export must be a JSON array");
  expect(errors).toEqual([]);
});

test("exposes the review queue and downloads a reproducible full ranking", async ({ page }) => {
  const errors = watchRuntimeErrors(page);
  await openDashboard(page);
  await page.getByRole("button", { name: /quality flags/i }).click();
  await expect(page.getByText("Review queue", { exact: true })).toBeVisible();
  await expect(page.locator(".review-item").first()).toContainText("Suggested CRM correction");
  await page.getByLabel("Filter review queue by category").selectOption("arr");
  await expect(page.locator(".review-item").first()).toContainText("ARR");
  await page.keyboard.press("Escape");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export full ranking", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("velora-account-priority-2026-08-17.csv");
  const path = await download.path();
  expect(path).not.toBeNull();
  const csv = await readFile(path as string, "utf8");
  expect(csv).toContain("rank,owner_rank,account,aliases");
  expect(csv).toContain("intent_weight,account_value_weight,contact_timing_weight,as_of_date");
  expect(csv).toContain("2026-08-17");
  expect(errors).toEqual([]);
});

test("renders both grounded AI and deterministic fallback briefings without reranking", async ({ page }) => {
  let requestCount = 0;
  await page.route("**/api/briefing", async (route) => {
    requestCount += 1;
    const body = route.request().postDataJSON();
    expect(body.prompt).toBeUndefined();
    expect(body.accounts.length).toBeLessThanOrEqual(40);
    const source = requestCount === 1 ? "ai" : "fallback";
    await route.fulfill({ status: source === "ai" ? 200 : 429, contentType: "application/json", body: JSON.stringify({
      briefing: { headline: source === "ai" ? "The fixed shortlist is ready" : "The same fixed shortlist remains ready", themes: ["Intent leads."], actions: ["Call the first ranked account."], caveats: ["Priority is not a probability."] },
      source,
      ...(source === "fallback" ? { warning: "Briefing request limit reached. Showing the deterministic summary." } : {}),
    }) });
  });

  await openDashboard(page);
  const leader = await page.getByTestId("ranking-table").locator("tbody tr").first().locator("td").nth(1).innerText();
  await page.getByRole("button", { name: "Generate briefing", exact: true }).click();
  await expect(page.getByText("The fixed shortlist is ready", { exact: true })).toBeVisible();
  await expect(page.locator(".briefing-source")).toHaveText(/AI grounded/i);
  await page.getByRole("button", { name: "Refresh briefing", exact: true }).click();
  await expect(page.getByText("The same fixed shortlist remains ready", { exact: true })).toBeVisible();
  await expect(page.locator(".briefing-source")).toHaveText(/Deterministic fallback/i);
  expect(await page.getByTestId("ranking-table").locator("tbody tr").first().locator("td").nth(1).innerText()).toBe(leader);
});

test("supports keyboard dismissal and a 390px mobile viewport without page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDashboard(page);
  await expect(page.getByAltText("Velora")).toBeVisible();
  await expect(page.getByLabel("Select persona")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole("button", { name: "Review issues", exact: true }).focus();
  await expect(page.getByRole("button", { name: "Review issues", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Review queue", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Review queue", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
