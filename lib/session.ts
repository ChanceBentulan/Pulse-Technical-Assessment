// Server-side session identity.
//
// Every user has two values:
//   token — 256-bit random secret, minted by /api/join, held only by the
//           user's browser. Proves "this request is really me".
//   id    — SHA-256(token) in hex. Public: /api/poll sends it to everyone so
//           dots and requests can be addressed.
//
// Because the id is a hash of the token, the server never trusts an id sent by
// the client — it derives the caller's id from the token. Knowing someone's
// public id gives no way to act as them (that would need a SHA-256 preimage),
// and nothing secret needs to be stored: verification is just a hash.
import { createHash, randomBytes } from "node:crypto";

export type Session = { id: string; token: string };

// 32 random bytes → 43 base64url chars (no padding).
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

function idFor(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newSession(): Session {
  const token = randomBytes(32).toString("base64url");
  return { id: idFor(token), token };
}

// Caller's id from a raw token value, or null if it's not a well-formed token.
export function idFromToken(token: unknown): string | null {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return null;
  return idFor(token);
}

// Caller's id from an `Authorization: Bearer <token>` header (kept out of the
// URL so it never lands in access logs or browser history).
export function idFromRequest(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer (\S+)$/.exec(header);
  return match ? idFromToken(match[1]) : null;
}

export function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
