// Client-side helpers for talking to the coordination API.
import type { PollResponse, SignalType } from "@/lib/types";
import { sanitizeName, sanitizeTags, type Profile } from "@/lib/profile";

export type LatLng = { lat: number; lng: number };

// Returns the privacy-offset coords + the sanitised profile the server stored
// (null if join failed).
export async function join(
  id: string,
  lat: number,
  lng: number,
  profile: Profile,
): Promise<{ loc: LatLng; profile: Profile } | null> {
  const res = await fetch("/api/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, lat, lng, name: profile.name, tags: profile.tags }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (typeof data?.lat !== "number" || typeof data?.lng !== "number") return null;
  return {
    loc: { lat: data.lat, lng: data.lng },
    profile: { name: sanitizeName(data.name), tags: sanitizeTags(data.tags) },
  };
}

// `offsetLoc` + `profile` let the server recreate our presence row (same
// spot, same name/tags) if it was reaped.
export async function poll(
  id: string,
  offsetLoc: LatLng | null,
  profile: Profile | null,
): Promise<PollResponse> {
  const qs = new URLSearchParams({ id });
  if (offsetLoc) {
    qs.set("lat", String(offsetLoc.lat));
    qs.set("lng", String(offsetLoc.lng));
  }
  if (profile?.name) qs.set("name", profile.name);
  for (const t of profile?.tags ?? []) qs.append("tag", t);
  const res = await fetch(`/api/poll?${qs}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`poll failed: ${res.status}`);
  return res.json();
}

export async function sendSignal(
  fromId: string,
  toId: string,
  type: SignalType,
  payload?: string,
): Promise<void> {
  await fetch("/api/signal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fromId, toId, type, payload }),
  });
}

// Fire-and-forget leave that survives the tab closing.
export function leave(id: string): void {
  const body = JSON.stringify({ id });
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon("/api/leave", body);
  } else {
    void fetch("/api/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  }
}
