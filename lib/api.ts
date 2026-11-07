// Client-side helpers for talking to the coordination API.
import type { PollResponse, SignalType } from "@/lib/types";
import { sanitizeName, sanitizeTags, type Profile } from "@/lib/profile";

export type LatLng = { lat: number; lng: number };

// Issued by /api/join. `id` is public (it's how others address us); `token` is
// the secret that proves a request is ours — keep it in memory only.
export type Session = { id: string; token: string };

function authHeader(session: Session): Record<string, string> {
  return { Authorization: `Bearer ${session.token}` };
}

// Returns our new session, the privacy-offset coords and the sanitised profile
// the server stored (null if join failed).
export async function join(
  lat: number,
  lng: number,
  profile: Profile,
): Promise<{ session: Session; loc: LatLng; profile: Profile } | null> {
  const res = await fetch("/api/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lng, name: profile.name, tags: profile.tags }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (typeof data?.lat !== "number" || typeof data?.lng !== "number") return null;
  if (typeof data?.id !== "string" || typeof data?.token !== "string") return null;
  return {
    session: { id: data.id, token: data.token },
    loc: { lat: data.lat, lng: data.lng },
    profile: { name: sanitizeName(data.name), tags: sanitizeTags(data.tags) },
  };
}

// `offsetLoc` + `profile` let the server recreate our presence row (same
// spot, same name/tags) if it was reaped.
export async function poll(
  session: Session,
  offsetLoc: LatLng | null,
  profile: Profile | null,
): Promise<PollResponse> {
  const qs = new URLSearchParams();
  if (offsetLoc) {
    qs.set("lat", String(offsetLoc.lat));
    qs.set("lng", String(offsetLoc.lng));
  }
  if (profile?.name) qs.set("name", profile.name);
  for (const t of profile?.tags ?? []) qs.append("tag", t);
  const res = await fetch(`/api/poll?${qs}`, {
    cache: "no-store",
    headers: authHeader(session),
  });
  if (!res.ok) throw new Error(`poll failed: ${res.status}`);
  return res.json();
}

// The server takes the sender from our token, so there's no `fromId` to send.
// No-op before we've joined.
export async function sendSignal(
  session: Session | null,
  toId: string,
  type: SignalType,
  payload?: string,
): Promise<void> {
  if (!session) return;
  await fetch("/api/signal", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader(session) },
    body: JSON.stringify({ toId, type, payload }),
  });
}

// Fire-and-forget leave that survives the tab closing. sendBeacon can't set
// headers, so the token goes in the body.
export function leave(session: Session): void {
  const body = JSON.stringify({ token: session.token });
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
