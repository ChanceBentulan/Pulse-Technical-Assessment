"use client";

import { useState } from "react";

// Collapsible key for the map: what each marker means, how to connect, and
// why dots aren't at anyone's exact location.
export default function MapLegend({
  available,
  busy,
  canConnect,
}: {
  available: number;
  busy: number;
  canConnect: boolean;
}) {
  // Open by default on wider screens; on phones start collapsed so the map
  // isn't covered. Only mounted client-side (after the entry gate).
  const [open, setOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth >= 640,
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Show map legend"
        className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full bg-zinc-900/80 px-3 py-1.5 text-xs font-medium text-zinc-200 shadow-lg backdrop-blur hover:bg-zinc-800/90"
      >
        <span className="flex h-4 w-4 items-center justify-center rounded-full border border-zinc-500 text-[10px]">
          ?
        </span>
        Legend
      </button>
    );
  }

  return (
    <aside
      aria-label="Map legend"
      className="absolute left-4 top-4 z-10 w-64 rounded-2xl border border-zinc-800/80 bg-zinc-900/85 p-4 text-zinc-200 shadow-2xl backdrop-blur"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-100">On the map</h2>
        <button
          onClick={() => setOpen(false)}
          aria-label="Hide map legend"
          className="rounded-full px-2 text-lg leading-none text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        >
          ×
        </button>
      </div>

      <ul className="space-y-2.5 text-xs">
        <li className="flex items-center gap-3">
          <span className="flex w-5 justify-center text-base leading-none">📍</span>
          <span>
            <span className="font-medium text-zinc-100">You</span>
            <span className="text-zinc-400"> — only you see this pin</span>
          </span>
        </li>
        <li className="flex items-center gap-3">
          <span className="flex w-5 justify-center">
            <span className="pulse-dot pulse-dot--static" />
          </span>
          <span>
            <span className="font-medium text-zinc-100">Available</span>
            <span className="text-zinc-400"> — tap to connect</span>
            <span className="ml-1 tabular-nums text-zinc-500">({available})</span>
          </span>
        </li>
        <li className="flex items-center gap-3">
          <span className="flex w-5 justify-center">
            <span className="pulse-dot pulse-dot--static pulse-dot--busy" />
          </span>
          <span>
            <span className="font-medium text-zinc-100">Busy</span>
            <span className="text-zinc-400"> — already in a chat</span>
            <span className="ml-1 tabular-nums text-zinc-500">({busy})</span>
          </span>
        </li>
      </ul>

      <div className="my-3 h-px bg-zinc-800" />

      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        How it works
      </h3>
      <ol className="list-decimal space-y-1 pl-4 text-xs text-zinc-300 marker:text-zinc-500">
        <li>Tap a dot to see their name and interests, then say hi.</li>
        <li>If they accept, a private text chat opens.</li>
        <li>From the chat, either of you can ask to start video.</li>
      </ol>

      {!canConnect && (
        <p className="mt-3 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-300">
          You&apos;re in a connection. End it to reach someone new.
        </p>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
        Dots are placed 1–3 km from each person&apos;s real location, in a new
        spot every session. Chat and video go directly between the two of you
        and are never stored.
      </p>
    </aside>
  );
}
