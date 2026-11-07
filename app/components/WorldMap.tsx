"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "mapbox-gl/dist/mapbox-gl.css";
import type { ExpressionSpecification, Map as MapboxMap, Marker, Popup } from "mapbox-gl";
import type { LiveLink, PeerDot } from "@/lib/types";
import { displayName, sharedTags } from "@/lib/profile";
import MapLegend from "./MapLegend";
import PeopleList from "./PeopleList";
import PopularInterests from "./PopularInterests";
import RadiusFilter, { formatKm } from "./RadiusFilter";
import { arcPath, circleRing, distanceKm } from "@/lib/geo";
import { MERCATOR_MAX_LAT, SKY_EMOJI, SKY_LABEL, paintNight, skyPhase } from "@/lib/sun";
import TagList from "./TagList";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "pk.eyJ1IjoicHVsc2UtbWFwIiwiYSI6ImNrMDBkZW1vMDAwMDAwMDAifQ.AAAAAAAAAAAAAAAAAAAAAA";

// Live-connection arc colours: a dim emerald trail with a bright pulse
// travelling along it.
const ARC_BASE = "rgba(52, 211, 153, 0.35)";
const ARC_HEAD = "rgba(209, 250, 229, 1)";
const ARC_STATIC = [
  "interpolate",
  ["linear"],
  ["line-progress"],
  0,
  "rgba(52, 211, 153, 0.5)",
  0.5,
  "rgba(110, 231, 183, 0.95)",
  1,
  "rgba(52, 211, 153, 0.5)",
];

