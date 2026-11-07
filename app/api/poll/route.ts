import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { STALE_MS, SIGNAL_TTL_MS } from "@/lib/presence";
import { isValidLatLng } from "@/lib/geo";
import { sanitizeName, sanitizeTags } from "@/lib/profile";
import type { LiveLink, PollResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/poll?id= — the single endpoint that drives the live map.
// It (1) heartbeats the caller, (2) reaps stale presence + orphan signals,
// (3) returns the filtered online peers, and (4) drains this user's mailbox.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const id = params.get("id");

  if (!id) {
    return Response.json({ error: "missing id" }, { status: 400 });
  }

  const now = Date.now();
  const staleCutoff = new Date(now - STALE_MS);
  const signalCutoff = new Date(now - SIGNAL_TTL_MS);

  // 1) Heartbeat — refresh lastSeen for the caller only.
  // If the caller's row is gone (reaped after a throttled background tab, or
  // removed by a pagehide leave before a back/forward-cache restore), recreate
  // it from the already-offset coords (and profile) the client got back from
  // /api/join. Profile params are only used on that recreate path.
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  const lastSeen = new Date(now);
  if (params.has("lat") && params.has("lng") && isValidLatLng(lat, lng)) {
    await prisma.presence.upsert({
      where: { id },
      create: {
        id,
        lat,
        lng,
        busy: false,
        name: sanitizeName(params.get("name")),
        tags: sanitizeTags(params.getAll("tag")),
        lastSeen,
      },
      update: { lastSeen },
    });
  } else {
    await prisma.presence.updateMany({ where: { id }, data: { lastSeen } });
  }

  // 2) Reap stale presence rows and orphaned signals (independent deletes —
  // no atomicity needed, and avoids transactions over a PgBouncer pooler).
  await prisma.presence.deleteMany({ where: { lastSeen: { lt: staleCutoff } } });
  await prisma.signal.deleteMany({ where: { createdAt: { lt: signalCutoff } } });

  // 3) Everyone online (self included, so our own connection gets an arc
  // too); peers are everyone else.
  const online = await prisma.presence.findMany({
    where: { lastSeen: { gte: staleCutoff } },
    select: {
      id: true,
      lat: true,
      lng: true,
      busy: true,
      name: true,
      tags: true,
      partnerId: true,
    },
  });
  const peers = online.filter((p) => p.id !== id);

  // Live connection arcs: pairs whose rows point at each other, once each.
  const byId = new Map(online.map((p) => [p.id, p]));
  const links: LiveLink[] = [];
  for (const p of online) {
    if (!p.partnerId || p.id > p.partnerId) continue;
    const q = byId.get(p.partnerId);
    if (q?.partnerId !== p.id || !p.busy || !q.busy) continue;
    links.push({
      from: { lat: p.lat, lng: p.lng },
      to: { lat: q.lat, lng: q.lng },
    });
  }

  // 4) Drain this user's mailbox: read, then delete exactly what we read so a
  // concurrently-inserted signal is never lost.
  const inbox = await prisma.signal.findMany({
    where: { toId: id },
    orderBy: { createdAt: "asc" },
  });
  if (inbox.length > 0) {
    await prisma.signal.deleteMany({
      where: { id: { in: inbox.map((s) => s.id) } },
    });
  }

  const response: PollResponse = {
    peers: peers.map((p) => ({
      id: p.id,
      lat: p.lat,
      lng: p.lng,
      busy: p.busy,
      name: p.name,
      tags: p.tags,
    })),
    links,
    signals: inbox.map((s) => ({
      id: s.id,
      fromId: s.fromId,
      toId: s.toId,
      type: s.type as PollResponse["signals"][number]["type"],
      payload: s.payload,
      createdAt: s.createdAt.toISOString(),
    })),
  };

  return Response.json(response);
}
