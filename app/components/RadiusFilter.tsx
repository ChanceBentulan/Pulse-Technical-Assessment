"use client";

import { useState } from "react";

// Slider stops in km. The extra last stop (index === RADIUS_STEPS.length)
// means "Any distance" — no radius filter.
export const RADIUS_STEPS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

export function formatKm(km: number): string {
  return `${km.toLocaleString("en-US")} km`;
}

// Collapsible distance filter: only show people within N km of you.
// Starts closed and set to "Any distance".
export default function RadiusFilter({
  radiusKm,
  onChange,
}: {
  radiusKm: number | null;
  onChange: (km: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = radiusKm === null ? "Any distance" : `Within ${formatKm(radiusKm)}`;
  const index =
    radiusKm === null ? RADIUS_STEPS.length : RADIUS_STEPS.indexOf(radiusKm);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Show distance filter"
        className="flex items-center gap-2 rounded-full bg-zinc-900/80 px-3 py-1.5 text-xs font-medium text-zinc-200 shadow-lg backdrop-blur hover:bg-zinc-800/90"
      >
        <svg
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5 text-emerald-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <circle cx="8" cy="8" r="6" strokeDasharray="2 2" />
          <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
        </svg>
        <span className={radiusKm === null ? undefined : "text-emerald-300"}>
          {label}
        </span>
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Distance filter"
      className="w-64 rounded-2xl border border-zinc-800/80 bg-zinc-900/85 p-4 text-zinc-200 shadow-2xl backdrop-blur"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-100">Distance</h2>
        <button
          onClick={() => setOpen(false)}
          aria-label="Hide distance filter"
          className="rounded-full px-2 text-lg leading-none text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        >
          ×
        </button>
      </div>

      <p className="mt-1 text-xs">
        <span className={radiusKm === null ? "text-zinc-300" : "font-medium text-emerald-300"}>
          {label}
        </span>
        <span className="text-zinc-500"> of you</span>
      </p>

      <input
        type="range"
        min={0}
        max={RADIUS_STEPS.length}
        step={1}
        value={index}
        onChange={(e) => {
          const i = Number(e.target.value);
          onChange(i >= RADIUS_STEPS.length ? null : RADIUS_STEPS[i]);
        }}
        aria-valuetext={label}
        className="mt-3 w-full accent-emerald-400"
      />
      <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
        <span>{formatKm(RADIUS_STEPS[0])}</span>
        <span>Any</span>
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-500">
        <span>Dots are within ~3 km of real spots.</span>
        {radiusKm !== null && (
          <button
            onClick={() => onChange(null)}
            className="underline decoration-zinc-600 underline-offset-2 hover:text-zinc-100"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
