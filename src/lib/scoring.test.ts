import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { processCrmExports, type EngagementSignal, type ResolvedOrganization } from "./data";
import { DEFAULT_WEIGHTS, calculateIntentFeatures, calculateIntentRaw, calculateTimingScore, calculateValueScore, normalizeToP95, percentile95, priorityBandFor, rankOrganizations, redistributeWeights } from "./scoring";

const fixture = (name: string) => readFileSync(resolve(process.cwd(), "public/sample-data", name), "utf8");
const assessment = () => processCrmExports(fixture("accounts.csv"), fixture("engagement_signals.json"));

function organization(overrides: Partial<ResolvedOrganization> = {}): ResolvedOrganization {
  return {
    id: "org-test", accountIds: [], canonicalName: "Acme", aliases: ["Acme"], sourceRows: [2], website: "https://acme.test", domain: "acme.test",
    region: "North America", owner: "Rep A", engagements: [], confidence: "high", validationStatus: "valid", issues: [], eligible: true, ...overrides,
  };
}

function signal(eventDate: string, overrides: Partial<EngagementSignal> = {}): EngagementSignal {
  return { rowNumber: 1, accountName: "Acme", eventType: "page_visit", eventDate, eventCount: 4, validationStatus: "valid", ...overrides };
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
    expect(calculateTimingScore("2027-01-01", "2026-08-17")).toBeUndefined();
    expect(calculateTimingScore(undefined, "2026-08-17")).toBeUndefined();
  });

  it("reweights account value across the inputs that are present", () => {
    expect(calculateValueScore(organization({ accountTier: "Enterprise" }), 100_000)).toBe(85);
    expect(calculateValueScore(organization({ arr: 50_000 }), 100_000)).toBe(50);
    expect(calculateValueScore(organization(), 100_000)).toBeUndefined();
  });

  it("uses event strength, log frequency, and signal breadth without scoring blocked duplicates", () => {
    const email = calculateIntentRaw([signal("2026-08-17", { eventType: "email_open", eventCount: 1 })], "2026-08-17");
    const demo = calculateIntentRaw([signal("2026-08-17", { eventType: "demo_request", eventCount: 1 })], "2026-08-17");
    expect(demo).toBeCloseTo(email * 10, 8);

    const oneOpen = calculateIntentRaw([signal("2026-08-17", { eventType: "email_open", eventCount: 1 })], "2026-08-17");
    const nineOpens = calculateIntentRaw([signal("2026-08-17", { eventType: "email_open", eventCount: 9 })], "2026-08-17");
    expect(nineOpens / oneOpen).toBeCloseTo(Math.log1p(9) / Math.log1p(1), 8);

    const sameType = calculateIntentFeatures([
      signal("2026-08-17", { rowNumber: 1, eventType: "email_open", eventCount: 1 }),
      signal("2026-08-17", { rowNumber: 2, eventType: "email_open", eventCount: 1 }),
    ], "2026-08-17");
    const broad = calculateIntentFeatures([
      signal("2026-08-17", { rowNumber: 1, eventType: "email_open", eventCount: 1 }),
      signal("2026-08-17", { rowNumber: 2, eventType: "page_visit", eventCount: 1 }),
    ], "2026-08-17");
    expect(sameType.signalBreadth).toBe(1);
    expect(broad.signalBreadth).toBe(2);
    expect(broad.rawScore).toBeGreaterThan(email + email * 2);

    const duplicateBlocked = calculateIntentRaw([
      signal("2026-08-17", { rowNumber: 1, eventType: "demo_request", eventCount: 1 }),
      signal("2026-08-17", { rowNumber: 2, eventType: "demo_request", eventCount: 1, validationStatus: "blocked", duplicateOfRowNumber: 1 }),
    ], "2026-08-17");
    expect(duplicateBlocked).toBeCloseTo(demo, 8);
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
      Object.values(account.factors).filter((factor): factor is number => factor !== undefined).forEach((factor) => {
        expect(factor).toBeGreaterThanOrEqual(0);
        expect(factor).toBeLessThanOrEqual(100);
      });
    }
  });

  it("derives account score from available value and contact staleness while preserving unknowns", () => {
    const known = rankOrganizations([organization({ accountTier: "Enterprise", arr: 50_000, lastContactDate: "2026-07-03" })], { asOfDate: "2026-08-17" })[0];
    expect(known.accountFeatures.contactStalenessDays).toBe(45);
    expect(known.accountScore).toBeCloseTo((90.25 * 30 + 50 * 15) / 45, 6);

    const timingOnly = rankOrganizations([organization({ lastContactDate: "2026-05-19" })], { asOfDate: "2026-08-17" })[0];
    expect(timingOnly.factors.value).toBeUndefined();
    expect(timingOnly.accountScore).toBe(100);
  });

  it("assigns fixed deterministic priority bands at every boundary", () => {
    expect(priorityBandFor(100)).toBe("P0");
    expect(priorityBandFor(80)).toBe("P0");
    expect(priorityBandFor(79.999)).toBe("P1");
    expect(priorityBandFor(65)).toBe("P1");
    expect(priorityBandFor(45)).toBe("P2");
    expect(priorityBandFor(44.999)).toBe("P3");
  });

  it("reproduces the default Top 10 for each SDR", () => {
    const ranked = rankOrganizations(assessment().organizations, { asOfDate: "2026-08-17" });
    const owners = [...new Set(ranked.map((account) => account.organization.owner as string))].sort();
    const topTen = Object.fromEntries(owners.map((owner) => [owner, ranked.filter((account) => account.organization.owner === owner).slice(0, 10).map((account) => account.organization.canonicalName)]));
    expect(topTen).toMatchSnapshot();
  });
});
