"use client";

import { useEffect, useState } from "react";
import type { PeerDot } from "@/lib/types";

// Country label for a peer, via Mapbox reverse geocoding of their dot.
// Only the already privacy-offset dot position is ever sent — the same
// coordinates everyone can already see on the map. A dot's position is fixed
// for its session, so results are cached by peer id for the page's lifetime.

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const cache = new Map<string, Promise<string | null>>();

function lookup(peer: PeerDot): Promise<string | null> {
  let hit = cache.get(peer.id);
  if (!hit) {
    const params = new URLSearchParams({
      longitude: String(peer.lng),
      latitude: String(peer.lat),
      types: "country",
      limit: "1",
      // Always English, to match the rest of the UI regardless of locale.
      language: "en",
      access_token: TOKEN ?? "",
    });
    hit = fetch(`https://api.mapbox.com/search/geocode/v6/reverse?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const name = data?.features?.[0]?.properties?.name;
        return typeof name === "string" ? name : null;
      })
      .catch(() => null);
    // Don't cache failures forever — allow a retry on a later render.
    hit.then((v) => {
      if (v === null) cache.delete(peer.id);
    });
    cache.set(peer.id, hit);
  }
  return hit;
}

// Resolves countries for the given peers; missing entries are still loading
// or unknown (e.g. a dot over open water).
export function useCountries(
  peers: PeerDot[],
  enabled = true,
): Record<string, string> {
  const [countries, setCountries] = useState<Record<string, string>>({});
  const key = peers.map((p) => p.id).join(",");

  useEffect(() => {
    if (!enabled || !TOKEN) return;
    let active = true;
    for (const peer of peers) {
      if (countries[peer.id]) continue;
      void lookup(peer).then((name) => {
        if (active && name) {
          setCountries((prev) =>
            prev[peer.id] === name ? prev : { ...prev, [peer.id]: name },
          );
        }
      });
    }
    return () => {
      active = false;
    };
    // Re-run only when the set of peers changes, not on every poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return countries;
}
