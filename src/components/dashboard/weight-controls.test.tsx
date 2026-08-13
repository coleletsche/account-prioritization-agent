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
});
