"use client";

import { useEffect, useState } from "react";
import { SKY_EMOJI, SKY_LABEL, skyPhase } from "@/lib/sun";

// "🌙 3:12 am for them · 7h ahead" — the partner's local time (from the time
// zone their browser sent us peer-to-peer) plus the sky at their dot. Without
// a time zone (not received yet), falls back to just the sky.
export default function PartnerClock({
  timeZone,
  location,
}: {
  timeZone: string | null;
  location: { lat: number; lng: number } | null;
}) {
  const now = useNow(30_000);
  if (!timeZone && !location) return null;

  const phase = location ? skyPhase(location.lat, location.lng, now) : null;
  const emoji = phase ? SKY_EMOJI[phase] : "🕒";

  if (!timeZone) {
    return phase ? (
      <p className="text-xs text-zinc-400">
        {emoji} {SKY_LABEL[phase]}
      </p>
    ) : null;
  }

  const time = new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
  const diff = describeOffset(
    // getTimezoneOffset() is minutes *behind* UTC, so adding it subtracts ours.
    offsetMinutes(timeZone, now) + now.getTimezoneOffset(),
  );

  return (
    <p className="text-xs text-zinc-400" title={timeZone.replace(/_/g, " ")}>
      {emoji} <span className="text-zinc-200">{time}</span> for them
      <span className="text-zinc-500"> · {diff}</span>
    </p>
  );
}

// Current time, re-rendered every `ms` (aligned to the clock so minutes flip
// on time).
function useNow(ms: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), ms);
    }, ms - (Date.now() % ms));
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [ms]);
  return now;
}

// The zone's UTC offset in minutes at `date` (e.g. Asia/Tokyo → 540).
function offsetMinutes(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  const utc = Math.floor(date.getTime() / 60_000) * 60_000;
  return Math.round((wall - utc) / 60_000);
}

function describeOffset(min: number): string {
  if (min === 0) return "same time as you";
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const amount = m ? `${h}h ${m}m` : `${h}h`;
  return `${amount} ${min > 0 ? "ahead" : "behind"}`;
}
