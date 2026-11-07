import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { idFromToken, unauthorized } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/leave — body { token }. Removes the caller's presence row and any
// pending signals to/from them. Called via navigator.sendBeacon on tab close,
// which can't set headers — so the token rides in the body, which may arrive
// as text; parse defensively.
export async function POST(request: NextRequest) {
  let token: unknown;
  try {
    const text = await request.text();
    token = text ? JSON.parse(text)?.token : undefined;
  } catch {
    token = undefined;
  }

  const id = idFromToken(token);
  if (!id) return unauthorized();

  // Independent cleanup deletes — no atomicity needed (and interactive
  // transactions are unreliable over a PgBouncer pooler).
  await prisma.signal.deleteMany({
    where: { OR: [{ toId: id }, { fromId: id }] },
  });
  await prisma.presence.deleteMany({ where: { id } });

  return Response.json({ ok: true });
}
