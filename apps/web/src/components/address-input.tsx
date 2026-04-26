import { useEffect, useRef, useState } from "react";
import type { PhotonFeature, TtcNearbyStop, TtcStop } from "../lib/api";

// ─── Public types ──────────────────────────────────────────────────────────────

/** A fully-resolved journey endpoint — either a direct TTC stop or a geocoded address. */
export type SelectedEndpoint =
  | { kind: "stop"; stop: TtcStop }
  | { kind: "address"; place: PhotonFeature };

// ─── Recent stop cache ─────────────────────────────────────────────────────────

const RECENT_KEY = "transitly.recent-stops-v1";
const MAX_RECENT = 8;

function getRecentStops(): TtcStop[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as TtcStop[];
  } catch {
    return [];
  }
}

export function saveRecentStop(stop: TtcStop): void {
  try {
    const existing = getRecentStops().filter((r) => r.stopId !== stop.stopId);
    localStorage.setItem(RECENT_KEY, JSON.stringify([stop, ...existing].slice(0, MAX_RECENT)));
  } catch {
    /* ignore */
  }
}

// ─── Stop type detection ───────────────────────────────────────────────────────

type StopTypeInfo = { label: string; color: string; bgColor: string; icon: string };

function getStopTypeInfo(stopName: string): StopTypeInfo {
  const n = stopName.toLowerCase();
  if (n.includes("station") && !n.includes("go station") && !n.includes("bus station") && !n.includes("bus bay")) {
    return { label: "Subway", color: "#0060A9", bgColor: "rgba(0,96,169,0.11)", icon: "bi-train-front-fill" };
  }
  const streetcarCorridors = ["king ", "king/", "queen ", "queen/", "dundas ", "college ", "carlton", "spadina", "harbourfront", "long branch", "gerrard"];
  if (streetcarCorridors.some((c) => n.includes(c))) {
    return { label: "Streetcar", color: "#e77049", bgColor: "rgba(231,112,73,0.11)", icon: "bi-tram-front-fill" };
  }
  return { label: "Bus", color: "#0f5b52", bgColor: "rgba(15,91,82,0.1)", icon: "bi-bus-front-fill" };
}

function formatAddress(place: PhotonFeature): string {
  const parts: string[] = [];
  if (place.housenumber) parts.push(place.housenumber);
  if (place.street) parts.push(place.street);
  return parts.join(" ") || place.name;
}

function placeTypeIcon(type: string): string {
  const map: Record<string, string> = {
    house: "bi-house-fill",
    street: "bi-signpost-2-fill",
    city: "bi-buildings",
    district: "bi-map-fill",
    station: "bi-train-front-fill",
    amenity: "bi-shop-window",
    park: "bi-tree-fill",
    university: "bi-mortarboard-fill",
  };
  return map[type] ?? "bi-geo-alt-fill";
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StopTypeBadge({ stopName, small = false }: { stopName: string; small?: boolean }) {
  const info = getStopTypeInfo(stopName);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: small ? "1px 5px" : "2px 7px",
        borderRadius: 999,
        fontSize: small ? "0.6rem" : "0.67rem",
        fontWeight: 700,
        background: info.bgColor,
        color: info.color,
        flexShrink: 0,
        letterSpacing: "0.01em",
        whiteSpace: "nowrap",
      }}
    >
      <i className={`bi ${info.icon}`} style={{ fontSize: small ? "0.58rem" : "0.62rem" }} aria-hidden="true" />
      {info.label}
    </span>
  );
}

function StopIcon({ stopName }: { stopName: string }) {
  const info = getStopTypeInfo(stopName);
  return (
    <span
      style={{
        width: 30, height: 30, borderRadius: "0.65rem",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: info.bgColor, color: info.color, fontSize: "0.8rem", flexShrink: 0,
      }}
    >
      <i className={`bi ${info.icon}`} aria-hidden="true" />
    </span>
  );
}

