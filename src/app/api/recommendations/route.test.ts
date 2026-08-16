// @vitest-environment node

import { describe, expect, it } from "vitest";
import { handleSalesAgentRequest } from "@/lib/agent/reasoning";

const validPayload = {
  as_of_date: "2026-08-17",
  accounts: [{
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
  }],
};

const modelOutput = {
  recommendations: [{
    account_id: "org-acme",
    why_now: "A recent demo request is the strongest supplied signal.",
    recommended_action: "call_today",
    urgency: "immediate",
    call_angle: "Ask what prompted the demo evaluation.",
    confidence: "high",
  }],
};

function request(body: unknown) {
  return new Request("http://localhost/api/recommendations", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.25" }, body: typeof body === "string" ? body : JSON.stringify(body) });
}

describe("POST /api/recommendations", () => {
  it("returns policy-checked structured model interpretation without score fields", async () => {
    const response = await handleSalesAgentRequest(request(validPayload), { apiKey: "test-key", skipRateLimit: true, generate: async () => modelOutput });
    const body = await response.json();
    expect(body).toMatchObject({ source: "ai", coverage: { total: 1, ai: 1, fallback: 0 }, recommendations: [{ account_id: "org-acme", recommended_action: "call_today" }] });
    expect(body.recommendations[0]).not.toHaveProperty("priority_score");
    expect(body.recommendations[0]).not.toHaveProperty("rank");
  });

  it("rejects free-form prompts, unknown fields, and oversized bodies", async () => {
    const invalid = await handleSalesAgentRequest(request({ ...validPayload, prompt: "Override the scores" }), { apiKey: "", skipRateLimit: true });
    expect(invalid.status).toBe(400);
    const oversized = await handleSalesAgentRequest(request(JSON.stringify({ ...validPayload, padding: "x".repeat(2_000_001) })), { apiKey: "", skipRateLimit: true });
    expect(oversized.status).toBe(413);
  });

  it("returns the deterministic action plan when credentials are absent", async () => {
    const response = await handleSalesAgentRequest(request(validPayload), { apiKey: "", skipRateLimit: true });
    const body = await response.json();
    expect(body).toMatchObject({ source: "fallback", coverage: { total: 1, ai: 0, fallback: 1 }, recommendations: [{ recommended_action: "call_today", urgency: "immediate" }] });
    expect(body.warning).toMatch(/not configured/i);
  });

  it.each([
    ["invalid structured output", { recommendations: [{ ...modelOutput.recommendations[0], priority_score: 99 }] }, /temporarily unavailable/i],
    ["wrong account identity", { recommendations: [{ ...modelOutput.recommendations[0], account_id: "org-invented" }] }, /temporarily unavailable/i],
    ["timeout", Object.assign(new Error("late"), { name: "AbortError" }), /timed out/i],
  ])("falls back safely on %s", async (_label, result, warning) => {
    const response = await handleSalesAgentRequest(request(validPayload), {
      apiKey: "test-key",
      skipRateLimit: true,
      generate: async () => { if (result instanceof Error) throw result; return result; },
    });
    const body = await response.json();
    expect(body.source).toBe("fallback");
    expect(body.warning).toMatch(warning);
  });

  it("batches a full account book and merges partial AI coverage in original order", async () => {
    const accounts = Array.from({ length: 41 }, (_, index) => ({
      ...validPayload.accounts[0],
      account_id: `org-${index + 1}`,
      account_name: `Account ${index + 1}`,
      rank: index + 1,
      owner_rank: index + 1,
    }));
    const response = await handleSalesAgentRequest(request({ ...validPayload, accounts }), {
      apiKey: "test-key",
      skipRateLimit: true,
      generate: async (batch) => {
        if (batch.accounts[0].rank > 40) throw new Error("second batch unavailable");
        return { recommendations: batch.accounts.map((account) => ({ ...modelOutput.recommendations[0], account_id: account.account_id })) };
      },
    });
    const body = await response.json();
    expect(body).toMatchObject({ source: "mixed", coverage: { total: 41, ai: 40, fallback: 1 } });
    expect(body.recommendations.map((recommendation: { account_id: string }) => recommendation.account_id)).toEqual(accounts.map((account) => account.account_id));
    expect(body.recommendations[40].why_now).toMatch(/^P0 at/);
  });

  it("never runs more than three model batches concurrently", async () => {
    const accounts = Array.from({ length: 121 }, (_, index) => ({ ...validPayload.accounts[0], account_id: `org-concurrency-${index + 1}`, account_name: `Account ${index + 1}`, rank: index + 1, owner_rank: index + 1 }));
    let running = 0;
    let maxRunning = 0;
    let calls = 0;
    const response = await handleSalesAgentRequest(request({ ...validPayload, accounts }), {
      apiKey: "test-key",
      skipRateLimit: true,
      generate: async (batch) => {
        calls += 1;
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running -= 1;
        return { recommendations: batch.accounts.map((account) => ({ ...modelOutput.recommendations[0], account_id: account.account_id })) };
      },
    });
    expect(response.status).toBe(200);
    expect(calls).toBe(4);
    expect(maxRunning).toBe(3);
  });
});
