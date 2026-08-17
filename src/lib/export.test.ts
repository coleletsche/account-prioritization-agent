import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { buildSalesAgentRequest, deterministicRecommendations } from "./agent";
import { processCrmExports } from "./data";
import { buildRankingCsv } from "./export";
import { getEffectiveReviewQueue } from "./quality";
import { DEFAULT_WEIGHTS, rankOrganizations } from "./scoring";

const fixture = (name: string) => readFileSync(resolve(process.cwd(), "public/sample-data", name), "utf8");

describe("review and export workflow", () => {
  it("exports the full reproducible ranking and active score settings", () => {
    const data = processCrmExports(fixture("accounts.csv"), fixture("engagement_signals.json"));
    const ranking = rankOrganizations(data.organizations, { asOfDate: "2026-08-17", weights: DEFAULT_WEIGHTS });
    const request = buildSalesAgentRequest(ranking, { asOfDate: "2026-08-17", issues: [] });
    const recommendations = new Map(deterministicRecommendations(request).map((recommendation) => [recommendation.account_id, recommendation]));
    const csv = buildRankingCsv(ranking, { asOfDate: "2026-08-17", weights: DEFAULT_WEIGHTS, recommendations });
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true });

    expect(parsed.data).toHaveLength(285);
    expect(parsed.data[0]).toMatchObject({ rank: "1", as_of_date: "2026-08-17", intent_weight: "55", account_value_weight: "30", contact_timing_weight: "15" });
    expect(parsed.meta.fields).toEqual(expect.arrayContaining(["aliases", "confidence", "account_score", "intent_score", "priority_band", "why_now", "recommended_action", "call_angle", "warnings"]));
    expect(parsed.meta.fields).not.toContain("in_daily_queue");
    expect(parsed.data[0]).toMatchObject({ recommended_action: expect.stringMatching(/^(call_today|call_this_week|email|nurture)$/) });
  });

  it("surfaces future dates relative to the selected week", () => {
    const data = processCrmExports([
      "account_name,industry,arr,last_contact_date,account_tier,website,region,owner",
      "Acme,Technology,1000,2026-08-20,Enterprise,https://acme.example,North America,Rep A",
    ].join("\n"), JSON.stringify([
      { account_name: "Acme", event_type: "demo_request", event_date: "2026-08-21", event_count: 1 },
    ]));

    expect(getEffectiveReviewQueue(data, "2026-08-17").map((issue) => issue.category)).toEqual(["contact_date", "engagement"]);
  });
});
