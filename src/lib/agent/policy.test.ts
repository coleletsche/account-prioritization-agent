import { describe, expect, it } from "vitest";
import type { AgentAccount, AccountRecommendation } from "./contracts";
import { finalizeModelRecommendations } from "./orchestrator";
import { deterministicRecommendation, enforceRecommendationPolicy } from "./policy";

function account(overrides: Partial<AgentAccount> = {}): AgentAccount {
  return {
    account_id: "org-acme",
    rank: 1,
    owner_rank: 1,
    owner: "Rep A",
    account_name: "Acme Foundation",
    industry: "Technology",
    region: "North America",
    tier: "Enterprise",
    arr: 100_000,
    last_contact_date: "2026-07-01",
    contact_suppressed: null,
    identity_resolved: true,
    data_status: "valid",
    scores: { account_score: 82, intent_score: 90, priority_score: 88, priority_band: "P0" },
    intent_features: { signal_breadth: 1, total_frequency: 1, latest_signal_date: "2026-08-10" },
    deterministic_reason: "Demo request activity is the strongest priority signal.",
    engagement_timeline: [{ event_type: "demo_request", event_date: "2026-08-10", event_count: 1, scored: true }],
    data_quality_flags: [],
    ...overrides,
  };
}

function recommendation(overrides: Partial<AccountRecommendation> = {}): AccountRecommendation {
  return {
    account_id: "org-acme",
    why_now: "The supplied signals support outreach.",
    recommended_action: "call_today",
    urgency: "immediate",
    call_angle: "Reference the supplied demo request.",
    confidence: "high",
    ...overrides,
  };
}

describe("deterministic recommendation policy", () => {
  it.each([
    ["P0", "call_today", "immediate"],
    ["P1", "call_this_week", "high"],
    ["P2", "email", "medium"],
    ["P3", "nurture", "low"],
  ] as const)("maps %s to a deterministic fallback action", (band, action, urgency) => {
    expect(deterministicRecommendation(account({ scores: { account_score: 70, intent_score: 70, priority_score: 70, priority_band: band } }))).toMatchObject({ recommended_action: action, urgency });
  });

  it("blocks outreach when identity or critical data is unresolved", () => {
    expect(enforceRecommendationPolicy(account({ identity_resolved: false, data_status: "blocked" }), recommendation())).toMatchObject({
      recommended_action: "needs_data_review",
      urgency: "none",
      confidence: "low",
    });
  });

  it("overrides every model action when contact suppression applies", () => {
    expect(enforceRecommendationPolicy(account({ contact_suppressed: true }), recommendation({ recommended_action: "call_today" }))).toMatchObject({
      recommended_action: "no_action",
      urgency: "none",
    });
  });

  it("rejects incomplete, duplicate, or unknown model account IDs instead of guessing", () => {
    const input = { as_of_date: "2026-08-17", accounts: [account()] };
    expect(() => finalizeModelRecommendations(input, { recommendations: [] })).toThrow();
    expect(() => finalizeModelRecommendations(input, { recommendations: [recommendation({ account_id: "unknown" })] })).toThrow(/account IDs/i);
  });
});
