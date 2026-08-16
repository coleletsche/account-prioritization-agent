import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataIntake } from "./upload-dialog";

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

afterEach(() => vi.unstubAllGlobals());

describe("DataIntake", () => {
  it("rejects either structurally invalid file without starting analysis", async () => {
    const onAnalyze = vi.fn();
    render(<DataIntake onAnalyze={onAnalyze} />);
    choose("Account CSV file", uploadFile("accounts.csv", "account_name,owner\nAcme,Rep A", "text/csv"));
    choose("Engagement JSON file", uploadFile("signals.json", VALID_SIGNALS, "application/json"));
    fireEvent.click(screen.getByRole("button", { name: "Analyze account book" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Analysis could not start");
    expect(onAnalyze).not.toHaveBeenCalled();
  });

  it("validates both files and starts one atomic account-book analysis", async () => {
    const onAnalyze = vi.fn();
    render(<DataIntake onAnalyze={onAnalyze} />);
    choose("Account CSV file", uploadFile("accounts.csv", VALID_ACCOUNTS, "text/csv"));
    choose("Engagement JSON file", uploadFile("signals.json", VALID_SIGNALS, "application/json"));
    fireEvent.click(screen.getByRole("button", { name: "Analyze account book" }));

    await waitFor(() => expect(onAnalyze).toHaveBeenCalledOnce());
    expect(onAnalyze.mock.calls[0][0].statistics).toMatchObject({ sourceAccountRows: 1, sourceSignalRows: 1, resolvedOrganizations: 1, matchedSignals: 1 });
    expect(onAnalyze.mock.calls[0][1]).toBe("accounts.csv + signals.json");
    expect(onAnalyze.mock.calls[0][2]).toEqual({ generateAllPlans: false });
  });

  it("loads bundled files into the same intake path without auto-starting", async () => {
    const onAnalyze = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => ({
      ok: true,
      text: async () => String(input).includes("accounts.csv") ? VALID_ACCOUNTS : VALID_SIGNALS,
    })));
    render(<DataIntake onAnalyze={onAnalyze} />);
    fireEvent.click(screen.getByRole("button", { name: "Use sample data" }));

    expect(await screen.findByText("engagement_signals.json")).toBeInTheDocument();
    expect(onAnalyze).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Generate AI outreach plans for every account/i }));
    fireEvent.click(screen.getByRole("button", { name: "Analyze account book" }));
    await waitFor(() => expect(onAnalyze).toHaveBeenCalledOnce());
    expect(onAnalyze.mock.calls[0][2]).toEqual({ generateAllPlans: true });
  });
});
