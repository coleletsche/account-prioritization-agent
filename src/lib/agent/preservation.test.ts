import { describe, expect, it } from "vitest";
import type { SalesAgentApiResponse, SalesAgentRequest } from "./contracts";
import { preserveCompatiblePlans } from "./preservation";

const account = (id: string, rank: number, industry = "Technology") => ({
  account_id: id, rank, owner_rank: rank, owner: "Rep A", account_name: id, industry, region: "North America", tier: "Enterprise" as const,
  arr: 1000, last_contact_date: "2026-08-01", contact_suppressed: false, identity_resolved: true, data_status: "valid" as const,
  scores: { account_score: 70, intent_score: 80, priority_score: 75, priority_band: "P1" as const },
  intent_features: { signal_breadth: 1, total_frequency: 2, latest_signal_date: "2026-08-10" },
  deterministic_reason: "Demo activity is the strongest signal.", engagement_timeline: [], data_quality_flags: [],
});

describe("AI plan preservation", () => {
  it("retains only generated plans whose complete model-facing account input is unchanged", () => {
    const previousRequest: SalesAgentRequest = { as_of_date: "2026-08-17", accounts: [account("A", 1), account("B", 2)] };
    const previousResponse: SalesAgentApiResponse = {
      recommendations: previousRequest.accounts.map((item) => ({ account_id: item.account_id, why_now: `AI ${item.account_id}`, recommended_action: "call_today", urgency: "immediate", call_angle: "Lead with the demo.", confidence: "high" })),
      generated_account_ids: ["A", "B"], source: "ai", coverage: { total: 2, ai: 2, fallback: 0 },
    };
    const nextRequest: SalesAgentRequest = { ...previousRequest, accounts: [account("A", 1), account("B", 2, "Healthcare")] };
    const result = preserveCompatiblePlans(previousRequest, nextRequest, previousResponse);
    expect(result.generated_account_ids).toEqual(["A"]);
    expect(result.recommendations.find((item) => item.account_id === "A")?.why_now).toBe("AI A");
    expect(result.recommendations.find((item) => item.account_id === "B")?.why_now).not.toBe("AI B");
    expect(result).toMatchObject({ source: "mixed", coverage: { total: 2, ai: 1, fallback: 1 } });
  });
});
