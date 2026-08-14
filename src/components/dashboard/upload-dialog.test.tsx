import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UploadDialog } from "./upload-dialog";

const VALID_ACCOUNTS = [
  "account_name,industry,arr,last_contact_date,account_tier,website,region,owner",
  "Acme,Technology,5000,2026-08-01,Enterprise,https://acme.example,North America,Rep A",
].join("\n");

const VALID_SIGNALS = JSON.stringify([
  { account_name: "Acme", event_type: "demo_request", event_date: "2026-08-10", event_count: 2 },
]);

function uploadFile(name: string, contents: string, type: string) {
  const file = new File([contents], name, { type });
  Object.defineProperty(file, "text", { value: async () => contents });
  return file;
}

function choose(label: string, file: File) {
  fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } });
}

describe("UploadDialog", () => {
  it("keeps the current data untouched when either file is structurally invalid", async () => {
    const onApply = vi.fn();
    render(<UploadDialog open onClose={() => undefined} onApply={onApply} />);
    choose("Account CSV file", uploadFile("accounts.csv", "account_name,owner\nAcme,Rep A", "text/csv"));
    choose("Engagement JSON file", uploadFile("signals.json", VALID_SIGNALS, "application/json"));
    fireEvent.click(screen.getByRole("button", { name: "Validate both files" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Import rejected. Current ranking unchanged.");
    expect(onApply).not.toHaveBeenCalled();
  });

  it("previews both valid files before applying them atomically", async () => {
    const onApply = vi.fn();
    render(<UploadDialog open onClose={() => undefined} onApply={onApply} />);
    choose("Account CSV file", uploadFile("accounts.csv", VALID_ACCOUNTS, "text/csv"));
    choose("Engagement JSON file", uploadFile("signals.json", VALID_SIGNALS, "application/json"));
    fireEvent.click(screen.getByRole("button", { name: "Validate both files" }));

    expect(await screen.findByLabelText("Validation preview")).toHaveTextContent("1 signals uniquely matched");
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Use this export" }));
    await waitFor(() => expect(onApply).toHaveBeenCalledOnce());
    expect(onApply.mock.calls[0][0].statistics).toMatchObject({ sourceAccountRows: 1, sourceSignalRows: 1, resolvedOrganizations: 1, matchedSignals: 1 });
  });
});
