import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef, useState, useCallback, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type TtcStop, type TtcVehicle } from "../lib/api";

// Fix Leaflet default icon path broken by bundlers
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png"
});

// Constants
const STATUS_LABEL: Record<number, string> = { 0: "Arriving", 1: "Stopped", 2: "In transit" };

const ROUTE_COLORS: Record<string, string> = {
  subway: "#102233",
  streetcar: "#e77049",
  bus: "#0f5b52"
};
const DIM_COLOR = "#b8c4cc";
const ANIM_MS = 9_500;

const MAP_TILES = {
  light: {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    label: "Light"
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    label: "Dark"
  },
  street: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    label: "Street"
  }
} as const;

type MapStyle = keyof typeof MAP_TILES;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function lerpLatLng(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
  t: number
): [number, number] {
  const e = easeInOut(Math.min(1, t));
  return [fromLat + (toLat - fromLat) * e, fromLng + (toLng - fromLng) * e];
}

function vehicleColor(type: string): string {
  return ROUTE_COLORS[type] ?? ROUTE_COLORS.bus;
}

type IconOpts = { highlighted: boolean; dimmed: boolean; dark: boolean };

function makeVehicleIcon(v: TtcVehicle, { highlighted, dimmed, dark }: IconOpts): L.DivIcon {
  const color = dimmed ? DIM_COLOR : vehicleColor(v.routeTypeLabel);
  const bearing = v.bearing ?? 0;
  const size = highlighted ? 42 : dimmed ? 18 : 28;
  const r = Math.floor(size / 2) - 2;
  const cx = size / 2;
  const arrowTip = cx - r + 2;
  const arrowBase = cx - r + Math.round(size * 0.34);
  const arrowHalf = highlighted ? 5 : 3;
  const stroke = dark ? "#1c2d3f" : "white";
  const strokeW = highlighted ? 3 : dimmed ? 1.5 : 2;

  const pulse = highlighted
    ? `<div style="position:absolute;inset:${-(r + 7)}px;border-radius:50%;border:2px solid ${color};opacity:0;animation:stk-pulse 2s ease-out infinite;pointer-events:none"></div><div style="position:absolute;inset:${-(r + 14)}px;border-radius:50%;border:1.5px solid ${color};opacity:0;animation:stk-pulse 2s ease-out 0.7s infinite;pointer-events:none"></div>`
    : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${cx}" cy="${cx}" r="${r}" fill="${color}" stroke="${stroke}" stroke-width="${strokeW}"/><polygon points="${cx},${arrowTip} ${cx - arrowHalf},${arrowBase} ${cx + arrowHalf},${arrowBase}" fill="white" opacity="${dimmed ? 0.4 : 0.95}" transform="rotate(${bearing},${cx},${cx})"/></svg>`;

  return L.divIcon({
    html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px">${pulse}${svg}</div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 5)]
  });
}

function makePopupHtml(
  v: TtcVehicle,
  highlighted: boolean,
  speedKmh: number | null,
  followed: boolean
): string {
  const typeIcon = v.routeTypeLabel === "subway" ? "🚇" : v.routeTypeLabel === "streetcar" ? "🚃" : "🚌";
  const statusLabel = v.currentStatus !== null ? STATUS_LABEL[v.currentStatus] : null;
  const statusColor = v.currentStatus === 1 ? "#e77049" : v.currentStatus === 2 ? "#0f5b52" : "#888";
  const speedStr =
    speedKmh !== null && speedKmh > 0.5
      ? `<div style="font-size:0.75rem;color:#888;margin-top:3px">⚡ ${speedKmh.toFixed(1)} km/h</div>`
      : "";
  const tripBadge = highlighted
    ? `<div style="font-size:0.69rem;font-weight:700;margin-bottom:5px"><span style="background:#0f5b52;color:#fff;padding:1px 6px;border-radius:99px;letter-spacing:0.07em">★ YOUR TRIP</span></div>`
    : "";
  const followId = v.vehicleId ?? v.tripId ?? "";
  const followBtn = `<button data-follow-id="${followId}" style="margin-top:10px;font-size:0.72rem;padding:4px 14px;border-radius:99px;border:none;background:${followed ? "#e77049" : "#0f5b52"};color:#fff;cursor:pointer;font-weight:600;display:block;width:100%">${followed ? "⏹ Unfollow" : "📍 Follow vehicle"}</button>`;
  return `<div style="font-family:inherit;min-width:160px;line-height:1.4">${tripBadge}<div style="font-weight:700;font-size:1rem">${typeIcon} Route ${v.routeShortName ?? v.routeId ?? "—"}</div><div style="font-size:0.8rem;color:#666;margin-top:3px">Vehicle ${v.label ?? v.vehicleId ?? "—"}</div>${statusLabel ? `<div style="font-size:0.78rem;font-weight:600;color:${statusColor};margin-top:4px">${statusLabel}</div>` : ""}${speedStr}${v.bearing !== null ? `<div style="font-size:0.73rem;color:#aaa;margin-top:2px">Bearing ${Math.round(v.bearing)}°</div>` : ""}${followBtn}</div>`;
}

