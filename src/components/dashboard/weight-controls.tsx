"use client";

import { RotateCcw } from "lucide-react";
import { DEFAULT_WEIGHTS, redistributeWeights } from "@/lib/scoring";
import type { ScoreWeights } from "@/lib/data";

const FACTORS: Array<{ key: keyof ScoreWeights; label: string; description: string }> = [
  { key: "intent", label: "Intent", description: "Recent, higher-value engagement" },
  { key: "value", label: "Account value", description: "Tier and available ARR" },
  { key: "timing", label: "Contact timing", description: "Time since meaningful contact" },
];

export function WeightControls({ weights, onChange }: { weights: ScoreWeights; onChange: (weights: ScoreWeights) => void }) {
  const resetDisabled = Object.keys(DEFAULT_WEIGHTS).every((key) => weights[key as keyof ScoreWeights] === DEFAULT_WEIGHTS[key as keyof ScoreWeights]);
  return (
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
  );
}