function AddressIcon({ type }: { type: string }) {
  return (
    <span
      style={{
        width: 30, height: 30, borderRadius: "0.65rem",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(16,34,51,0.07)", color: "rgba(16,34,51,0.5)", fontSize: "0.8rem", flexShrink: 0,
      }}
    >
      <i className={`bi ${placeTypeIcon(type)}`} aria-hidden="true" />
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "7px 14px 3px",
        fontSize: "0.59rem", fontWeight: 700, letterSpacing: "0.15em",
        textTransform: "uppercase", color: "rgba(16,34,51,0.35)",
        fontFamily: '"IBM Plex Mono", monospace',
      }}
    >
      {children}
    </div>
  );
}

const ROW_BASE: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10,
  padding: "7px 10px", margin: "1px 6px",
  borderRadius: "0.8rem", cursor: "pointer",
  width: "calc(100% - 12px)", boxSizing: "border-box",
  transition: "background 0.1s", border: "none", background: "transparent",
  textAlign: "left",
};

// ─── Props ─────────────────────────────────────────────────────────────────────

type JourneyEndpointInputProps = {
  id: string;
  label: string;
  placeholder: string;
  inputValue: string;
  selected: SelectedEndpoint | null;
  stopResults: TtcStop[];
  addressResults: PhotonFeature[];
  nearbyStops: TtcNearbyStop[];
  resolvedStop: TtcNearbyStop | null;
  isLoadingStops: boolean;
  isLoadingAddresses: boolean;
  onChange: (value: string) => void;
  onSelectStop: (stop: TtcStop) => void;
  onSelectAddress: (place: PhotonFeature) => void;
  onClear: () => void;
  locationShortcut?: { label: string; onUse: () => void } | null;
  accentColor?: string;
};

// ─── Main component ────────────────────────────────────────────────────────────