export default function WorldMap({
  peers,
  links,
  me,
  myTags,
  onPeerClick,
  canConnect,
}: {
  peers: PeerDot[];
  // Pairs currently talking, drawn as arcs between their dots.
  links: LiveLink[];
  me: { lat: number; lng: number } | null;
  myTags: string[];
  onPeerClick: (id: string) => void;
  canConnect: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const meMarkerRef = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);

  // Tapping a dot opens a profile card (name + interests) anchored to it; the
  // connection request is sent from the card. The card is React content
  // portalled into a Mapbox Popup, so user-supplied text is never set as HTML.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Interests selected in PopularInterests: narrow the PeopleList (match any)
  // and hide non-matching dots on the map.
  const [interestFilters, setInterestFilters] = useState<string[]>([]);
  const toggleInterest = (tag: string) =>
    setInterestFilters((cur) =>
      cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag],
    );
  // Distance filter (km from you); null = any distance.
  const [radiusKm, setRadiusKm] = useState<number | null>(null);

  // Single source of truth for both filters, shared by the map dots, the
  // people list and the interest counts. Distance is measured from your real
  // position to their (1–3 km offset) dot, so edges are fuzzy by a few km.
  const inRange =
    radiusKm !== null && me
      ? peers.filter((p) => distanceKm(me, p) <= radiusKm)
      : peers;
  const visible =
    interestFilters.length > 0
      ? inRange.filter((p) => sharedTags(p.tags, interestFilters).size > 0)
      : inRange;
  const visibleIds = new Set(visible.map((p) => p.id));
  const visibleKey = [...visibleIds].sort().join(",");
  const selectedIdRef = useRef<string | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const [popupNode] = useState<HTMLDivElement | null>(() =>
    typeof document === "undefined" ? null : document.createElement("div"),
  );
  useEffect(() => {
    selectedIdRef.current = selectedId;
  });

  // Initialise the map once.
  useEffect(() => {
    if (!TOKEN || !containerRef.current) return;
    let cancelled = false;
    const markers = markersRef.current;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !containerRef.current) return;
      mapboxgl.accessToken = TOKEN;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/dark-v11",
        // Open centered on the user if we know where they are, else world view.
        center: me ? [me.lng, me.lat] : [0, 20],
        zoom: me ? 4 : 1.4,
        attributionControl: true,
      });
      map.on("load", () => {
        if (!cancelled) setReady(true);
      });
      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      popupRef.current?.remove();
      popupRef.current = null;
      markers.forEach((m) => m.remove());
      markers.clear();
      meMarkerRef.current?.remove();
      meMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // `me` is only read for the initial center; we don't want to re-init on change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show / move the user's own "you are here" pin.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !me) return;
    let cancelled = false;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      if (!meMarkerRef.current) {
        const el = document.createElement("div");
        el.className = "pulse-me";
        el.title = "You are here";
        el.innerHTML = `<span class="pulse-me-label">Me</span>📍`;
        // anchor "bottom" → the pin's tip sits on the exact coordinate.
        meMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([me.lng, me.lat])
          .addTo(map);
      } else {
        meMarkerRef.current.setLngLat([me.lng, me.lat]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [me, ready]);

  // Reconcile markers whenever the peer list changes (or the map becomes ready).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      const markers = markersRef.current;
      const seen = new Set<string>();

      for (const peer of peers) {
        // Peers outside the distance / interest filters get no marker at
        // all (removed below, which also closes their card if it's open).
        if (!visibleIds.has(peer.id)) continue;
        seen.add(peer.id);
        let marker = markers.get(peer.id);
        if (!marker) {
          const el = document.createElement("button");
          el.className = "pulse-dot";
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            // Busy peers would just auto-decline, so there's nothing to open.
            if (el.classList.contains("pulse-dot--busy")) return;
            setSelectedId((cur) => (cur === peer.id ? null : peer.id));
          });
          marker = new mapboxgl.Marker({ element: el })
            .setLngLat([peer.lng, peer.lat])
            .addTo(map);
          markers.set(peer.id, marker);
        }
        const el = marker.getElement();
        el.classList.toggle("pulse-dot--busy", peer.busy);
        el.title = peer.busy
          ? `${displayName(peer.name)} — busy`
          : `${displayName(peer.name)} — tap to say hi`;
        el.setAttribute("aria-label", el.title);
        // Close the card if its peer just got busy.
        if (peer.busy && selectedIdRef.current === peer.id) setSelectedId(null);
      }

      // Drop markers for peers that went offline or are filtered out.
      for (const [id, marker] of markers) {
        if (!seen.has(id)) {
          marker.remove();
          markers.delete(id);
          if (selectedIdRef.current === id) setSelectedId(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // visibleKey captures the filter result; visibleIds is derived from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peers, ready, visibleKey]);

  // Draw the distance-filter circle around you (removed when "Any").
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const SOURCE = "radius-filter";
    if (radiusKm === null || !me) {
      if (map.getLayer(`${SOURCE}-fill`)) map.removeLayer(`${SOURCE}-fill`);
      if (map.getLayer(`${SOURCE}-line`)) map.removeLayer(`${SOURCE}-line`);
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
      return;
    }
    const data: GeoJSON.Feature<GeoJSON.Polygon> = {
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [circleRing(me, radiusKm)] },
    };
    const source = map.getSource(SOURCE);
    if (source && source.type === "geojson") {
      source.setData(data);
    } else {
      map.addSource(SOURCE, { type: "geojson", data });
      map.addLayer({
        id: `${SOURCE}-fill`,
        type: "fill",
        source: SOURCE,
        paint: { "fill-color": "#34d399", "fill-opacity": 0.06 },
      });
      map.addLayer({
        id: `${SOURCE}-line`,
        type: "line",
        source: SOURCE,
        paint: {
          "line-color": "#34d399",
          "line-opacity": 0.6,
          "line-width": 1.5,
          "line-dasharray": [2, 2],
        },
      });
    }
  }, [radiusKm, me, ready]);

  // Day/night: shade the night side of the planet, repainted every minute so
  // the terminator creeps across the map in real time. Drawn under the map's
  // labels so place names stay readable.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const SOURCE = "day-night";
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const corners: [[number, number], [number, number], [number, number], [number, number]] = [
      [-180, MERCATOR_MAX_LAT],
      [180, MERCATOR_MAX_LAT],
      [180, -MERCATOR_MAX_LAT],
      [-180, -MERCATOR_MAX_LAT],
    ];

    paintNight(canvas, new Date());
    if (!map.getSource(SOURCE)) {
      map.addSource(SOURCE, {
        type: "image",
        url: canvas.toDataURL(),
        coordinates: corners,
      });
      const firstLabel = map.getStyle()?.layers?.find((l) => l.type === "symbol")?.id;
      map.addLayer(
        {
          id: SOURCE,
          type: "raster",
          source: SOURCE,
          paint: { "raster-fade-duration": 0, "raster-opacity": 1 },
        },
        firstLabel,
      );
    }

    const timer = setInterval(() => {
      paintNight(canvas, new Date());
      const source = map.getSource(SOURCE);
      if (source?.type === "image") {
        source.updateImage({ url: canvas.toDataURL(), coordinates: corners });
      }
    }, 60_000);
    return () => clearInterval(timer);
  }, [ready]);

  // Live connection arcs between every pair currently talking.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const SOURCE = "live-arcs";
    const data: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
      type: "FeatureCollection",
      features: links.map((l) => ({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: arcPath(l.from, l.to) },
      })),
    };
    const source = map.getSource(SOURCE);
    if (source && source.type === "geojson") {
      source.setData(data);
      return;
    }
    // lineMetrics enables line-progress, which the travelling pulse needs.
    map.addSource(SOURCE, { type: "geojson", data, lineMetrics: true });
    map.addLayer({
      id: `${SOURCE}-glow`,
      type: "line",
      source: SOURCE,
      layout: { "line-cap": "round" },
      paint: {
        "line-color": "#34d399",
        "line-width": 7,
        "line-blur": 6,
        "line-opacity": 0.3,
      },
    });
    map.addLayer({
      id: SOURCE,
      type: "line",
      source: SOURCE,
      layout: { "line-cap": "round" },
      paint: {
        "line-width": 2,
        "line-gradient": ARC_STATIC as ExpressionSpecification,
      },
    });
  }, [links, ready]);

  // Animate a pulse along the arcs while any exist (static if the user prefers
  // reduced motion). Keyed on "any arcs?" so each poll doesn't restart it.
  const hasLinks = links.length > 0;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !hasLinks) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const LAYER = "live-arcs";
    const PERIOD_MS = 2600;
    let frame = 0;
    let last = 0;

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (now - last < 33 || !map.getLayer(LAYER)) return; // ~30 fps is plenty
      last = now;
      // Head runs 0 → 1.25 so the pulse fully leaves before the next one.
      const head = ((now % PERIOD_MS) / PERIOD_MS) * 1.25;
      map.setPaintProperty(
        LAYER,
        "line-gradient",
        pulseGradient(head) as ExpressionSpecification,
      );
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      if (map.getLayer(LAYER)) {
        map.setPaintProperty(
          LAYER,
          "line-gradient",
          ARC_STATIC as ExpressionSpecification,
        );
      }
    };
  }, [ready, hasLinks]);

  // Open / move / close the profile popup for the selected dot.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !popupNode) return;
    const marker = selectedId ? markersRef.current.get(selectedId) : undefined;
    if (!marker) {
      popupRef.current?.remove();
      popupRef.current = null;
      return;
    }
    let cancelled = false;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      if (!popupRef.current) {
        const popup = new mapboxgl.Popup({
          offset: 14,
          closeButton: false,
          maxWidth: "260px",
          className: "pulse-popup",
        }).setDOMContent(popupNode);
        // Fires on map click / programmatic remove → keep React state in sync.
        popup.on("close", () => {
          if (popupRef.current === popup) popupRef.current = null;
          setSelectedId(null);
        });
        popupRef.current = popup;
      }
      const popup = popupRef.current;
      popup.setLngLat(marker.getLngLat());
      // addTo() on an open popup removes it first (firing "close"), which
      // would clear the selection when switching dots — so only add if closed.
      if (!popup.isOpen()) popup.addTo(map);
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedId, ready, popupNode]);

  // Picked from the people list: fly to their dot, and open the card unless
  // they're busy (busy dots don't open a card when tapped either).
  function focusPeer(peer: PeerDot) {
    mapRef.current?.flyTo({
      center: [peer.lng, peer.lat],
      zoom: Math.max(mapRef.current.getZoom(), 6),
      essential: true,
    });
    if (!peer.busy) setSelectedId(peer.id);
  }

  const selected = peers.find((p) => p.id === selectedId) ?? null;
  const shared = selected ? sharedTags(selected.tags, myTags).size : 0;
  const selectedSky = selected ? skyPhase(selected.lat, selected.lng, new Date()) : null;

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full bg-zinc-900" />

      {!TOKEN && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <p className="max-w-md rounded-lg bg-zinc-800 p-4 text-sm text-zinc-200">
            Set{" "}
            <code className="text-emerald-400">NEXT_PUBLIC_MAPBOX_TOKEN</code> in{" "}
            <code>.env</code> to load the map.
          </p>
        </div>
      )}

      {popupNode &&
        selected &&
        createPortal(
          <div className="w-60 text-zinc-100">
            <div className="flex items-center gap-3">
              <div
                aria-hidden
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-300 to-teal-500 text-base font-bold text-zinc-950 ring-2 ring-emerald-400/30"
              >
                {selected.name ? selected.name.charAt(0).toUpperCase() : "?"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold leading-tight text-white">
                  {displayName(selected.name)}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Available to chat
                </p>
                {selectedSky && (
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {SKY_EMOJI[selectedSky]} {SKY_LABEL[selectedSky]}
                  </p>
                )}
              </div>
              <button
                onClick={() => popupRef.current?.remove()}
                aria-label="Close"
                className="flex h-7 w-7 shrink-0 items-center justify-center self-start rounded-full text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
              >
                <svg
                  viewBox="0 0 16 16"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>

            <div className="mt-3 border-t border-zinc-800 pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                {shared > 0
                  ? `Interests · ${shared} in common`
                  : "Interests"}
              </p>
              {selected.tags.length > 0 ? (
                <TagList tags={selected.tags} myTags={myTags} className="mt-2" />
              ) : (
                <p className="mt-1.5 text-xs italic text-zinc-500">
                  Nothing listed — say hi and find out.
                </p>
              )}
            </div>

            <button
              onClick={() => {
                onPeerClick(selected.id);
                popupRef.current?.remove();
              }}
              disabled={!canConnect}
              className="mt-4 w-full rounded-full bg-emerald-400 px-3 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-400"
            >
              {canConnect ? "Say hi 👋" : "End your current chat first"}
            </button>
          </div>,
          popupNode,
        )}

      <MapLegend
        available={peers.filter((p) => !p.busy).length}
        busy={peers.filter((p) => p.busy).length}
        live={links.length}
        canConnect={canConnect}
      />

      {/* Top-right panels: people on the far right, interests to its
          left (stacked under it on phones).
          The wrapper ignores pointer events so the map stays usable around
          the panels; bottom-16 keeps them clear of the attribution. */}
      <div className="pointer-events-none absolute bottom-16 right-4 top-4 z-10 flex flex-col items-end gap-2 sm:flex-row-reverse sm:items-start">
        <div className="pointer-events-auto flex max-h-full min-h-0 flex-col">
          <PeopleList
            peers={visible}
            myTags={myTags}
            selectedId={selectedId}
            onSelect={focusPeer}
            filters={interestFilters}
            onToggleFilter={toggleInterest}
            radiusLabel={radiusKm === null ? null : formatKm(radiusKm)}
            onClearRadius={() => setRadiusKm(null)}
          />
        </div>
        <div className="pointer-events-auto flex max-h-full min-h-0 flex-col">
          <PopularInterests
            peers={inRange}
            radiusLabel={radiusKm === null ? null : formatKm(radiusKm)}
            myTags={myTags}
            filters={interestFilters}
            onToggle={toggleInterest}
            onClear={() => setInterestFilters([])}
          />
        </div>
      </div>

      {/* Bottom-left: online count + distance filter (expands upward). */}
      <div className="absolute bottom-4 left-4 z-10 flex items-end gap-2">
        <div className="rounded-full bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-300 backdrop-blur">
          {peers.length} online
        </div>
        <RadiusFilter radiusKm={radiusKm} onChange={setRadiusKm} />
      </div>
    </div>
  );
}

// Line gradient for one frame of the travelling pulse: dim trail, a bright
// head at `head` (0–1 along the arc) with a short fading tail behind it.
// Stops must be strictly increasing within [0, 1], so clamp and drop repeats.
function pulseGradient(head: number): unknown[] {
  const stops: [number, string][] = [
    [0, ARC_BASE],
    [head - 0.22, ARC_BASE],
    [head, ARC_HEAD],
    [head + 0.03, ARC_BASE],
    [1, ARC_BASE],
  ];
  const expr: unknown[] = ["interpolate", ["linear"], ["line-progress"]];
  let prev = -1;
  for (const [at, color] of stops) {
    const t = Math.min(1, Math.max(0, at));
    if (t <= prev) continue;
    expr.push(t, color);
    prev = t;
  }
  return expr;
}
