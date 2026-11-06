// Optional, ephemeral public profile: a display name + interest tags.
// Lives only on the Presence row (deleted on leave / staleness), so it is no
// more durable than the dot itself. Shared by client (input UX) and server
// (authoritative sanitising — never trust what the client sends).

export const NAME_MAX = 24;
export const TAG_MAX = 20;
export const TAGS_MAX = 5;
export const FALLBACK_NAME = "Stranger";

export const SUGGESTED_TAGS = [
  "music",
  "travel",
  "gaming",
  "books",
  "movies",
  "tech",
  "art",
  "sports",
  "food",
  "languages",
  "fitness",
  "anime",
];

export interface Profile {
  name: string | null;
  tags: string[];
}

// Strip control / invisible formatting chars (incl. bidi overrides used to
// spoof text) and collapse whitespace.
function clean(s: string): string {
  return s
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = clean(raw).slice(0, NAME_MAX).trim();
  return name.length > 0 ? name : null;
}

// Letters/numbers (any script), plus inner spaces, hyphens, & and +.
const TAG_RE = /^[\p{L}\p{N}][\p{L}\p{N} &+\-]*$/u;

export function sanitizeTag(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const tag = clean(raw).replace(/^#+/, "").toLowerCase().slice(0, TAG_MAX).trim();
  return tag.length > 0 && TAG_RE.test(tag) ? tag : null;
}

export function sanitizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const t of raw) {
    const tag = sanitizeTag(t);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length >= TAGS_MAX) break;
  }
  return out;
}

export function displayName(name: string | null | undefined): string {
  return name || FALLBACK_NAME;
}

export function sharedTags(a: string[], b: string[]): Set<string> {
  const bs = new Set(b);
  return new Set(a.filter((t) => bs.has(t)));
}
