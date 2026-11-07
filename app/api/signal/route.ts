import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type { SignalType } from "@/lib/types";
import { idFromRequest, unauthorized } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TYPES: SignalType[] = [
  "request",
  "accept",
  "decline",
  "offer",
  "answer",
  "ice",
  "end",
];

const MAX_PAYLOAD = 64 * 1024; // SDP/ICE are small; cap to be safe.

// POST /api/signal — body { toId, type, payload? }
// Auth: `Authorization: Bearer <token>`. The sender (`fromId`) is derived from
// the token, never taken from the body, so nobody can send as someone else.
// Drops one message into the recipient's mailbox. Also manages the `busy`
// flag so a user can only be in one connection at a time.
export async function POST(request: NextRequest) {
  const fromId = idFromRequest(request);
  if (!fromId) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const { toId, type, payload } = (body ?? {}) as Record<string, unknown>;

  if (typeof toId !== "string" || toId.length > 64 || toId === fromId) {
    return Response.json({ error: "invalid toId" }, { status: 400 });
  }
  if (typeof type !== "string" || !VALID_TYPES.includes(type as SignalType)) {
    return Response.json({ error: "invalid type" }, { status: 400 });
  }
  if (
    payload !== undefined &&
    payload !== null &&
    (typeof payload !== "string" || payload.length > MAX_PAYLOAD)
  ) {
    return Response.json({ error: "invalid payload" }, { status: 400 });
  }

  const signalType = type as SignalType;
  const payloadStr = typeof payload === "string" ? payload : null;

  // Enforce "one active connection at a time": if the target is already busy,
  // auto-decline the request instead of delivering it.
  if (signalType === "request") {
    // The sender must be on the map themselves — no requests from invisible
    // ids that the recipient can't see or identify.
    const sender = await prisma.presence.findUnique({
      where: { id: fromId },
      select: { id: true },
    });
    if (!sender) {
      return Response.json({ error: "not joined" }, { status: 403 });
    }
    const target = await prisma.presence.findUnique({
      where: { id: toId },
      select: { busy: true },
    });
    if (!target) {
      // Target went offline — tell the initiator it was declined.
      await sendDecline(toId, fromId);
      return Response.json({ ok: true, autoDeclined: true });
    }
    if (target.busy) {
      await sendDecline(toId, fromId);
      return Response.json({ ok: true, autoDeclined: true });
    }
  }

  // Busy transitions:
  // - accept: the connection is now active → mark BOTH peers busy.
  // - end: the connection (or pending request) is over → free both peers.
  // `decline` deliberately leaves busy alone: it only happens before an
  // accept, and a user already in a chat auto-declines new requests — clearing
  // busy there would wrongly mark them available mid-conversation.
  // partnerId mirrors this so the map can draw the pair as a live arc.
  if (signalType === "accept") {
    await prisma.presence.updateMany({
      where: { id: { in: [fromId, toId] } },
      data: { busy: true },
    });
    await prisma.presence.updateMany({
      where: { id: fromId },
      data: { partnerId: toId },
    });
    await prisma.presence.updateMany({
      where: { id: toId },
      data: { partnerId: fromId },
    });
  } else if (signalType === "end") {
    await prisma.presence.updateMany({
      where: { id: { in: [fromId, toId] } },
      data: { busy: false },
    });
    // Only unlink this exact pair — an "end" for a cancelled request must
    // not erase the target's link to someone else.
    await prisma.presence.updateMany({
      where: {
        OR: [
          { id: fromId, partnerId: toId },
          { id: toId, partnerId: fromId },
        ],
      },
      data: { partnerId: null },
    });
  }

  await prisma.signal.create({
    data: { fromId, toId, type: signalType, payload: payloadStr },
  });

  return Response.json({ ok: true });
}

// Helper: deliver an auto-decline from `target` back to `initiator`.
async function sendDecline(targetId: string, initiatorId: string) {
  await prisma.signal.create({
    data: { fromId: targetId, toId: initiatorId, type: "decline", payload: null },
  });
}
