import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RankedAccount, ResolutionStatistics } from "@/lib/data";
import { BriefingPanel } from "./briefing-panel";

const account: RankedAccount = {
  rank: 1,
  ownerRank: 1,
  score: 91.2,
  factors: { intent: 100, value: 80, timing: 60 },
  rawIntent: 12,
  dominantFactor: "intent",
  reason: "Demo request activity is the strongest priority signal.",
  asOfDate: "2026-08-17",
  weights: { intent: 55, value: 30, timing: 15 },
  organization: {
    id: "org-acme",
    canonicalName: "Acme Foundation",
    aliases: ["Acme Foundation"],
    sourceRows: [2],
    industry: "Nonprofit",
    arr: 1000,
    lastContactDate: "2026-08-01",
    accountTier: "Enterprise",
    website: "https://acme.example",
    domain: "acme.example",
    region: "North America",
    owner: "Rep A",
    engagements: [{ rowNumber: 1, accountName: "Acme Foundation", eventType: "demo_request", eventDate: "2026-08-10", eventCount: 2 }],
    confidence: "high",
    issues: [],
    eligible: true,
  },
};

const statistics: ResolutionStatistics = { sourceAccountRows: 1, sourceSignalRows: 1, resolvedOrganizations: 1, duplicateDomainGroups: 0, matchedSignals: 1, unmatchedSignals: 0, excludedOrganizations: 0 };

afterEach(() => vi.unstubAllGlobals());

describe("BriefingPanel", () => {
  it("renders structured AI success and sends only the bounded request contract", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<{ json: () => Promise<unknown> }>>(async () => ({ json: async () => ({ briefing: { headline: "Acme leads Monday", themes: ["Intent is strong."], actions: ["Rep A should call Acme."], caveats: ["Not a probability."] }, source: "ai" }) }));
    vi.stubGlobal("fetch", fetchMock);
    render(<BriefingPanel accounts={[account]} weights={account.weights} asOfDate={account.asOfDate} issues={[]} statistics={statistics} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate briefing" }));

    expect(await screen.findByText("Acme leads Monday")).toBeInTheDocument();
    expect(screen.getByText("AI grounded")).toBeInTheDocument();
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(requestBody).not.toHaveProperty("prompt");
    expect(requestBody.accounts).toHaveLength(1);
    expect(requestBody.accounts[0]).not.toHaveProperty("website");
  });

  it("renders a visible deterministic fallback without changing the ranking", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ briefing: { headline: "Acme still leads", themes: ["Fixed ranks retained."], actions: ["Call Acme first."], caveats: ["Heuristic only."] }, source: "fallback", warning: "AI briefing is not configured. Showing the deterministic summary." }) })));
    render(<BriefingPanel accounts={[account]} weights={account.weights} asOfDate={account.asOfDate} issues={[]} statistics={statistics} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate briefing" }));

    expect(await screen.findByText("Acme still leads")).toBeInTheDocument();
    expect(screen.getByText("Deterministic fallback")).toBeInTheDocument();
    expect(screen.getByText(/not configured/i)).toBeInTheDocument();
  });
});
