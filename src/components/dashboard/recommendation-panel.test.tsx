import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SalesAgentApiResponse, SalesAgentRequest } from "@/lib/agent";
import { RecommendationPanel } from "./recommendation-panel";

const request: SalesAgentRequest = {
  as_of_date: "2026-08-17",
  accounts: [{
    account_id: "org-acme",
    rank: 1,
    owner_rank: 1,
    owner: "Rep A",
    account_name: "Acme",
    industry: null,
    region: "North America",
    tier: "Enterprise",
    arr: null,
    last_contact_date: null,
    contact_suppressed: null,
    identity_resolved: true,
    data_status: "warning",
    scores: { account_score: 85, intent_score: 90, priority_score: 88, priority_band: "P0" },
    intent_features: { signal_breadth: 1, total_frequency: 1, latest_signal_date: "2026-08-10" },
    deterministic_reason: "Demo request activity is strongest.",
    engagement_timeline: [{ event_type: "demo_request", event_date: "2026-08-10", event_count: 1, scored: true }],
    data_quality_flags: [{ category: "arr", severity: "low", message: "ARR missing.", evidence: "Blank", blocking: false }],
  }],
};

const fallback: SalesAgentApiResponse = {
  source: "fallback",
  coverage: { total: 1, ai: 0, fallback: 1 },
  recommendations: [{ account_id: "org-acme", why_now: "P0 account.", recommended_action: "call_today", urgency: "immediate", call_angle: "Ask about the demo request.", confidence: "medium" }],
};

afterEach(() => vi.unstubAllGlobals());

describe("RecommendationPanel", () => {
  it("sends only the validated queue contract and returns structured interpretations", async () => {
    const onResult = vi.fn();
    const response: SalesAgentApiResponse = { ...fallback, source: "ai", coverage: { total: 1, ai: 1, fallback: 0 }, recommendations: [{ ...fallback.recommendations[0], why_now: "Recent demo intent." }] };
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<{ json: () => Promise<unknown> }>>(async () => ({ json: async () => response }));
    vi.stubGlobal("fetch", fetchMock);
    render(<RecommendationPanel request={request} result={fallback} onResult={onResult} />);

    fireEvent.click(screen.getByRole("button", { name: "Refresh account analysis" }));
    expect(await screen.findByText("1 validated accounts")).toBeInTheDocument();
    expect(onResult).toHaveBeenCalledWith(response);
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body).not.toHaveProperty("prompt");
    expect(body.accounts[0]).not.toHaveProperty("website");
    expect(body.accounts[0].scores.priority_score).toBe(88);
  });

  it("keeps the deterministic plan visible when the client response is invalid", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ broken: true }) })));
    render(<RecommendationPanel request={request} result={fallback} onResult={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh account analysis" }));
    expect(await screen.findByText(/deterministic action plan remains active/i)).toBeInTheDocument();
  });
});