export function JourneyEndpointInput({
  id,
  label,
  placeholder,
  inputValue,
  selected,
  stopResults,
  addressResults,
  nearbyStops,
  resolvedStop,
  isLoadingStops,
  isLoadingAddresses,
  onChange,
  onSelectStop,
  onSelectAddress,
  onClear,
  locationShortcut,
  accentColor = "#0f5b52",
}: JourneyEndpointInputProps) {
  const [focused, setFocused] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [recentStops, setRecentStops] = useState<TtcStop[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const query = inputValue.trim();
  const isTyping = query.length >= 2;
  const isLoading = isTyping && (isLoadingStops || isLoadingAddresses);

  useEffect(() => {
    if (focused) setRecentStops(getRecentStops());
  }, [focused]);

  // ── Build flat item list for keyboard navigation ───────────────────────────
  type Item =
    | { kind: "location" }
    | { kind: "recent"; stop: TtcStop }
    | { kind: "nearby"; stop: TtcNearbyStop }
    | { kind: "stop"; stop: TtcStop }
    | { kind: "address"; place: PhotonFeature };

  const items: Item[] = [];
  if (!isTyping) {
    if (locationShortcut) items.push({ kind: "location" });
    for (const s of recentStops.slice(0, 4)) items.push({ kind: "recent", stop: s });
    for (const s of nearbyStops.slice(0, 3)) items.push({ kind: "nearby", stop: s });
  } else {
    for (const s of stopResults.slice(0, 6)) items.push({ kind: "stop", stop: s });
    for (const p of addressResults.slice(0, 3)) items.push({ kind: "address", place: p });
  }

  const hasContent =
    isTyping
      ? stopResults.length > 0 || addressResults.length > 0 || isLoading
      : locationShortcut != null || recentStops.length > 0 || nearbyStops.length > 0;

  const showDropdown = focused && !selected && hasContent;

  function handleBlur(e: React.FocusEvent) {
    if (wrapperRef.current?.contains(e.relatedTarget as Node)) return;
    setFocused(false);
    setActiveIdx(-1);
  }

  function selectStop(stop: TtcStop) {
    saveRecentStop(stop);
    setRecentStops(getRecentStops());
    onSelectStop(stop);
    setFocused(false);
    setActiveIdx(-1);
  }

  function activateItem(item: Item) {
    if (item.kind === "location") {
      locationShortcut?.onUse();
      setFocused(false);
    } else if (item.kind === "recent" || item.kind === "nearby") {
      selectStop(item.stop as TtcStop);
    } else if (item.kind === "stop") {
      selectStop(item.stop);
    } else {
      onSelectAddress(item.place);
      setFocused(false);
      setActiveIdx(-1);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = activeIdx >= 0 ? items[activeIdx] : items[0];
      if (item) activateItem(item);
    } else if (e.key === "Escape") {
      setFocused(false);
      setActiveIdx(-1);
      inputRef.current?.blur();
    }
  }

  // ── Confirmed selected state ───────────────────────────────────────────────
  if (selected && !focused) {
    const isStop = selected.kind === "stop";
    const displayName = isStop ? selected.stop.stopName : formatAddress(selected.place);
    const sub = !isStop && resolvedStop ? resolvedStop.stopName : null;
    const typeInfo = isStop ? getStopTypeInfo(selected.stop.stopName) : null;

    return (
      <div
        style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "10px 12px", borderRadius: "1rem",
          border: `1.5px solid ${accentColor}28`,
          background: `${accentColor}05`,
          cursor: "pointer",
        }}
        onClick={() => { onClear(); setTimeout(() => inputRef.current?.focus(), 30); }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { onClear(); setTimeout(() => inputRef.current?.focus(), 30); }
        }}
        aria-label={`${label}: ${displayName}. Click to change.`}
      >
        {/* Type icon */}
        <div style={{ paddingTop: 1, flexShrink: 0 }}>
          {isStop && typeInfo ? (
            <span style={{ display: "flex", width: 26, height: 26, borderRadius: "0.55rem", alignItems: "center", justifyContent: "center", background: typeInfo.bgColor, color: typeInfo.color, fontSize: "0.74rem" }}>
              <i className={`bi ${typeInfo.icon}`} aria-hidden="true" />
            </span>
          ) : (
            <span style={{ display: "flex", width: 26, height: 26, borderRadius: "0.55rem", alignItems: "center", justifyContent: "center", background: "rgba(16,34,51,0.07)", color: "rgba(16,34,51,0.5)", fontSize: "0.74rem" }}>
              <i className="bi bi-geo-alt-fill" aria-hidden="true" />
            </span>
          )}
        </div>

        {/* Labels */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: "0.86rem", color: "var(--signalto-ink)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "calc(100% - 80px)" }}>
              {displayName}
            </span>
            {isStop && <StopTypeBadge stopName={selected.stop.stopName} small />}
          </div>
          {sub && (
            <div style={{ fontSize: "0.72rem", color: "rgba(16,34,51,0.5)", marginTop: 2, display: "flex", alignItems: "center", gap: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <i className="bi bi-arrow-return-right" aria-hidden="true" style={{ fontSize: "0.6rem", flexShrink: 0 }} />
              Boards at {sub}
            </div>
          )}
        </div>

        {/* Change button */}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { e.stopPropagation(); onClear(); setTimeout(() => inputRef.current?.focus(), 30); }}
          style={{ all: "unset", fontSize: "0.7rem", fontWeight: 600, color: accentColor, flexShrink: 0, padding: "3px 8px", borderRadius: "0.5rem", background: `${accentColor}12`, cursor: "pointer", alignSelf: "center" }}
        >
          Change
        </button>
      </div>
    );
  }

  // ── Input + dropdown ───────────────────────────────────────────────────────
  return (
    <div ref={wrapperRef} style={{ position: "relative" }} onBlur={handleBlur}>
      <label htmlFor={id} className="signalto-list-label mb-1 d-block">
        {label}
      </label>

      <div style={{ position: "relative" }}>
        <span
          style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: focused ? accentColor : "rgba(16,34,51,0.3)", fontSize: "0.88rem", pointerEvents: "none", transition: "color 0.15s" }}
          aria-hidden="true"
        >
          <i className="bi bi-search" />
        </span>

        <input
          ref={inputRef}
          id={id}
          type="text"
          value={inputValue}
          onChange={(e) => { onChange(e.target.value); setActiveIdx(-1); }}
          onFocus={() => setFocused(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className="form-control signalto-input"
          style={{
            paddingLeft: 36,
            paddingRight: isTyping ? 36 : 12,
            borderColor: focused ? `${accentColor}50` : undefined,
            boxShadow: focused ? `0 0 0 3px ${accentColor}15` : undefined,
            transition: "border-color 0.15s, box-shadow 0.15s",
          }}
        />

        {isTyping && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { onChange(""); setActiveIdx(-1); inputRef.current?.focus(); }}
            style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", all: "unset", cursor: "pointer", color: "rgba(16,34,51,0.3)", fontSize: "0.9rem", lineHeight: 1, padding: 4, display: "flex", alignItems: "center" }}
            aria-label="Clear text"
          >
            <i className="bi bi-x-circle-fill" />
          </button>
        )}
      </div>

      {/* ── Dropdown ──────────────────────────────────────────────────────── */}
      {showDropdown && (
        <div
          className="animate-in"
          style={{
            position: "absolute", top: "calc(100% + 5px)", left: 0, right: 0, zIndex: 1200,
            borderRadius: "1.2rem", border: "1px solid rgba(16,34,51,0.09)",
            background: "rgba(255,255,255,0.98)",
            boxShadow: "0 24px 64px rgba(16,34,51,0.16)",
            overflow: "hidden", backdropFilter: "blur(16px)",
          }}
        >
          {/* Loading */}
          {isLoading && (
            <div style={{ padding: "12px 16px", fontSize: "0.8rem", color: "rgba(16,34,51,0.45)", display: "flex", alignItems: "center", gap: 8 }}>
              <i className="bi bi-arrow-repeat transitly-spin" aria-hidden="true" />
              Searching stops &amp; addresses…
            </div>
          )}

          {/* Empty state */}
          {!isTyping && !isLoading && (
            <div style={{ paddingBottom: 6 }}>
              {locationShortcut && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { locationShortcut.onUse(); setFocused(false); }}
                  style={{ ...ROW_BASE, background: activeIdx === 0 ? "rgba(15,91,82,0.07)" : "transparent", margin: "8px 6px 4px" }}
                >
                  <span style={{ width: 30, height: 30, borderRadius: "0.65rem", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,91,82,0.12)", color: "#0f5b52", fontSize: "0.8rem", flexShrink: 0 }}>
                    <i className="bi bi-crosshairs" aria-hidden="true" />
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.84rem", color: "#0f5b52" }}>{locationShortcut.label}</div>
                    <div style={{ fontSize: "0.71rem", color: "rgba(16,34,51,0.44)" }}>Use GPS position</div>
                  </div>
                </button>
              )}

              {recentStops.length > 0 && (
                <>
                  <SectionLabel>Recent</SectionLabel>
                  {recentStops.slice(0, 4).map((stop, i) => {
                    const rowIdx = (locationShortcut ? 1 : 0) + i;
                    return (
                      <button
                        key={stop.stopId}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectStop(stop)}
                        style={{ ...ROW_BASE, background: activeIdx === rowIdx ? `${accentColor}09` : "transparent" }}
                      >
                        <StopIcon stopName={stop.stopName} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: "0.84rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stop.stopName}</div>
                          <div style={{ fontSize: "0.7rem", color: "rgba(16,34,51,0.44)" }}>{getStopTypeInfo(stop.stopName).label}{stop.stopCode ? ` · #${stop.stopCode}` : ""}</div>
                        </div>
                        <i className="bi bi-clock-history" style={{ color: "rgba(16,34,51,0.2)", fontSize: "0.72rem", flexShrink: 0 }} aria-hidden="true" />
                      </button>
                    );
                  })}
                </>
              )}

              {nearbyStops.length > 0 && (
                <>
                  <SectionLabel>Nearby stops</SectionLabel>
                  {nearbyStops.slice(0, 3).map((stop, i) => {
                    const rowIdx = (locationShortcut ? 1 : 0) + Math.min(recentStops.length, 4) + i;
                    return (
                      <button
                        key={stop.stopId}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectStop(stop)}
                        style={{ ...ROW_BASE, background: activeIdx === rowIdx ? `${accentColor}09` : "transparent" }}
                      >
                        <StopIcon stopName={stop.stopName} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: "0.84rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stop.stopName}</div>
                          <div style={{ fontSize: "0.7rem", color: "rgba(16,34,51,0.44)" }}>{stop.distanceMeters} m · {getStopTypeInfo(stop.stopName).label}</div>
                        </div>
                      </button>
                    );
                  })}
                </>
              )}

              <div style={{ padding: "8px 16px 10px", fontSize: "0.69rem", color: "rgba(16,34,51,0.32)", borderTop: "1px solid rgba(16,34,51,0.05)", marginTop: 4 }}>
                Type a stop name, intersection, or address
              </div>
            </div>
          )}

          {/* Search results */}
          {isTyping && !isLoading && (
            <div style={{ paddingBottom: 6 }}>
              {stopResults.length > 0 && (
                <>
                  <SectionLabel>TTC stops</SectionLabel>
                  {stopResults.slice(0, 6).map((stop, i) => (
                    <button
                      key={stop.stopId}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectStop(stop)}
                      style={{ ...ROW_BASE, background: activeIdx === i ? `${accentColor}09` : "transparent" }}
                    >
                      <StopIcon stopName={stop.stopName} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stop.stopName}</div>
                        <div style={{ fontSize: "0.71rem", color: "rgba(16,34,51,0.44)" }}>{getStopTypeInfo(stop.stopName).label}{stop.stopCode ? ` · Stop #${stop.stopCode}` : ""}</div>
                      </div>
                      <StopTypeBadge stopName={stop.stopName} small />
                    </button>
                  ))}
                </>
              )}

              {addressResults.length > 0 && (
                <>
                  <SectionLabel>Addresses &amp; Landmarks</SectionLabel>
                  {addressResults.slice(0, 3).map((place, i) => {
                    const rowIdx = stopResults.length + i;
                    return (
                      <button
                        key={i}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { onSelectAddress(place); setFocused(false); setActiveIdx(-1); }}
                        style={{ ...ROW_BASE, background: activeIdx === rowIdx ? "rgba(16,34,51,0.05)" : "transparent" }}
                      >
                        <AddressIcon type={place.type} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{formatAddress(place)}</div>
                          <div style={{ fontSize: "0.71rem", color: "rgba(16,34,51,0.44)" }}>{[place.city, place.state].filter(Boolean).join(", ")}</div>
                        </div>
                        <span style={{ fontSize: "0.67rem", color: "rgba(16,34,51,0.3)", flexShrink: 0, padding: "1px 5px", borderRadius: 999, background: "rgba(16,34,51,0.05)" }}>
                          Address
                        </span>
                      </button>
                    );
                  })}
                </>
              )}

              {stopResults.length === 0 && addressResults.length === 0 && (
                <div style={{ padding: "18px 16px", fontSize: "0.83rem", color: "rgba(16,34,51,0.45)", textAlign: "center" }}>
                  <i className="bi bi-search me-2" aria-hidden="true" />
                  No TTC stops or addresses found for "{query}"
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

