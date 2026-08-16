import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const workspace = process.cwd();
const accountsPath = resolve(workspace, "public/sample-data/accounts.csv");
const signalsPath = resolve(workspace, "public/sample-data/engagement_signals.json");
const invalidAccountsPath = resolve(workspace, "e2e/fixtures/invalid-accounts.csv");
const invalidSignalsPath = resolve(workspace, "e2e/fixtures/invalid-signals.json");

function recommendationFor(account: { account_id: string; account_name: string; scores: { priority_band: string; priority_score: number } }, source: "ai" | "fallback") {
  return {
    account_id: account.account_id,
    why_now: source === "ai" ? `AI interpretation for ${account.account_name}.` : `${account.scores.priority_band} at ${account.scores.priority_score.toFixed(1)}. Deterministic account rationale.`,
    recommended_action: "call_this_week",
    urgency: "high",
    call_angle: "Use only the supplied CRM and engagement evidence.",
    confidence: "high",
  };
}

async function mockDeterministicAgent(page: Page) {
  await page.route("**/api/recommendations", async (route) => {
    const body = route.request().postDataJSON();
    const recommendations = body.accounts.map((account: Parameters<typeof recommendationFor>[0]) => recommendationFor(account, "fallback"));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      recommendations,
      source: "fallback",
      coverage: { total: recommendations.length, ai: 0, fallback: recommendations.length },
      warning: "AI recommendations are not configured. Showing the deterministic action plan.",
    }) });
  });
}

