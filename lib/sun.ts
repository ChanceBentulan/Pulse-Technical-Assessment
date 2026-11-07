// Where the sun is, and what that means for a place on the map. Used by the
// day/night overlay and the "it's 3:12 am for them" clock. Pure maths in the
// browser: low-precision solar ephemeris (accurate to well under a degree,
// which is far finer than the overlay's soft edge).

const RAD = Math.PI / 180;
const J2000_MS = Date.UTC(2000, 0, 1, 12); // 2000-01-01 12:00 UTC
const DAY_MS = 86_400_000;

// The point on Earth where the sun is directly overhead.
export function subsolarPoint(date: Date): { lat: number; lng: number } {
  const n = (date.getTime() - J2000_MS) / DAY_MS; // days since J2000
  const L = 280.46 + 0.9856474 * n; // mean longitude
  const g = (357.528 + 0.9856003 * n) * RAD; // mean anomaly
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD; // ecliptic longitude
  const eps = (23.439 - 0.0000004 * n) * RAD; // obliquity of the ecliptic

  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const gmst = 280.46061837 + 360.98564736629 * n; // Greenwich sidereal time, deg

  return { lat: decl / RAD, lng: wrapLng(ra / RAD - gmst) };
}

// Sun's elevation above the horizon at a place, in degrees (negative = below).
export function sunAltitude(
  lat: number,
  lng: number,
  sun: { lat: number; lng: number },
): number {
  const phi = lat * RAD;
  const decl = sun.lat * RAD;
  const hourAngle = (lng - sun.lng) * RAD;
  const s =
    Math.sin(phi) * Math.sin(decl) +
    Math.cos(phi) * Math.cos(decl) * Math.cos(hourAngle);
  return Math.asin(Math.max(-1, Math.min(1, s))) / RAD;
}

export type SkyPhase = "day" | "sunrise" | "sunset" | "night";

// What the sky looks like there right now: golden hour / twilight counts as
// sunrise or sunset depending on whether the sun is climbing.
export function skyPhase(lat: number, lng: number, date: Date): SkyPhase {
  const alt = sunAltitude(lat, lng, subsolarPoint(date));
  if (alt >= 6) return "day";
  if (alt <= -6) return "night";
  const later = sunAltitude(lat, lng, subsolarPoint(new Date(date.getTime() + 10 * 60_000)));
  return later > alt ? "sunrise" : "sunset";
}

export const SKY_EMOJI: Record<SkyPhase, string> = {
  day: "☀️",
  sunrise: "🌅",
  sunset: "🌇",
  night: "🌙",
};

export const SKY_LABEL: Record<SkyPhase, string> = {
  day: "Daytime there",
  sunrise: "Sunrise there",
  sunset: "Sunset there",
  night: "Night-time there",
};

// Web Mercator's latitude limit; the overlay image spans exactly this range.
export const MERCATOR_MAX_LAT = 85.0511287798;

// Paints the night side of the Earth onto `canvas` as a Web-Mercator image
// (rows are spaced in Mercator y, not latitude, so Mapbox can stretch it over
// the world without distortion). Night fades in through twilight, and a faint
// amber band marks the terminator, where it's sunrise or sunset right now.
export function paintNight(canvas: HTMLCanvasElement, date: Date): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width: W, height: H } = canvas;
  const img = ctx.createImageData(W, H);
  const px = img.data;
  const sun = subsolarPoint(date);

  // Precompute per-row latitude and per-column longitude.
  const lats = new Float64Array(H);
  for (let y = 0; y < H; y++) {
    const mercY = Math.PI * (1 - (2 * (y + 0.5)) / H);
    lats[y] = Math.atan(Math.sinh(mercY)) / RAD;
  }
  const lngs = new Float64Array(W);
  for (let x = 0; x < W; x++) lngs[x] = -180 + ((x + 0.5) / W) * 360;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const alt = sunAltitude(lats[y], lngs[x], sun);

      // Night: 0 in daylight, rising smoothly through twilight to full at -12°.
      const t = smoothstep(clamp01((0.5 - alt) / 12.5));
      const nightA = 0.58 * t;
      // Terminator glow: peaks just below the horizon, ~5° wide either side.
      const glowA = 0.11 * Math.max(0, 1 - Math.abs(alt + 1) / 5);

      // Composite glow (amber) over night (deep navy).
      const a = glowA + nightA * (1 - glowA);
      const i = (y * W + x) * 4;
      if (a <= 0.001) {
        px[i + 3] = 0;
        continue;
      }
      const wn = (nightA * (1 - glowA)) / a;
      const wg = glowA / a;
      px[i] = 3 * wn + 251 * wg;
      px[i + 1] = 7 * wn + 191 * wg;
      px[i + 2] = 30 * wn + 36 * wg;
      px[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function wrapLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}
