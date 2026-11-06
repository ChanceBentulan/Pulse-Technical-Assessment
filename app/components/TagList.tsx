"use client";

import { sharedTags } from "@/lib/profile";

// Interest tags, with the ones you have in common highlighted first.
export default function TagList({
  tags,
  myTags,
  className = "",
  limit,
}: {
  tags: string[];
  myTags: string[];
  className?: string;
  // Show at most this many (shared first), plus a "+N" chip for the rest.
  limit?: number;
}) {
  if (tags.length === 0) return null;
  const shared = sharedTags(tags, myTags);
  const ordered = [...tags].sort(
    (a, b) => Number(shared.has(b)) - Number(shared.has(a)),
  );
  const shown = limit === undefined ? ordered : ordered.slice(0, limit);
  const hidden = ordered.length - shown.length;

  return (
    <ul className={`flex flex-wrap gap-1 ${className}`}>
      {shown.map((t) => (
        <li
          key={t}
          title={shared.has(t) ? "You share this interest" : undefined}
          className={`rounded-full px-2 py-0.5 text-[11px] ${
            shared.has(t)
              ? "bg-emerald-400/15 font-medium text-emerald-300 ring-1 ring-emerald-400/40"
              : "bg-zinc-800 text-zinc-300"
          }`}
        >
          #{t}
        </li>
      ))}
      {hidden > 0 && (
        <li
          title={ordered.slice(shown.length).map((t) => `#${t}`).join(" ")}
          className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400"
        >
          +{hidden}
        </li>
      )}
    </ul>
  );
}
