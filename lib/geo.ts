// Privacy offset: move a real coordinate 1–3 km in a random direction so the
// dot is placed *near* the user, never at their exact location. A fresh random
// offset is generated each session (this runs once per join), so the same user
// lands somewhere different every time.

const KM_PER_DEG_LAT = 111.32;

export function applyPrivacyOffset(
  lat: number,
  lng: number,
): { lat: number; lng: number } {
  const distanceKm = 1 + Math.random() * 2; // 1–3 km
  const bearing = Math.random() * 2 * Math.PI; // random direction

  const dLat = (distanceKm * Math.cos(bearing)) / KM_PER_DEG_LAT;
  const latRad = (lat * Math.PI) / 180;
  const dLng =
    (distanceKm * Math.sin(bearing)) /
    (KM_PER_DEG_LAT * Math.cos(latRad) || KM_PER_DEG_LAT);

  return {
    lat: clamp(lat + dLat, -90, 90),
    lng: wrapLng(lng + dLng),
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function wrapLng(lng: number): number {
  // Keep longitude in [-180, 180].
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

const EARTH_RADIUS_KM = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

// Great-circle distance between two points (haversine), in km.
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Ring of [lng, lat] points approximating a circle of `radiusKm` around
// `center`, for drawing on the map. Longitudes are kept continuous around the
// center (not wrapped to ±180) so circles crossing the antimeridian render.
export function circleRing(
  center: { lat: number; lng: number },
  radiusKm: number,
  steps = 128,
): [number, number][] {
  const lat1 = toRad(center.lat);
  const lng1 = toRad(center.lng);
  const d = radiusKm / EARTH_RADIUS_KM;
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const brng = (2 * Math.PI * i) / steps;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng),
    );
    const lng2 =
      lng1 +
      Math.atan2(
        Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
        Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
      );
    ring.push([toDeg(lng2), toDeg(lat2)]);
  }
  return ring;
}

// A curved path between two points for the live-connection arcs: the great
// circle (the real shortest route), bowed sideways so even nearby pairs read
// as an arc rather than a straight line. Longitudes are kept continuous, so
// arcs across the Pacific take the short way over the antimeridian.
export function arcPath(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  steps = 64,
): [number, number][] {
  const toVec = (p: { lat: number; lng: number }) => {
    const la = toRad(p.lat);
    const lo = toRad(p.lng);
    return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  };
  const va = toVec(a);
  const vb = toVec(b);
  const dot = Math.min(1, Math.max(-1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
  const omega = Math.acos(dot);
  const sinO = Math.sin(omega);

  // Great-circle points (spherical interpolation).
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const [wa, wb] =
      sinO < 1e-9 ? [1 - t, t] : [Math.sin((1 - t) * omega) / sinO, Math.sin(t * omega) / sinO];
    const x = wa * va[0] + wb * vb[0];
    const y = wa * va[1] + wb * vb[1];
    const z = wa * va[2] + wb * vb[2];
    let lng = toDeg(Math.atan2(y, x));
    const lat = toDeg(Math.atan2(z, Math.hypot(x, y)));
    if (pts.length) {
      const prev = pts[pts.length - 1][0];
      while (lng - prev > 180) lng -= 360;
      while (lng - prev < -180) lng += 360;
    }
    pts.push([lng, lat]);
  }

  // Bow the path: push each point perpendicular to the chord, most in the
  // middle, always toward the north-ish side so arcs look like flight paths.
  const [x0, y0] = pts[0];
  const [x1, y1] = pts[pts.length - 1];
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len === 0) return pts;
  let nx = -dy / len;
  let ny = dx / len;
  if (ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  const bow = 0.18 * len;
  return pts.map(([x, y], i) => {
    const s = Math.sin((Math.PI * i) / steps) * bow;
    return [x + nx * s, Math.max(-85, Math.min(85, y + ny * s))];
  });
}
