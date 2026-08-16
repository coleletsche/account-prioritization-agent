import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SalesAgentApiResponse } from "@/lib/agent";
import { RecommendationPanel } from "./recommendation-panel";

const recommendation = { account_id: "org-acme", why_now: "Recent demo intent.", recommended_action: "call_today" as const, urgency: "immediate" as const, call_angle: "Ask about the demo request.", confidence: "high" as const };

const ungenerated: SalesAgentApiResponse = {
  source: "fallback",
  coverage: { total: 1, ai: 0, fallback: 1 },
  generated_account_ids: [],
  recommendations: [recommendation],
};

describe("RecommendationPanel", () => {
  it("offers explicit bulk generation without presenting fallback copy as an AI plan", () => {
    const onGenerateAll = vi.fn();
    render(<RecommendationPanel result={ungenerated} totalAccounts={1} onGenerateAll={onGenerateAll} />);

    expect(screen.getAllByText("Not generated")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Generate all plans" }));
    expect(onGenerateAll).toHaveBeenCalledOnce();
  });

  it("shows completed AI coverage and disables redundant bulk generation", () => {
    const complete: SalesAgentApiResponse = { ...ungenerated, source: "ai", coverage: { total: 1, ai: 1, fallback: 0 }, generated_account_ids: ["org-acme"] };
    render(<RecommendationPanel result={complete} totalAccounts={1} onGenerateAll={vi.fn()} />);

    expect(screen.getByText("Plans complete")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All plans generated" })).toBeDisabled();
  });

  it("keeps bulk generation VP-controlled while directing reps to row actions", () => {
    render(<RecommendationPanel result={ungenerated} totalAccounts={1} canGenerateAll={false} onGenerateAll={vi.fn()} />);
    expect(screen.getByText("Generate individual plans from your ranking")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate all plans" })).not.toBeInTheDocument();
  });
});