async function openDashboard(page: Page, options: { installDefaultAgentMock?: boolean } = {}) {
  if (options.installDefaultAgentMock !== false) await mockDeterministicAgent(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Prepare this account book" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Return to account preparation" })).toHaveCount(0);
  await expect(page.getByLabel("Select persona")).toHaveCount(0);
  await page.getByRole("button", { name: "Use sample data" }).click();
  await expect(page.getByText("engagement_signals.json", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Analyze account book" }).click();
  await expect(page.getByRole("heading", { name: "Account ranking", exact: true })).toBeVisible();
}

function watchRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("starts with intake, analyzes the full supplied account book, and preserves VP/rep permissions", async ({ page }) => {
  const errors = watchRuntimeErrors(page);
  await openDashboard(page);
  await expect(page.getByText("Account Priority Agent", { exact: true })).toBeVisible();
  await expect(page.getByText("Showing 1–25 of 285 eligible accounts", { exact: true })).toBeVisible();
  await expect(page.getByTestId("ranking-table").locator("tbody tr")).toHaveCount(25);
  await expect(page.getByRole("button", { name: "Previous page" })).toBeDisabled();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByText("Showing 26–50 of 285 eligible accounts", { exact: true })).toBeVisible();
  await expect(page.getByTestId("ranking-table").locator("tbody tr").first().locator(".rank-number")).toHaveText("26");
  await page.getByRole("button", { name: "Previous page" }).click();
  const firstRow = page.getByTestId("ranking-table").locator("tbody tr").first();
  await expect(firstRow.locator("td").nth(4)).not.toContainText(/immediate|high/i);
  expect(await firstRow.locator(".owner-chip").evaluate((element) => getComputedStyle(element).whiteSpace)).toBe("nowrap");

  const defaultOrder = await page.getByTestId("ranking-table").locator("tbody tr .account-link").allTextContents();
  await page.getByRole("button", { name: "Scoring controls", exact: true }).click();
  await expect(page.getByRole("heading", { name: "How signals map to intent" })).toBeVisible();
  await page.getByLabel("Intent weight").fill("0");
  await expect(page.locator(".weight-panel output").nth(0)).toHaveText("0%");
  const rerankedOrder = await page.getByTestId("ranking-table").locator("tbody tr .account-link").allTextContents();
  expect(rerankedOrder).not.toEqual(defaultOrder);
  await page.getByLabel("Reset score weights").click();
  await page.getByRole("button", { name: "Close workspace tools", exact: true }).click();

  await page.getByLabel("Select persona").selectOption("Rep A");
  await expect(page.getByRole("heading", { name: "Rep A’s account ranking", exact: true })).toBeVisible();
  await expect(page.getByTestId("ranking-table").locator("tbody tr")).toHaveCount(25);
  await expect(page.getByText(/Showing 1–25 of \d+ eligible accounts/)).toBeVisible();
  await page.getByRole("button", { name: "Published scoring", exact: true }).click();
  await expect(page.getByLabel("Published scoring strategy")).toContainText("Intent55%");
  await expect(page.getByLabel("Intent weight")).toHaveCount(0);
  await page.getByRole("button", { name: "Close workspace tools", exact: true }).click();
  await expect(page.getByRole("button", { name: "Replace account book", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Prioritization week")).toBeDisabled();
  await page.getByRole("button", { name: "Analysis status", exact: true }).click();
  await expect(page.getByText("VP-managed analysis · read only", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh account analysis", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Close workspace tools", exact: true }).click();

  await page.getByTestId("ranking-table").locator("tbody tr").first().getByRole("button").first().click();
  await expect(page.getByRole("dialog").getByText("Factor breakdown", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Return to account preparation" }).click();
  await expect(page.getByRole("heading", { name: "Prepare this account book" })).toBeVisible();
  await expect(page.getByLabel("Select persona")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Analyze account book", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Use sample data" }).click();
  await page.getByRole("button", { name: "Analyze account book", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Account ranking", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("keeps failed replacements atomic and analyzes a valid replacement", async ({ page }) => {
  const errors = watchRuntimeErrors(page);
  await openDashboard(page);
  const baselineLeader = await page.getByTestId("ranking-table").locator("tbody tr").first().locator("td").nth(1).innerText();

  await page.getByRole("button", { name: /Data tools/i }).click();
  await page.getByRole("button", { name: "Replace account book", exact: true }).click();
  await page.getByLabel("Account CSV file").setInputFiles(invalidAccountsPath);
  await page.getByLabel("Engagement JSON file").setInputFiles(signalsPath);
  await page.getByRole("button", { name: "Analyze account book", exact: true }).click();
  await expect(page.locator(".upload-error")).toContainText("Analysis could not start");
  await page.getByLabel("Close data refresh").click();
  expect(await page.getByTestId("ranking-table").locator("tbody tr").first().locator("td").nth(1).innerText()).toBe(baselineLeader);

  await page.getByRole("button", { name: /Data tools/i }).click();
  await page.getByRole("button", { name: "Replace account book", exact: true }).click();
  await page.getByLabel("Account CSV file").setInputFiles(accountsPath);
  await page.getByLabel("Engagement JSON file").setInputFiles(signalsPath);
  await page.getByRole("button", { name: "Analyze account book", exact: true }).click();
  await expect(page.getByText("accounts.csv + engagement_signals.json", { exact: true })).toBeVisible();
  await expect(page.getByText("Showing 1–25 of 285 eligible accounts", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Data tools/i }).click();
  await page.getByRole("button", { name: "Replace account book", exact: true }).click();
  await page.getByLabel("Account CSV file").setInputFiles(accountsPath);
  await page.getByLabel("Engagement JSON file").setInputFiles(invalidSignalsPath);
  await page.getByRole("button", { name: "Analyze account book", exact: true }).click();
  await expect(page.locator(".upload-error")).toContainText("engagement export must be a JSON array");
  expect(errors).toEqual([]);
});

test("exposes held-out records and exports every ranked account with an action", async ({ page }) => {
  await openDashboard(page);
  await page.getByRole("button", { name: /Data tools/i }).click();
  await page.getByRole("button", { name: /Review issues/i }).click();
  await expect(page.getByText("Review queue", { exact: true })).toBeVisible();
  await expect(page.getByText("Held out", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /Data tools/i }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export full ranking", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("velora-account-priority-2026-08-17.csv");
  const path = await download.path();
  const csv = await readFile(path as string, "utf8");
  expect(csv).toContain("rank,owner_rank,account,aliases");
  expect(csv).not.toContain("in_daily_queue");
  expect(csv.trim().split("\n")).toHaveLength(286);
});

test("shows complete, partial, and fallback analysis without reranking", async ({ page }) => {
  let requestCount = 0;
  await page.route("**/api/recommendations", async (route) => {
    requestCount += 1;
    const body = route.request().postDataJSON();
    expect(body.prompt).toBeUndefined();
    expect(body.accounts.length).toBe(285);
    const source = requestCount === 1 ? "ai" : "mixed";
    const ai = source === "ai" ? body.accounts.length : 200;
    const recommendations = body.accounts.map((account: Parameters<typeof recommendationFor>[0], index: number) => recommendationFor(account, index < ai ? "ai" : "fallback"));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      recommendations,
      source,
      coverage: { total: recommendations.length, ai, fallback: recommendations.length - ai },
      ...(source === "mixed" ? { warning: `AI interpreted ${ai} of ${recommendations.length} accounts.` } : {}),
    }) });
  });

  await openDashboard(page, { installDefaultAgentMock: false });
  const leader = await page.getByTestId("ranking-table").locator("tbody tr").first().locator("td").nth(1).innerText();
  await expect(page.getByTestId("ranking-table").locator("tbody tr").first()).toContainText("AI interpretation for");
  await page.getByRole("button", { name: "Analysis status", exact: true }).click();
  await expect(page.locator(".agent-source")).toHaveText(/AI complete/i);
  await page.getByRole("button", { name: "Refresh account analysis", exact: true }).click();
  await expect(page.locator(".agent-source")).toHaveText(/Mixed coverage/i);
  await expect(page.getByLabel("Analysis status").getByText("200", { exact: true })).toBeVisible();
  expect(await page.getByTestId("ranking-table").locator("tbody tr").first().locator("td").nth(1).innerText()).toBe(leader);
});

test("supports the complete intake and ranking flow at 390px without page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockDeterministicAgent(page);
  await page.goto("/");
  await expect(page.getByAltText("Velora")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Use sample data" }).click();
  await page.getByRole("button", { name: "Analyze account book" }).click();
  await expect(page.getByRole("heading", { name: "Account ranking", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: /Data tools/i }).click();
  await page.getByRole("button", { name: /Review issues/i }).click();
  await expect(page.getByText("Review queue", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
