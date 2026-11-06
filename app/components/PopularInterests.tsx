"use client";

import { useState } from "react";
import type { PeerDot } from "@/lib/types";

const TOP_N = 10;

// Collapsible ranking of the interests other people online have listed, with
// how many have each one. Starts closed; tags you also have are highlighted.
// Selecting interests (any number) filters the people list and hides the
// non-matching dots. You're excluded from the counts so "N people" is exactly
// how many rows the filter will show.
export default function PopularInterests({
  peers,
  myTags,
  filters,
  onToggle,
  onClear,
}: {
  peers: PeerDot[];
  myTags: string[];
  filters: string[];
  onToggle: (tag: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Show popular interests"
        className="flex items-center gap-2 rounded-full bg-zinc-900/80 px-3 py-1.5 text-xs font-medium text-zinc-200 shadow-lg backdrop-blur hover:bg-zinc-800/90"
      >
        <span className="text-emerald-400">#</span>
        {filters.length === 1 ? (
          <span className="max-w-32 truncate text-emerald-300">{filters[0]}</span>
        ) : filters.length > 1 ? (
          <span className="text-emerald-300">{filters.length} interests</span>
        ) : (
          "Interests"
        )}
      </button>
    );
  }

  // Tags are already normalised (lowercase, deduped per person) server-side.
  const total = peers.length;
  const counts = new Map<string, number>();
  for (const p of peers) {
    for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const ranked = [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP_N);
  // Keep selected interests visible even if they drop out of the top N (or
  // everyone with them leaves), so they can always be deselected here.
  for (const f of filters) {
    if (!ranked.some(([t]) => t === f)) ranked.push([f, counts.get(f) ?? 0]);
  }
  const mine = new Set(myTags);
  const selected = new Set(filters);
  const withTags = peers.filter((p) => p.tags.length > 0).length;

  return (
    <aside
      aria-label="Popular interests"
      className="flex min-h-0 w-64 flex-col rounded-2xl border border-zinc-800/80 bg-zinc-900/85 text-zinc-200 shadow-2xl backdrop-blur"
    >
      <div className="flex items-center justify-between px-4 pb-1 pt-4">
        <h2 className="text-sm font-semibold text-zinc-100">Popular interests</h2>
        <button
          onClick={() => setOpen(false)}
          aria-label="Hide popular interests"
          className="rounded-full px-2 text-lg leading-none text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        >
          ×
        </button>
      </div>
      <p className="px-4 pb-2 text-[11px] text-zinc-500">
        Among {total} other {total === 1 ? "person" : "people"} online
        {withTags < total && ` · ${withTags} listed interests`}
      </p>
      <p className="px-4 pb-2 text-[11px] text-zinc-400">
        {filters.length > 0 ? (
          <>
            Showing people into any of {filters.length} selected ·{" "}
            <button
              onClick={onClear}
              className="underline decoration-zinc-600 underline-offset-2 hover:text-zinc-100"
            >
              Clear
            </button>
          </>
        ) : (
          "Select interests to filter people and the map."
        )}
      </p>

      {ranked.length === 0 ? (
        <p className="px-4 pb-4 text-xs italic text-zinc-500">
          {total === 0
            ? "No one else is online yet."
            : "No interests listed yet."}
        </p>
      ) : (
        <ol className="min-h-0 space-y-0.5 overflow-y-auto px-2 pb-2">
          {ranked.map(([tag, count]) => {
            const shared = mine.has(tag);
            const pct = total ? (count / total) * 100 : 0;
            const active = selected.has(tag);
            return (
              <li key={tag}>
                <button
                  onClick={() => onToggle(tag)}
                  aria-pressed={active}
                  title={
                    (active ? `Remove #${tag} from filter` : `Filter by #${tag}`) +
                    (shared ? " · you have this too" : "")
                  }
                  // A border (not a ring) for the selected state: rings paint
                  // outside the box and get clipped by the scrolling list.
                  // Transparent when unselected so rows don't shift.
                  className={`block w-full rounded-lg border px-2 py-1.5 text-left transition ${
                    active
                      ? "border-emerald-400/40 bg-emerald-400/10"
                      : "border-transparent hover:bg-zinc-800/80"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2 text-xs">
                    <span
                      className={`truncate ${
                        shared ? "font-medium text-emerald-300" : "text-zinc-200"
                      }`}
                    >
                      #{tag}
                    </span>
                    <span className="shrink-0 tabular-nums text-zinc-400">
                      {count} {count === 1 ? "person" : "people"}
                    </span>
                  </span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-zinc-800">
                    <span
                      className={`block h-full rounded-full ${
                        shared ? "bg-emerald-400" : "bg-zinc-500"
                      }`}
                      style={{ width: `${count ? Math.max(pct, 4) : 0}%` }}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
