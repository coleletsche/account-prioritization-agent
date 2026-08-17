import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getEffectiveReviewQueue } from "@/lib/quality";
import { createDatasetSession } from "@/lib/reconciliation";
import { rankOrganizations } from "@/lib/scoring";
import { ReviewQueue } from "./review-queue";

const accounts = [
  "account_name,industry,arr,last_contact_date,account_tier,website,region,owner",
  "Acme,,,2026-08-01,Enterprise,https://acme.example,North America,Rep A",
].join("\n");
const engagements = JSON.stringify([{ account_name: "Acme", event_type: "demo_request", event_date: "2026-08-10", event_count: 1 }]);

describe("ReviewQueue", () => {
  it("groups warnings into an editable source record and emits an atomic correction", () => {
    const session = createDatasetSession({ accountsCsv: accounts, engagementsJson: engagements });
    const issues = getEffectiveReviewQueue(session.data, "2026-08-17");
    const onApply = vi.fn(() => "Warnings 2 → 1. The account book was rescored.");
    render(<ReviewQueue open session={session} issues={issues} ranked={rankOrganizations(session.data.organizations, { asOfDate: "2026-08-17" })} onApply={onApply} onReset={() => "Reset"} onDownload={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Data reconciliation" })).toBeInTheDocument();
    expect(screen.getByText(/2 warnings · Account row 2/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("ARR"), { target: { value: "5000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save & rescore" }));
    expect(onApply).toHaveBeenCalledWith({ kind: "edit_account", rowNumber: 2, changes: { arr: "5000" } });
    expect(screen.getByRole("status")).toHaveTextContent("Warnings 2 → 1");
  });

  it("exposes corrected source downloads from the reconciliation workspace", () => {
    const session = createDatasetSession({ accountsCsv: accounts, engagementsJson: engagements });
    const onDownload = vi.fn();
    render(<ReviewQueue open session={session} issues={getEffectiveReviewQueue(session.data, "2026-08-17")} ranked={rankOrganizations(session.data.organizations, { asOfDate: "2026-08-17" })} onApply={() => "Saved"} onReset={() => "Reset"} onDownload={onDownload} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Accounts CSV" }));
    fireEvent.click(screen.getByRole("button", { name: "Engagement JSON" }));
    expect(onDownload.mock.calls).toEqual([["accounts"], ["engagement"]]);
  });
});
