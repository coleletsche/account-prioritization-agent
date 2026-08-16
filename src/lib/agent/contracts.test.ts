import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { processCrmExports } from "../data";
import { getEffectiveReviewQueue } from "../quality";
import { rankOrganizations } from "../scoring";
import { buildSalesAgentRequest } from "./contracts";

const fixture = (name: string) => readFileSync(resolve(process.cwd(), "public/sample-data", name), "utf8");

describe("sales agent account-book contract", () => {
  it("builds a validated request for every eligible supplied-data organization", () => {
    const data = processCrmExports(fixture("accounts.csv"), fixture("engagement_signals.json"));
    const ranked = rankOrganizations(data.organizations, { asOfDate: "2026-08-17" });
    const request = buildSalesAgentRequest(ranked, { asOfDate: "2026-08-17", issues: getEffectiveReviewQueue(data, "2026-08-17") });
    expect(request.accounts).toHaveLength(285);
    expect(request.accounts[0]).toMatchObject({
      owner_rank: expect.any(Number),
      data_status: expect.stringMatching(/^(valid|warning|blocked)$/),
      scores: { account_score: expect.anything(), intent_score: expect.any(Number), priority_score: expect.any(Number), priority_band: expect.stringMatching(/^P[0-3]$/) },
    });
    expect(request.accounts[0]).not.toHaveProperty("website");
  });
});
