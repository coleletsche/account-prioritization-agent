import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_WEIGHTS } from "@/lib/scoring";
import { WeightControls } from "./weight-controls";

describe("WeightControls", () => {
  it("redistributes the remaining weights when one lever changes", () => {
    const onChange = vi.fn();
    render(<WeightControls weights={DEFAULT_WEIGHTS} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Intent weight"), { target: { value: "70" } });
    const next = onChange.mock.calls[0][0];
    expect(next.intent).toBe(70);
    expect(next.intent + next.value + next.timing).toBe(100);
  });

  it("resets a changed strategy to the published defaults", () => {
    const onChange = vi.fn();
    render(<WeightControls weights={{ intent: 80, value: 15, timing: 5 }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Reset score weights" }));
    expect(onChange).toHaveBeenCalledWith(DEFAULT_WEIGHTS);
  });

  it("makes the deterministic intent assumptions visible to the VP", () => {
    render(<WeightControls weights={DEFAULT_WEIGHTS} onChange={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "How signals map to intent" })).toBeInTheDocument();
    expect(screen.getByText("Direct buying hand raise")).toBeInTheDocument();
    expect(screen.getByText("10×")).toBeInTheDocument();
    expect(screen.getByText(/not a model trained on conversion outcomes/i)).toBeInTheDocument();
    expect(screen.getByText(/halves every 30 days/i)).toBeInTheDocument();
    expect(screen.getByText(/Future-dated signals, exact duplicates/i)).toBeInTheDocument();
  });
});
