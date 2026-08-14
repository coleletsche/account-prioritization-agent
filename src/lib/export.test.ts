import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { processCrmExports } from "./data";
import { buildRankingCsv } from "./export";
import { getAsOfIssues } from "./quality";
import { DEFAULT_WEIGHTS, rankOrganizations } from "./scoring";

const fixture = (name: string) => readFileSync(resolve(process.cwd(), "public/sample-data", name), "utf8");

describe("review and export workflow", () => {
  it("exports the full reproducible ranking and active score settings", () => {
    const data = processCrmExports(fixture("accounts.csv"), fixture("engagement_signals.json"));
    const ranking = rankOrganizations(data.organizations, { asOfDate: "2026-08-17", weights: DEFAULT_WEIGHTS });
    const csv = buildRankingCsv(ranking, { asOfDate: "2026-08-17", weights: DEFAULT_WEIGHTS });
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true });

    expect(parsed.data).toHaveLength(285);
    expect(parsed.data[0]).toMatchObject({ rank: "1", as_of_date: "2026-08-17", intent_weight: "55", account_value_weight: "30", contact_timing_weight: "15" });
    expect(parsed.meta.fields).toEqual(expect.arrayContaining(["aliases", "confidence", "intent_score", "account_value_score", "contact_timing_score", "reason", "warnings"]));
  });

  it("surfaces future dates relative to the selected week", () => {
    const data = processCrmExports([
      "account_name,industry,arr,last_contact_date,account_tier,website,region,owner",
      "Acme,Technology,1000,2026-08-20,Enterprise,https://acme.example,North America,Rep A",
    ].join("\n"), JSON.stringify([
      { account_name: "Acme", event_type: "demo_request", event_date: "2026-08-21", event_count: 1 },
    ]));

    expect(getAsOfIssues(data, "2026-08-17").map((issue) => issue.category)).toEqual(["contact_date", "engagement"]);
  });
});
