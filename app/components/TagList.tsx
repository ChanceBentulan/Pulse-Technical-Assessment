"use client";

import { sharedTags } from "@/lib/profile";

// Interest tags, with the ones you have in common highlighted first.
export default function TagList({
  tags,
  myTags,
  className = "",
}: {
  tags: string[];
  myTags: string[];
  className?: string;
}) {
  if (tags.length === 0) return null;
  const shared = sharedTags(tags, myTags);
  const ordered = [...tags].sort(
    (a, b) => Number(shared.has(b)) - Number(shared.has(a)),
  );

  return (
    <ul className={`flex flex-wrap gap-1 ${className}`}>
      {ordered.map((t) => (
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
    </ul>
  );
}
