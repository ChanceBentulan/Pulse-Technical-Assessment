"use client";

import { useState } from "react";
import type { PeerDot } from "@/lib/types";
import { displayName, sharedTags } from "@/lib/profile";
import { useCountries } from "@/lib/country";
import TagList from "./TagList";

// Collapsible table of everyone online. Picking a row flies the map to that
// person's dot and opens their profile card (handled by WorldMap).
export default function PeopleList({
  peers,
  myTags,
  selectedId,
  onSelect,
}: {
  peers: PeerDot[];
  myTags: string[];
  selectedId: string | null;
  onSelect: (peer: PeerDot) => void;
}) {
  // Same default as the legend: open on wider screens, collapsed on phones.
  const [open, setOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth >= 640,
  );
  // Only look countries up while the list is actually shown.
  const countries = useCountries(peers, open);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Show people online"
        className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-full bg-zinc-900/80 px-3 py-1.5 text-xs font-medium text-zinc-200 shadow-lg backdrop-blur hover:bg-zinc-800/90"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        People
        <span className="tabular-nums text-zinc-400">({peers.length})</span>
      </button>
    );
  }

  // Available first, then most interests in common, then by name.
  const rows = peers
    .map((p) => ({ peer: p, shared: sharedTags(p.tags, myTags).size }))
    .sort(
      (a, b) =>
        Number(a.peer.busy) - Number(b.peer.busy) ||
        b.shared - a.shared ||
        displayName(a.peer.name).localeCompare(displayName(b.peer.name)),
    );

  return (
    <aside
      aria-label="People online"
      className="absolute right-4 top-4 z-10 flex max-h-[calc(100%-5rem)] w-64 flex-col rounded-2xl border border-zinc-800/80 bg-zinc-900/85 text-zinc-200 shadow-2xl backdrop-blur"
    >
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <h2 className="text-sm font-semibold text-zinc-100">
          People online{" "}
          <span className="font-normal tabular-nums text-zinc-500">
            ({peers.length})
          </span>
        </h2>
        <button
          onClick={() => setOpen(false)}
          aria-label="Hide people online"
          className="rounded-full px-2 text-lg leading-none text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        >
          ×
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 pb-4 text-xs italic text-zinc-500">
          No one else is here yet.
        </p>
      ) : (
        <div className="min-h-0 overflow-y-auto px-2 pb-2">
          <table className="w-full text-left text-xs">
            <thead className="sr-only">
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ peer, shared }) => {
                const active = peer.id === selectedId;
                return (
                  <tr
                    key={peer.id}
                    onClick={() => onSelect(peer)}
                    className={`cursor-pointer transition ${
                      active ? "bg-emerald-400/10" : "hover:bg-zinc-800/80"
                    }`}
                  >
                    <td className="rounded-l-lg py-2 pl-2">
                      <div className="flex min-w-0 items-start gap-2">
                        <span
                          aria-hidden
                          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-zinc-950 ${
                            peer.busy
                              ? "bg-zinc-600"
                              : "bg-gradient-to-br from-emerald-300 to-teal-500"
                          }`}
                        >
                          {peer.name ? peer.name.charAt(0).toUpperCase() : "?"}
                        </span>
                        <div className="min-w-0 flex-1">
                          {/* The name is the keyboard-focusable control; the
                              whole row is also clickable for mouse/touch. */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelect(peer);
                            }}
                            title={
                              peer.busy
                                ? `${displayName(peer.name)} — busy (show on map)`
                                : `Show ${displayName(peer.name)} on the map`
                            }
                            className={`block max-w-full truncate text-left font-medium focus:outline-none focus-visible:underline ${
                              peer.busy ? "text-zinc-400" : "text-zinc-100"
                            }`}
                          >
                            {displayName(peer.name)}
                          </button>
                          {(countries[peer.id] || shared > 0) && (
                            <p className="truncate text-[10px] text-zinc-500">
                              {countries[peer.id]}
                              {countries[peer.id] && shared > 0 && " · "}
                              {shared > 0 && (
                                <span className="text-emerald-300">
                                  {shared} in common
                                </span>
                              )}
                            </p>
                          )}
                          <TagList
                            tags={peer.tags}
                            myTags={myTags}
                            limit={3}
                            className="mt-1"
                          />
                        </div>
                      </div>
                    </td>
                    <td className="rounded-r-lg py-2 pr-2 text-right align-top">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] ${
                          peer.busy ? "text-zinc-400" : "text-emerald-300"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            peer.busy ? "bg-zinc-500" : "bg-emerald-400"
                          }`}
                        />
                        {peer.busy ? "Busy" : "Available"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </aside>
  );
}
