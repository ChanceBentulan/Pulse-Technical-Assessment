"use client";

import { useState } from "react";
import type { SafetySymbol } from "@/lib/safetyCode";

// Shield badge + expandable card for comparing the connection's safety code.
// Both partners see the same six emoji only if their encryption keys reached
// each other untouched; see lib/safetyCode.ts for the reasoning.
export default function SafetyCode({
  code,
  peerName,
  iVerified,
  peerVerified,
  onConfirm,
  onReject,
  onCompareByCall,
}: {
  code: SafetySymbol[] | null;
  peerName: string;
  iVerified: boolean;
  peerVerified: boolean;
  onConfirm: () => void;
  onReject: () => void;
  // Offered when not already in a call: voice/video is the safe channel.
  onCompareByCall?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const both = iVerified && peerVerified;

  const badge = !code
    ? { label: "Securing…", cls: "border-zinc-700 text-zinc-500" }
    : both
      ? { label: "Verified end-to-end", cls: "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" }
      : iVerified
        ? { label: "Verified by you", cls: "border-emerald-500/40 text-emerald-300" }
        : peerVerified
          ? { label: `${peerName} verified · check yours`, cls: "border-amber-500/50 bg-amber-500/10 text-amber-200" }
          : { label: "Verify safety code", cls: "border-amber-500/40 text-amber-200" };

  return (
    <div className="mt-2">
      <button
        type="button"
        disabled={!code}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition hover:brightness-125 disabled:cursor-default ${badge.cls}`}
      >
        <ShieldIcon checked={iVerified} />
        {badge.label}
      </button>

      {open && code && (
        <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-900/80 p-3">
          <p className="text-xs leading-relaxed text-zinc-400">
            Ask {peerName} what they see. If both of you have the{" "}
            <span className="text-zinc-200">same six symbols in the same order</span>, your chat
            and video are encrypted directly between you — not even Pulse&apos;s server can read
            them.
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-amber-200/80">
            Compare by voice or video — don&apos;t type the code in chat. Anyone intercepting
            the connection could rewrite text messages, but can&apos;t fake your voice reading it
            live.
          </p>

          <ol className="mt-3 grid grid-cols-6 gap-1" aria-label="Safety code">
            {code.map((s, i) => (
              <li key={i} className="flex flex-col items-center rounded-lg bg-zinc-950 py-1.5">
                <span className="text-2xl leading-none" aria-hidden>
                  {s.emoji}
                </span>
                <span className="mt-1 text-[10px] text-zinc-500">{s.name}</span>
              </li>
            ))}
          </ol>

          {iVerified ? (
            <p className="mt-3 text-xs text-emerald-300">
              ✓ You confirmed the codes match.{" "}
              {peerVerified ? `${peerName} did too.` : `Waiting for ${peerName} to confirm.`}
            </p>
          ) : (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={onConfirm}
                className="flex-1 rounded-full bg-emerald-500 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
              >
                They match
              </button>
              <button
                type="button"
                onClick={onReject}
                className="flex-1 rounded-full border border-red-500/60 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/10"
              >
                Don&apos;t match
              </button>
            </div>
          )}
          {!iVerified && onCompareByCall && (
            <button
              type="button"
              onClick={onCompareByCall}
              className="mt-2 w-full rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:border-zinc-500"
            >
              Start a call to compare (camera can stay off)
            </button>
          )}
          {!iVerified && (
            <p className="mt-2 text-[11px] text-zinc-500">
              &ldquo;Don&apos;t match&rdquo; ends the connection — someone may be intercepting it.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ShieldIcon({ checked }: { checked: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" strokeLinejoin="round" />
      {checked && <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}
