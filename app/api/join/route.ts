import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyPrivacyOffset, isValidLatLng } from "@/lib/geo";
import { sanitizeName, sanitizeTags } from "@/lib/profile";
import { newSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/join — body { lat, lng, name?, tags? } (raw coords).
// Mints a fresh session (public id + secret token — see lib/session.ts),
// applies a 1–3 km privacy offset and creates the presence row. Raw
// coordinates are never stored. The client never chooses its own id, so it
// can't claim (or overwrite) someone else's row.
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const { lat, lng, name: rawName, tags: rawTags } = (body ?? {}) as Record<
    string,
    unknown
  >;

  if (!isValidLatLng(lat, lng)) {
    return Response.json({ error: "invalid coordinates" }, { status: 400 });
  }

  const offset = applyPrivacyOffset(lat as number, lng as number);
  // Never trust the client: clamp length, strip control/bidi chars, dedupe.
  const name = sanitizeName(rawName);
  const tags = sanitizeTags(rawTags);

  const { id, token } = newSession();

  await prisma.presence.create({
    data: {
      id,
      lat: offset.lat,
      lng: offset.lng,
      busy: false,
      name,
      tags,
      lastSeen: new Date(),
    },
  });

  // Hand the offset coords back so the client can re-register with the SAME
  // position via /api/poll if its row is ever reaped. Re-joining would roll a
  // fresh random offset, and many samples could be averaged back to the raw
  // location.
  // Echo the sanitised profile too, so the client shows exactly what others see.
  // The token is returned exactly once, here; the server never stores it.
  return Response.json(
    { ok: true, id, token, lat: offset.lat, lng: offset.lng, name, tags },
    { headers: { "Cache-Control": "no-store" } },
  );
}
