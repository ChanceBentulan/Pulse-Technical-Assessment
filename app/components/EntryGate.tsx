"use client";

import { useState } from "react";
import {
  NAME_MAX,
  SUGGESTED_TAGS,
  TAG_MAX,
  TAGS_MAX,
  sanitizeName,
  sanitizeTag,
  type Profile,
} from "@/lib/profile";

export default function EntryGate({
  onReady,
}: {
  // Resolves false if joining failed, so the gate can say so.
  onReady: (lat: number, lng: number, profile: Profile) => Promise<boolean>;
}) {
  const [status, setStatus] = useState<"idle" | "locating" | "error">("idle");
  const [error, setError] = useState<string>("");
  const [name, setName] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");

  const full = tags.length >= TAGS_MAX;

  function toggleTag(raw: string) {
    const tag = sanitizeTag(raw);
    if (!tag) return;
    setTags((prev) =>
      prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : prev.length < TAGS_MAX
          ? [...prev, tag]
          : prev,
    );
  }

  function addDraftTag() {
    const tag = sanitizeTag(tagDraft);
    if (tag && !tags.includes(tag) && !full) setTags([...tags, tag]);
    setTagDraft("");
  }

  function enter() {
    if (!("geolocation" in navigator)) {
      setStatus("error");
      setError("Your browser doesn't support location access.");
      return;
    }
    // Include a typed-but-not-yet-added custom tag.
    const draft = sanitizeTag(tagDraft);
    const finalTags =
      draft && !tags.includes(draft) && !full ? [...tags, draft] : tags;
    const profile: Profile = { name: sanitizeName(name), tags: finalTags };
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const ok = await onReady(pos.coords.latitude, pos.coords.longitude, profile);
        if (!ok) {
          setStatus("error");
          setError("Couldn't connect to Pulse. Please try again.");
        }
      },
      (err) => {
        setStatus("error");
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission is required to place you on the map."
            : "Couldn't get your location. Please try again.",
        );
      },
      // High accuracy + maximumAge:0 forces a fresh fix (Wi-Fi/GPS scan)
      // instead of reusing the browser's cached IP-based location.
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  // Suggested chips, plus any custom tags the user added (so they can be
  // removed the same way).
  const chips = [...SUGGESTED_TAGS, ...tags.filter((t) => !SUGGESTED_TAGS.includes(t))];

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-8 bg-zinc-950 p-6 text-zinc-100">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">Pulse</h1>
        <p className="mt-2 max-w-sm text-zinc-400">
          A living globe of strangers. Drop onto the map and connect.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          enter();
        }}
        className="w-full max-w-sm space-y-5"
      >
        <div>
          <label htmlFor="pulse-name" className="text-sm font-medium text-zinc-300">
            What should people call you?{" "}
            <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <input
            id="pulse-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={NAME_MAX}
            placeholder="Stranger"
            autoComplete="off"
            className="mt-2 w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-sm outline-none ring-1 ring-zinc-800 placeholder:text-zinc-600 focus:ring-emerald-400"
          />
          <p className="mt-1.5 text-xs text-zinc-500">
            A nickname is best — no need for your real name.
          </p>
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-zinc-300">
              Interests <span className="font-normal text-zinc-500">(optional)</span>
            </span>
            <span className="text-xs tabular-nums text-zinc-500">
              {tags.length}/{TAGS_MAX}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chips.map((t) => {
              const on = tags.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTag(t)}
                  disabled={!on && full}
                  aria-pressed={on}
                  className={`rounded-full px-3 py-1 text-xs transition ${
                    on
                      ? "bg-emerald-400 font-medium text-zinc-950"
                      : "bg-zinc-900 text-zinc-300 ring-1 ring-zinc-800 hover:ring-zinc-600 disabled:opacity-40 disabled:hover:ring-zinc-800"
                  }`}
                >
                  #{t}
                </button>
              );
            })}
          </div>
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addDraftTag();
              }
            }}
            onBlur={addDraftTag}
            maxLength={TAG_MAX}
            disabled={full}
            placeholder={full ? "That's 5 — nice." : "Add your own, press Enter"}
            autoComplete="off"
            className="mt-2 w-full rounded-xl bg-zinc-900 px-4 py-2 text-sm outline-none ring-1 ring-zinc-800 placeholder:text-zinc-600 focus:ring-emerald-400 disabled:opacity-50"
          />
        </div>

        <button
          type="submit"
          disabled={status === "locating"}
          className="w-full rounded-full bg-emerald-400 px-8 py-3 font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:opacity-60"
        >
          {status === "locating" ? "Locating…" : "Enter Pulse"}
        </button>
      </form>

      {status === "error" && (
        <p className="max-w-sm text-center text-sm text-red-400">{error}</p>
      )}

      <p className="max-w-sm text-center text-xs text-zinc-500">
        No sign-up. Your dot is placed 1–3&nbsp;km from your real location. Your
        name and interests are visible to others only while you&apos;re online —
        closing the tab erases everything.
      </p>
    </div>
  );
}
