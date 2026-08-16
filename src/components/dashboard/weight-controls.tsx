"use client";

import { RotateCcw } from "lucide-react";
import { DEFAULT_WEIGHTS, EVENT_WEIGHTS, redistributeWeights } from "@/lib/scoring";
import type { ScoreWeights } from "@/lib/data";

const FACTORS: Array<{ key: keyof ScoreWeights; label: string; description: string }> = [
  { key: "intent", label: "Intent", description: "Recent, higher-value engagement" },
  { key: "value", label: "Account value", description: "Tier and available ARR" },
  { key: "timing", label: "Contact timing", description: "Time since meaningful contact" },
];

const INTENT_SIGNALS: Array<{ key: keyof typeof EVENT_WEIGHTS; label: string; rationale: string }> = [
  { key: "demo_request", label: "Demo request", rationale: "Direct buying hand raise" },
  { key: "webinar", label: "Webinar", rationale: "Sustained topic interest" },
  { key: "content_download", label: "Content download", rationale: "Deliberate content engagement" },
  { key: "page_visit", label: "Page visit", rationale: "Passive research behavior" },
  { key: "email_open", label: "Email open", rationale: "Noisy awareness signal" },
];

export function WeightControls({ weights, onChange }: { weights: ScoreWeights; onChange: (weights: ScoreWeights) => void }) {
  const resetDisabled = Object.keys(DEFAULT_WEIGHTS).every((key) => weights[key as keyof ScoreWeights] === DEFAULT_WEIGHTS[key as keyof ScoreWeights]);
  return (
    <>
      <section className="weight-panel" aria-labelledby="weight-heading">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow text-white/60!">Ranking controls</p>
            <h2 id="weight-heading" className="mt-2 text-2xl font-extrabold tracking-[-0.025em] text-white">Tune this week&apos;s focus</h2>
          </div>
          <button
            type="button"
            className="dark-icon-button"
            onClick={() => onChange({ ...DEFAULT_WEIGHTS })}
            disabled={resetDisabled}
            aria-label="Reset score weights"
            title="Reset score weights"
          >
            <RotateCcw size={17} aria-hidden="true" />
          </button>
        </div>
        <p className="mt-3 text-sm leading-6 text-white/65">The score remains deterministic. Only these three business levers change.</p>
        <div className="mt-7 space-y-6">
          {FACTORS.map((factor) => (
            <label key={factor.key} className="block" htmlFor={`weight-${factor.key}`}>
              <span className="flex items-center justify-between gap-3 text-sm font-bold text-white">
                <span>{factor.label}</span>
                <output htmlFor={`weight-${factor.key}`} className="rounded-full bg-white/10 px-2.5 py-1 text-xs tabular-nums">{weights[factor.key]}%</output>
              </span>
              <span className="mt-1 block text-xs text-white/45">{factor.description}</span>
              <input
                id={`weight-${factor.key}`}
                aria-label={`${factor.label} weight`}
                className="weight-slider mt-3"
                type="range"
                min="0"
                max="100"
                value={weights[factor.key]}
                onChange={(event) => onChange(redistributeWeights(weights, factor.key, Number(event.target.value)))}
              />
            </label>
          ))}
        </div>
        <div className="mt-7 flex items-center justify-between border-t border-white/10 pt-5 text-xs">
          <span className="text-white/45">Weight total</span>
          <strong className="text-white">{weights.intent + weights.value + weights.timing}%</strong>
        </div>
      </section>

      <section className="intent-rules-card" aria-labelledby="intent-rules-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Intent methodology</p>
            <h3 id="intent-rules-heading" className="mt-2 text-xl font-black tracking-[-0.03em] text-ink">How signals map to intent</h3>
          </div>
          <span className="assumption-pill">MVP assumption</span>
        </div>
        <p className="mt-3 text-sm leading-6 text-muted">These weights encode closeness to a buying conversation. They are product judgment—not a model trained on conversion outcomes.</p>

        <div className="intent-signal-list mt-5">
          {INTENT_SIGNALS.map((signal) => (
            <div className="intent-signal-row" key={signal.key}>
              <div><p>{signal.label}</p><span>{signal.rationale}</span></div>
              <strong>{EVENT_WEIGHTS[signal.key]}×</strong>
            </div>
          ))}
        </div>

        <div className="intent-formula mt-5">
          <p>Per signal contribution</p>
          <code>weight × ln(1 + count) × 30-day decay</code>
        </div>

        <dl className="intent-rule-grid mt-4">
          <div><dt>Recency</dt><dd>Contribution halves every 30 days.</dd></div>
          <div><dt>Frequency</dt><dd>Log scaling limits repeated low-value activity.</dd></div>
          <div><dt>Breadth</dt><dd>+5% per additional signal type, capped at +20%.</dd></div>
          <div><dt>Final scale</dt><dd>Normalized to the cohort p95 and capped at 100.</dd></div>
        </dl>

        <p className="intent-exclusion-note mt-4">Future-dated signals, exact duplicates, unknown event types, and unresolved identities do not contribute. A 100 is relative cohort strength—not conversion probability.</p>
      </section>
    </>
  );
}
