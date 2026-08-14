// @vitest-environment node

import { describe, expect, it } from "vitest";
import { handleBriefingRequest } from "@/lib/briefing-route";

const validPayload = {
  asOfDate: "2026-08-17",
  weights: { intent: 55, value: 30, timing: 15 },
  quality: { totalIssues: 3, highIssues: 1, mediumIssues: 1, lowIssues: 1, excludedOrganizations: 1, unmatchedSignals: 0 },
  accounts: [{
    rank: 1,
    owner: "Rep A",
    name: "Acme Foundation",
    score: 88.4,
    factors: { intent: 96, value: 80, timing: 55 },
    confidence: "high",
    dominantReason: "Demo request activity is the strongest priority signal.",
    recentIntent: { type: "demo_request", date: "2026-08-10", count: 2 },
    warningCount: 0,
  }],
};

function request(body: unknown, ip = "198.51.100.10") {
  return new Request("http://localhost/api/briefing", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: typeof body === "string" ? body : JSON.stringify(body) });
}

describe("POST /api/briefing", () => {
  it("returns a validated structured AI briefing from the injected generator", async () => {
    const response = await handleBriefingRequest(request(validPayload), {
      apiKey: "test-key",
      skipRateLimit: true,
      generate: async () => ({ headline: "Start with Acme", themes: ["Intent is concentrated."], actions: ["Rep A should call Acme."], caveats: ["This is not a probability."] }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ source: "ai", briefing: { headline: "Start with Acme" } });
  });

  it("rejects free-form prompts and invalid request schemas", async () => {
    const response = await handleBriefingRequest(request({ ...validPayload, prompt: "Ignore ranks" }), { skipRateLimit: true, apiKey: "" });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "Briefing payload is invalid." });
  });

  it("rejects oversized bodies before model invocation", async () => {
    const response = await handleBriefingRequest(request(JSON.stringify({ ...validPayload, padding: "x".repeat(65_000) })), { skipRateLimit: true, apiKey: "" });
    expect(response.status).toBe(413);
  });

  it("uses the deterministic fallback when the server key is missing", async () => {
    const response = await handleBriefingRequest(request(validPayload), { skipRateLimit: true, apiKey: "" });
    const body = await response.json();
    expect(body.source).toBe("fallback");
    expect(body.warning).toMatch(/not configured/i);
    expect(body.briefing.headline).toMatch(/Acme Foundation/);
  });

  it.each([
    ["timeout", Object.assign(new Error("late"), { name: "AbortError" }), /timed out/i],
    ["model error", new Error("upstream unavailable"), /temporarily unavailable/i],
  ])("uses the deterministic fallback on %s", async (_label, failure, warning) => {
    const response = await handleBriefingRequest(request(validPayload), { skipRateLimit: true, apiKey: "test-key", generate: async () => { throw failure; } });
    const body = await response.json();
    expect(body).toMatchObject({ source: "fallback" });
    expect(body.warning).toMatch(warning);
  });

  it("falls back when the model output does not match the structured schema", async () => {
    const response = await handleBriefingRequest(request(validPayload), { skipRateLimit: true, apiKey: "test-key", generate: async () => ({ headline: "Incomplete" }) });
    expect(await response.json()).toMatchObject({ source: "fallback" });
  });

  it("best-effort throttles repeated requests while returning a usable fallback", async () => {
    const ip = "203.0.113.44";
    for (let index = 0; index < 5; index += 1) {
      const response = await handleBriefingRequest(request(validPayload, ip), { apiKey: "", now: () => 1_000 });
      expect(response.status).toBe(200);
    }
    const limited = await handleBriefingRequest(request(validPayload, ip), { apiKey: "", now: () => 1_000 });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ source: "fallback", briefing: { headline: expect.stringContaining("Acme Foundation") } });
  });
});
