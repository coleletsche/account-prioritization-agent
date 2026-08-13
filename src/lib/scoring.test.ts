import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { processCrmExports, type EngagementSignal, type ResolvedOrganization } from "./data";
import { DEFAULT_WEIGHTS, calculateIntentRaw, calculateTimingScore, calculateValueScore, normalizeToP95, percentile95, rankOrganizations, redistributeWeights } from "./scoring";

const fixture = (name: string) => readFileSync(resolve(process.cwd(), "public/sample-data", name), "utf8");
const assessment = () => processCrmExports(fixture("accounts.csv"), fixture("engagement_signals.json"));

function organization(overrides: Partial<ResolvedOrganization> = {}): ResolvedOrganization {
  return {
    id: "org-test", canonicalName: "Acme", aliases: ["Acme"], sourceRows: [2], website: "https://acme.test", domain: "acme.test",
    region: "North America", owner: "Rep A", engagements: [], confidence: "high", issues: [], eligible: true, ...overrides,
  };
}

function signal(eventDate: string): EngagementSignal {
  return { rowNumber: 1, accountName: "Acme", eventType: "page_visit", eventDate, eventCount: 4 };
}

describe("deterministic priority scoring", () => {
  it("applies a 30-day half-life to raw engagement intent", () => {
    const fresh = calculateIntentRaw([signal("2026-08-17")], "2026-08-17");
    const aged = calculateIntentRaw([signal("2026-07-18")], "2026-08-17");
    expect(aged).toBeCloseTo(fresh / 2, 8);
  });

  it("caps p95 normalization and timing components between 0 and 100", () => {
    expect(percentile95([1, 2, 3, 100])).toBe(100);
    expect(normalizeToP95(200, 100)).toBe(100);
    expect(calculateTimingScore("2025-01-01", "2026-08-17")).toBe(100);
    expect(calculateTimingScore("2027-01-01", "2026-08-17")).toBe(50);
  });

  it("reweights account value across the inputs that are present", () => {
    expect(calculateValueScore(organization({ accountTier: "Enterprise" }), 100_000)).toBe(85);
    expect(calculateValueScore(organization({ arr: 50_000 }), 100_000)).toBe(50);
    expect(calculateValueScore(organization(), 100_000)).toBe(50);
  });

  it("keeps slider weights at exactly 100 across edge cases", () => {
    const intentOnly = redistributeWeights(DEFAULT_WEIGHTS, "intent", 100);
    expect(intentOnly).toEqual({ intent: 100, value: 0, timing: 0 });
    const noIntent = redistributeWeights(DEFAULT_WEIGHTS, "intent", 0);
    expect(noIntent.intent + noIntent.value + noIntent.timing).toBe(100);
  });

  it("is independent of input row order and breaks exact ties by name", () => {
    const beta = organization({ id: "beta", canonicalName: "Beta", aliases: ["Beta"] });
    const alpha = organization({ id: "alpha", canonicalName: "Alpha", aliases: ["Alpha"] });
    const forward = rankOrganizations([beta, alpha], { asOfDate: "2026-08-17" }).map((account) => account.organization.canonicalName);
    const reverse = rankOrganizations([alpha, beta], { asOfDate: "2026-08-17" }).map((account) => account.organization.canonicalName);
    expect(forward).toEqual(["Alpha", "Beta"]);
    expect(reverse).toEqual(forward);
  });

  it("keeps every component and final score bounded", () => {
    const ranked = rankOrganizations(assessment().organizations, { asOfDate: "2026-08-17" });
    for (const account of ranked) {
      expect(account.score).toBeGreaterThanOrEqual(0);
      expect(account.score).toBeLessThanOrEqual(100);
      Object.values(account.factors).forEach((factor) => {
        expect(factor).toBeGreaterThanOrEqual(0);
        expect(factor).toBeLessThanOrEqual(100);
      });
    }
  });

  it("reproduces the default Top 10 for each SDR", () => {
    const ranked = rankOrganizations(assessment().organizations, { asOfDate: "2026-08-17" });
    const owners = [...new Set(ranked.map((account) => account.organization.owner as string))].sort();
    const topTen = Object.fromEntries(owners.map((owner) => [owner, ranked.filter((account) => account.organization.owner === owner).slice(0, 10).map((account) => account.organization.canonicalName)]));
    expect(topTen).toMatchSnapshot();
  });
});
