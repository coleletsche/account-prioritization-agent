"use client";

import { useState } from "react";
import { FileJson2, FileSpreadsheet, ShieldCheck, Sparkles, Upload, X } from "lucide-react";
import { DataImportError, processCrmExports, type EntityResolutionResult } from "@/lib/data";
import { useEscape } from "./use-escape";

type SourceFile = { name: string; read: () => Promise<string> };

export interface DataIntakeProps {
  onAnalyze: (data: EntityResolutionResult, label: string) => Promise<void> | void;
  onValidatingChange?: (validating: boolean) => void;
  busy?: boolean;
  compact?: boolean;
}

function sourceFromFile(file: File): SourceFile {
  return { name: file.name, read: () => file.text() };
}

export function DataIntake({ onAnalyze, onValidatingChange, busy = false, compact = false }: DataIntakeProps) {
  const [accountsSource, setAccountsSource] = useState<SourceFile>();
  const [signalsSource, setSignalsSource] = useState<SourceFile>();
  const [error, setError] = useState<string>();
  const [validating, setValidating] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);

  const ready = Boolean(accountsSource && signalsSource);
  const locked = validating || loadingSample || busy;

  const useSampleData = async () => {
    if (locked) return;
    setLoadingSample(true);
    setError(undefined);
    try {
      const [accountsResponse, signalsResponse] = await Promise.all([
        fetch("/sample-data/accounts.csv"),
        fetch("/sample-data/engagement_signals.json"),
      ]);
      if (!accountsResponse.ok || !signalsResponse.ok) throw new Error("The bundled assessment files could not be loaded.");
      const [accounts, signals] = await Promise.all([accountsResponse.text(), signalsResponse.text()]);
      setAccountsSource({ name: "accounts.csv", read: async () => accounts });
      setSignalsSource({ name: "engagement_signals.json", read: async () => signals });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The bundled assessment files could not be loaded.");
    } finally {
      setLoadingSample(false);
    }
  };

  const analyze = async () => {
    if (!accountsSource || !signalsSource || locked) return;
    setValidating(true);
    setError(undefined);
    onValidatingChange?.(true);
    try {
      const [accounts, signals] = await Promise.all([accountsSource.read(), signalsSource.read()]);
      await onAnalyze(processCrmExports(accounts, signals), `${accountsSource.name} + ${signalsSource.name}`);
    } catch (cause) {
      const message = cause instanceof DataImportError
        ? `${cause.message} ${cause.issues.map((issue) => issue.evidence).join(" ")}`
        : cause instanceof Error
          ? cause.message
          : "These exports could not be analyzed.";
      setError(message);
      onValidatingChange?.(false);
    } finally {
      setValidating(false);
    }
  };

  return (
    <section className={compact ? "data-intake data-intake-compact" : "data-intake"} aria-label="Account book input">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={`file-drop intake-file ${accountsSource ? "intake-file-ready" : ""}`}>
          <span className="intake-file-icon"><FileSpreadsheet size={22} /></span>
          <strong>Account CSV</strong>
          <span>{accountsSource?.name ?? "Choose accounts.csv"}</span>
          <small>{accountsSource ? "Ready to validate" : "CRM accounts and ownership"}</small>
          <input aria-label="Account CSV file" type="file" accept=".csv,text/csv" disabled={locked} onChange={(event) => {
            const file = event.target.files?.[0];
            setAccountsSource(file ? sourceFromFile(file) : undefined);
            setError(undefined);
          }} />
        </label>
        <label className={`file-drop intake-file ${signalsSource ? "intake-file-ready" : ""}`}>
          <span className="intake-file-icon"><FileJson2 size={22} /></span>
          <strong>Engagement JSON</strong>
          <span>{signalsSource?.name ?? "Choose engagement_signals.json"}</span>
          <small>{signalsSource ? "Ready to validate" : "Recent account engagement"}</small>
          <input aria-label="Engagement JSON file" type="file" accept=".json,application/json" disabled={locked} onChange={(event) => {
            const file = event.target.files?.[0];
            setSignalsSource(file ? sourceFromFile(file) : undefined);
            setError(undefined);
          }} />
        </label>
      </div>

      <div className="privacy-note mt-4"><ShieldCheck size={17} /><span>Raw files stay in this browser tab. Only validated account summaries are sent for AI interpretation.</span></div>
      {error && <div className="upload-error mt-4" role="alert"><strong>Analysis could not start.</strong><span>{error}</span></div>}

      <div className="intake-actions mt-5">
        <button type="button" className="button-secondary" disabled={locked} onClick={useSampleData}><Upload size={16} /> {loadingSample ? "Loading sample…" : "Use sample data"}</button>
        <button type="button" className="button-primary" disabled={!ready || locked} onClick={analyze}><Sparkles size={16} /> {validating ? "Validating exports…" : busy ? "Analyzing account book…" : "Analyze account book"}</button>
      </div>
    </section>
  );
}

export function UploadDialog({ open, onClose, onAnalyze, busy = false }: { open: boolean; onClose: () => void; onAnalyze: (data: EntityResolutionResult, label: string) => Promise<void> | void; busy?: boolean }) {
  useEscape(open && !busy, onClose);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-ink/55" onClick={onClose} disabled={busy} aria-label="Dismiss data refresh" />
      <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="upload-title">
        <div className="flex items-start justify-between gap-4 border-b border-line p-6 sm:p-8">
          <div><p className="eyebrow">Replace session data</p><h2 id="upload-title" className="mt-2 text-3xl font-black tracking-[-0.04em] text-ink">Analyze new CRM exports</h2><p className="mt-3 max-w-xl text-sm leading-6 text-muted">Your current ranking remains active until both files pass validation and the replacement account book is prepared.</p></div>
          <button type="button" className="icon-button" onClick={onClose} disabled={busy} aria-label="Close data refresh"><X size={18} /></button>
        </div>
        <div className="p-6 sm:p-8"><DataIntake compact busy={busy} onAnalyze={onAnalyze} /></div>
      </section>
    </div>
  );
}