function makeStopPin(label: string, color: string): L.DivIcon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="38" viewBox="0 0 30 38"><ellipse cx="15" cy="36" rx="5" ry="2.5" fill="rgba(0,0,0,0.18)"/><path d="M15 2 C8.4 2 3 7.4 3 14 C3 23 15 36 15 36 C15 36 27 23 27 14 C27 7.4 21.6 2 15 2Z" fill="${color}" stroke="white" stroke-width="2.2"/><circle cx="15" cy="14" r="5.5" fill="white" opacity="0.95"/></svg>`;
  return L.divIcon({
    html: `<div style="position:relative;display:inline-block">${svg}<div style="position:absolute;top:-24px;left:50%;transform:translateX(-50%);background:${color};color:#fff;font-size:0.64rem;font-weight:800;white-space:nowrap;padding:2px 8px;border-radius:99px;box-shadow:0 2px 8px rgba(0,0,0,0.22);letter-spacing:0.06em">${label}</div></div>`,
    className: "",
    iconSize: [30, 38],
    iconAnchor: [15, 36],
    popupAnchor: [0, -40]
  });
}

type PosRecord = { lat: number; lng: number; ts: number };
type AnimRecord = { fromLat: number; fromLng: number; toLat: number; toLng: number; startTs: number };

type LiveVehicleMapProps = {
  focusRouteIds?: Set<string>;
  focusTripIds?: Set<string>;
  originStop?: TtcStop | null;
  destinationStop?: TtcStop | null;
};

export function LiveVehicleMap({
  focusRouteIds,
  focusTripIds,
  originStop,
  destinationStop
}: LiveVehicleMapProps = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const markersRef = useRef(new Map<string, L.Marker>());
  const trailsRef = useRef(new Map<string, L.Polyline[]>());
  const stopPinsRef = useRef<{ origin: L.Marker | null; dest: L.Marker | null }>({ origin: null, dest: null });
  const historyRef = useRef(new Map<string, PosRecord[]>());
  const animRef = useRef(new Map<string, AnimRecord>());
  const speedRef = useRef(new Map<string, number>());
  const rafRef = useRef<number | null>(null);
  const prevFocusKey = useRef("");
  const lastDataUpdatedAt = useRef(0);
  const lastFetchTsRef = useRef(0);

  const [followedId, setFollowedId] = useState<string | null>(null);
  const [mapStyle, setMapStyle] = useState<MapStyle>("light");
  const [showRouteOnly, setShowRouteOnly] = useState(false);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const hasFocus = (focusRouteIds?.size ?? 0) > 0 || (focusTripIds?.size ?? 0) > 0;

  const query = useQuery({
    queryKey: ["ttc-vehicle-positions"],
    queryFn: api.getTtcVehiclePositions,
    refetchInterval: 10_000,
    staleTime: 5_000
  });

  // Live "updated Xs ago" ticker
  useEffect(() => {
    const id = setInterval(() => {
      if (lastFetchTsRef.current > 0) {
        setSecondsAgo(Math.round((Date.now() - lastFetchTsRef.current) / 1000));
      }
    }, 1_000);
    return () => clearInterval(id);
  }, []);

  // Fullscreen listener
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Map initialisation (once)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { center: [43.6532, -79.3832], zoom: 13, zoomControl: true });
    mapRef.current = map;

    map.on("popupopen", (evt) => {
      const btn = (evt.popup as L.Popup).getElement()?.querySelector<HTMLButtonElement>("[data-follow-id]");
      if (btn) {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-follow-id") ?? "";
          setFollowedId((prev) => (prev === id ? null : id));
          map.closePopup();
        });
      }
    });

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      map.remove();
      mapRef.current = null;
      tileRef.current = null;
      markersRef.current.clear();
      trailsRef.current.clear();
      historyRef.current.clear();
      animRef.current.clear();
      speedRef.current.clear();
      stopPinsRef.current = { origin: null, dest: null };
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Tile layer swap
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileRef.current) map.removeLayer(tileRef.current);
    const cfg = MAP_TILES[mapStyle];
    tileRef.current = L.tileLayer(cfg.url, { attribution: cfg.attribution, maxZoom: 19 }).addTo(map);
    tileRef.current.bringToBack();
  }, [mapStyle]);

  // Vehicle markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !query.data) return;

    const isNewData = query.dataUpdatedAt !== lastDataUpdatedAt.current;
    if (isNewData) {
      lastDataUpdatedAt.current = query.dataUpdatedAt;
      lastFetchTsRef.current = Date.now();
      setSecondsAgo(0);
    }

    const vehicles = query.data.vehicles;
    const now = Date.now();
    const seenIds = new Set<string>();
    const focusedLatLngs: L.LatLng[] = [];

    for (const v of vehicles) {
      const id = v.vehicleId ?? v.tripId ?? `${v.latitude}:${v.longitude}`;
      seenIds.add(id);

      const matchesRoute = focusRouteIds?.has(v.routeId ?? "") ?? false;
      const matchesTrip = focusTripIds?.has(v.tripId ?? "") ?? false;
      const highlighted = hasFocus && (matchesRoute || matchesTrip);
      const dimmed = hasFocus && !highlighted;

      if (showRouteOnly && dimmed) {
        const m = markersRef.current.get(id);
        if (m) { m.remove(); markersRef.current.delete(id); }
        const t = trailsRef.current.get(id);
        if (t) { t.forEach((l) => l.remove()); trailsRef.current.delete(id); }
        continue;
      }

      if (highlighted) focusedLatLngs.push(L.latLng(v.latitude, v.longitude));

      const history = historyRef.current.get(id) ?? [];
      const lastPos = history[history.length - 1];
      let speedKmh: number | null = speedRef.current.get(id) ?? null;

      if (isNewData) {
        if (lastPos) {
          const dtSec = (now - lastPos.ts) / 1000;
          const movedKm = haversineKm(lastPos.lat, lastPos.lng, v.latitude, v.longitude);
          if (movedKm > 0.005 && dtSec > 1) {
            speedKmh = (movedKm / dtSec) * 3600;
            speedRef.current.set(id, speedKmh);
            animRef.current.set(id, {
              fromLat: lastPos.lat, fromLng: lastPos.lng,
              toLat: v.latitude, toLng: v.longitude,
              startTs: now
            });
          }
        }
        historyRef.current.set(id, [...history, { lat: v.latitude, lng: v.longitude, ts: now }].slice(-10));
      }

      // Breadcrumb trail for highlighted vehicles
      if (highlighted) {
        const fullHistory = historyRef.current.get(id) ?? [];
        const oldTrails = trailsRef.current.get(id) ?? [];
        oldTrails.forEach((l) => l.remove());
        const newTrails: L.Polyline[] = [];
        for (let i = 1; i < fullHistory.length; i++) {
          const pct = i / fullHistory.length;
          newTrails.push(
            L.polyline(
              [[fullHistory[i - 1].lat, fullHistory[i - 1].lng], [fullHistory[i].lat, fullHistory[i].lng]],
              { color: vehicleColor(v.routeTypeLabel), weight: 1.5 + pct * 3, opacity: 0.1 + pct * 0.55 }
            ).addTo(map)
          );
        }
        trailsRef.current.set(id, newTrails);
      } else {
        const t = trailsRef.current.get(id);
        if (t) { t.forEach((l) => l.remove()); trailsRef.current.delete(id); }
      }

      const iconOpts: IconOpts = { highlighted, dimmed, dark: mapStyle === "dark" };
      const icon = makeVehicleIcon(v, iconOpts);
      const popup = makePopupHtml(v, highlighted, speedKmh, followedId === id);
      const zIndex = highlighted ? 1000 : dimmed ? -100 : 0;

      const existing = markersRef.current.get(id);
      if (existing) {
        if (isNewData) {
          const anim = animRef.current.get(id);
          existing.setLatLng(anim ? [anim.fromLat, anim.fromLng] : [v.latitude, v.longitude]);
        }
        existing.setIcon(icon);
        existing.setPopupContent(popup);
        existing.setZIndexOffset(zIndex);
      } else {
        const anim = animRef.current.get(id);
        const marker = L.marker([anim?.fromLat ?? v.latitude, anim?.fromLng ?? v.longitude], { icon, zIndexOffset: zIndex })
          .bindPopup(popup)
          .addTo(map);
        markersRef.current.set(id, marker);
      }
    }

    // Remove stale markers
    for (const [id, marker] of markersRef.current) {
      if (!seenIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
        const t = trailsRef.current.get(id);
        if (t) { t.forEach((l) => l.remove()); trailsRef.current.delete(id); }
        animRef.current.delete(id);
        historyRef.current.delete(id);
        speedRef.current.delete(id);
      }
    }

    // Auto-fit on focus change
    const focusKey = [...(focusRouteIds ?? []), ...(focusTripIds ?? [])].sort().join(",");
    if (focusKey !== prevFocusKey.current) {
      prevFocusKey.current = focusKey;
      const pts = [...focusedLatLngs];
      if (originStop) pts.push(L.latLng(originStop.latitude, originStop.longitude));
      if (destinationStop) pts.push(L.latLng(destinationStop.latitude, destinationStop.longitude));
      if (pts.length > 0) {
        map.fitBounds(L.latLngBounds(pts), { padding: [72, 72], maxZoom: 14 });
      } else if (!hasFocus) {
        map.setView([43.6532, -79.3832], 13);
      }
    }
  }, [query.data, query.dataUpdatedAt, focusRouteIds, focusTripIds, hasFocus, originStop, destinationStop, showRouteOnly, mapStyle, followedId]);

  // Animation loop (RAF)
  useEffect(() => {
    function tick() {
      const map = mapRef.current;
      if (!map) return;
      const now = Date.now();
      for (const [id, anim] of animRef.current) {
        const marker = markersRef.current.get(id);
        if (!marker) { animRef.current.delete(id); continue; }
        const t = (now - anim.startTs) / ANIM_MS;
        if (t >= 1) {
          marker.setLatLng([anim.toLat, anim.toLng]);
          animRef.current.delete(id);
        } else {
          const [lat, lng] = lerpLatLng(anim.fromLat, anim.fromLng, anim.toLat, anim.toLng, t);
          marker.setLatLng([lat, lng]);
          if (followedId === id) {
            map.panTo([lat, lng], { animate: true, duration: 0.25, easeLinearity: 1 });
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [followedId]);

  // Stop pins
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (originStop) {
      const ll: L.LatLngTuple = [originStop.latitude, originStop.longitude];
      const icon = makeStopPin("FROM", "#0f5b52");
      if (stopPinsRef.current.origin) {
        stopPinsRef.current.origin.setLatLng(ll).setIcon(icon);
      } else {
        stopPinsRef.current.origin = L.marker(ll, { icon, zIndexOffset: 3000 })
          .bindPopup(`<div style="font-family:inherit"><b style="color:#0f5b52">FROM</b><div style="margin-top:4px">${originStop.stopName}</div>${originStop.stopCode ? `<div style="font-size:0.78rem;color:#888;margin-top:2px">Stop ${originStop.stopCode}</div>` : ""}</div>`)
          .addTo(map);
      }
    } else if (stopPinsRef.current.origin) {
      stopPinsRef.current.origin.remove();
      stopPinsRef.current.origin = null;
    }

    if (destinationStop) {
      const ll: L.LatLngTuple = [destinationStop.latitude, destinationStop.longitude];
      const icon = makeStopPin("TO", "#e77049");
      if (stopPinsRef.current.dest) {
        stopPinsRef.current.dest.setLatLng(ll).setIcon(icon);
      } else {
        stopPinsRef.current.dest = L.marker(ll, { icon, zIndexOffset: 3000 })
          .bindPopup(`<div style="font-family:inherit"><b style="color:#e77049">TO</b><div style="margin-top:4px">${destinationStop.stopName}</div>${destinationStop.stopCode ? `<div style="font-size:0.78rem;color:#888;margin-top:2px">Stop ${destinationStop.stopCode}</div>` : ""}</div>`)
          .addTo(map);
      }
    } else if (stopPinsRef.current.dest) {
      stopPinsRef.current.dest.remove();
      stopPinsRef.current.dest = null;
    }
  }, [originStop, destinationStop]);

  // Derived stats
  const focusedCount = hasFocus && query.data
    ? query.data.vehicles.filter((v) => (focusRouteIds?.has(v.routeId ?? "") ?? false) || (focusTripIds?.has(v.tripId ?? "") ?? false)).length
    : null;
  const stoppedCount = query.data?.vehicles.filter((v) => v.currentStatus === 1).length ?? null;
  const inTransitCount = query.data?.vehicles.filter((v) => v.currentStatus === 2).length ?? null;

  const isDark = mapStyle === "dark";
  const subtle = isDark ? "#5a7a99" : "#999";

  const chip = (active: boolean, activeColor = "#0f5b52"): CSSProperties => ({
    fontSize: "0.7rem",
    padding: "2px 10px",
    borderRadius: "99px",
    border: `1.5px solid ${active ? activeColor : "transparent"}`,
    background: active ? activeColor : isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)",
    color: active ? "#fff" : isDark ? "#9aafc0" : "#666",
    cursor: "pointer",
    fontWeight: active ? 700 : 400,
    transition: "all 0.15s",
    lineHeight: "1.6"
  });

  const toggleFullscreen = useCallback(() => {
    const el = (containerRef.current?.closest(".signalto-panel") as HTMLElement | null) ?? containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  }, []);

  return (
    <div className="d-flex flex-column gap-2">
      {/* Control bar */}
      <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap px-1">
        <div className="d-flex gap-3" style={{ fontSize: "0.77rem", color: isDark ? "#c8d6e0" : "inherit" }}>
          {(["bus", "streetcar", "subway"] as const).map((t) => (
            <span key={t}>
              <span style={{ color: ROUTE_COLORS[t], fontWeight: 800 }}>●</span>{" "}
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </span>
          ))}
        </div>

        <div className="d-flex align-items-center gap-1 flex-wrap">
          {(Object.keys(MAP_TILES) as MapStyle[]).map((style) => (
            <button key={style} onClick={() => setMapStyle(style)} style={chip(mapStyle === style)}>
              {MAP_TILES[style].label}
            </button>
          ))}

          {hasFocus && (
            <button onClick={() => setShowRouteOnly((v) => !v)} style={chip(showRouteOnly, "#e77049")}>
              Route only
            </button>
          )}

          {followedId && (
            <button onClick={() => setFollowedId(null)} style={chip(true, "#e77049")}>
              📍 Following · stop
            </button>
          )}

          <button onClick={toggleFullscreen} title="Toggle fullscreen" style={{ ...chip(isFullscreen), padding: "2px 8px", fontSize: "0.82rem" }}>
            {isFullscreen ? "✕" : "⛶"}
          </button>
        </div>
      </div>

      {/* Map */}
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "520px",
          borderRadius: "1rem",
          overflow: "hidden",
          border: isDark ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(16,34,51,0.09)",
          boxShadow: hasFocus ? "0 4px 28px rgba(15,91,82,0.14)" : "none",
          transition: "border-color 0.3s, box-shadow 0.4s"
        }}
      />

      {/* Stats bar */}
      <div className="d-flex align-items-center justify-content-between gap-2 px-1 flex-wrap" style={{ fontSize: "0.75rem" }}>
        <div className="d-flex align-items-center gap-3 flex-wrap">
          {hasFocus && focusedCount !== null && (
            <span className="signalto-pill teal" style={{ fontSize: "0.7rem" }}>
              <i className="bi bi-broadcast-pin me-1" aria-hidden="true" />
              {focusedCount} on your route
            </span>
          )}
          {stoppedCount !== null && (
            <span style={{ color: subtle }}>
              <span style={{ color: "#e77049", fontWeight: 800 }}>●</span> {stoppedCount} stopped
            </span>
          )}
          {inTransitCount !== null && (
            <span style={{ color: subtle }}>
              <span style={{ color: "#0f5b52", fontWeight: 800 }}>●</span> {inTransitCount} moving
            </span>
          )}
        </div>
        <span style={{ color: subtle, fontVariantNumeric: "tabular-nums" }}>
          {query.data
            ? `${query.data.totalVehicles} vehicles · ${secondsAgo < 3 ? "just now" : `${secondsAgo}s ago`}`
            : query.isLoading ? "Loading…" : query.isError ? "Error" : ""}
        </span>
      </div>

      {query.isError && (
        <div className="alert alert-danger rounded-4 border-0 mb-0 small">
          Unable to load vehicle positions. Is the API running?
        </div>
      )}
    </div>
  );
}
