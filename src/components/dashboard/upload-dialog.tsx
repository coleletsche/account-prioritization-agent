"use client";

import { useState } from "react";
import { CheckCircle2, FileJson2, FileSpreadsheet, ShieldCheck, Upload, X } from "lucide-react";
import { DataImportError, processCrmExports, type EntityResolutionResult } from "@/lib/data";

export function UploadDialog({ open, onClose, onApply }: { open: boolean; onClose: () => void; onApply: (data: EntityResolutionResult, label: string) => void }) {
  const [accountsFile, setAccountsFile] = useState<File>();
  const [signalsFile, setSignalsFile] = useState<File>();
  const [preview, setPreview] = useState<EntityResolutionResult>();
  const [error, setError] = useState<string>();
  const [validating, setValidating] = useState(false);

  if (!open) return null;

  const resetPreview = () => { setPreview(undefined); setError(undefined); };
  const validateFiles = async () => {
    if (!accountsFile || !signalsFile) return;
    setValidating(true);
    setError(undefined);
    try {
      const [accounts, signals] = await Promise.all([accountsFile.text(), signalsFile.text()]);
      setPreview(processCrmExports(accounts, signals));
    } catch (cause) {
      setPreview(undefined);
      setError(cause instanceof DataImportError ? `${cause.message} ${cause.issues.map((issue) => issue.evidence).join(" ")}` : cause instanceof Error ? cause.message : "These exports could not be validated.");
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-ink/55" onClick={onClose} aria-label="Dismiss data refresh" />
      <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="upload-title">
        <div className="flex items-start justify-between gap-4 border-b border-line p-6 sm:p-8">
          <div><p className="eyebrow">Session refresh</p><h2 id="upload-title" className="mt-2 text-3xl font-black tracking-[-0.04em] text-ink">Validate new CRM exports</h2><p className="mt-3 max-w-xl text-sm leading-6 text-muted">Both files are checked together. Your current ranking stays intact until you approve a valid preview.</p></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close data refresh"><X size={18} /></button>
        </div>

        <div className="space-y-5 p-6 sm:p-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="file-drop">
              <FileSpreadsheet size={22} />
              <strong>Account CSV</strong>
              <span>{accountsFile?.name ?? "Choose accounts.csv"}</span>
              <input aria-label="Account CSV file" type="file" accept=".csv,text/csv" onChange={(event) => { setAccountsFile(event.target.files?.[0]); resetPreview(); }} />
            </label>
            <label className="file-drop">
              <FileJson2 size={22} />
              <strong>Engagement JSON</strong>
              <span>{signalsFile?.name ?? "Choose engagement_signals.json"}</span>
              <input aria-label="Engagement JSON file" type="file" accept=".json,application/json" onChange={(event) => { setSignalsFile(event.target.files?.[0]); resetPreview(); }} />
            </label>
          </div>

          <div className="privacy-note"><ShieldCheck size={17} /><span>Files are processed only in this browser tab. They are not uploaded, saved, or restored after refresh.</span></div>

          {error && <div className="upload-error" role="alert"><strong>Import rejected. Current ranking unchanged.</strong><span>{error}</span></div>}

          {preview && (
            <section className="upload-preview" aria-label="Validation preview">
              <div className="flex items-center gap-2 text-sm font-extrabold text-ink"><CheckCircle2 size={18} className="text-emerald-600" /> Validation preview</div>
              <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Account rows", preview.statistics.sourceAccountRows],
                  ["Signal rows", preview.statistics.sourceSignalRows],
                  ["Organizations", preview.statistics.resolvedOrganizations],
                  ["Quality flags", preview.reviewQueue.length],
                ].map(([label, value]) => <div key={label} className="preview-stat"><dt>{label}</dt><dd>{value}</dd></div>)}
              </dl>
              <p className="mt-4 text-xs leading-5 text-muted">{preview.statistics.matchedSignals} signals uniquely matched; {preview.statistics.unmatchedSignals} require review. {preview.statistics.excludedOrganizations} organizations are held out of ranking.</p>
            </section>
          )}

          <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:justify-end">
            <button type="button" className="button-secondary" onClick={onClose}>Cancel</button>
            {!preview ? <button type="button" className="button-primary" disabled={!accountsFile || !signalsFile || validating} onClick={validateFiles}><Upload size={16} /> {validating ? "Validating…" : "Validate both files"}</button>
              : <button type="button" className="button-primary" onClick={() => onApply(preview, `${accountsFile?.name} + ${signalsFile?.name}`)}><CheckCircle2 size={16} /> Use this export</button>}
          </div>
        </div>
      </section>
    </div>
  );
}
