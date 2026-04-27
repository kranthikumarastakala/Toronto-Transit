import { useEffect, useRef, useState } from "react";

function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebounced(value), delayMs);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [value, delayMs]);
  return debounced;
}
import { useQuery } from "@tanstack/react-query";
import {
  api,
  photonAutocomplete,
  type PhotonFeature,
  type TtcCommuteEvaluationResponse,
  type TtcCommuteOption,
  type TtcNearbyStop,
  type TtcStop,
  type TtcTransferCommuteOption
} from "../lib/api";
import { haversineMeters, walkMinutes, formatWalkLabel } from "../lib/geo-utils";
import { JourneyEndpointInput, type SelectedEndpoint, saveRecentStop } from "./address-input";
import { SectionHeader } from "./section-header";
import { formatTimestamp } from "../lib/format-utils";

// ─── Constants ─────────────────────────────────────────────────────────────────
const TTC_FARE_PRESTO = "$3.30";
const TTC_FARE_CASH = "$3.30";
const TTC_TRANSFER_NOTE = "Includes free 2-hr transfer";

// ─── Helpers ───────────────────────────────────────────────────────────────────
function routeColor(type: string) {
  if (type === "subway") return "#102233";
  if (type === "streetcar") return "#e77049";
  return "#0f5b52";
}

function routeIcon(type: string) {
  if (type === "subway") return "bi-train-front-fill";
  if (type === "streetcar") return "bi-tram-front-fill";
  return "bi-bus-front-fill";
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" });
}

function fmtDelay(secs: number | null): string {
  if (secs === null) return "";
  if (secs === 0) return " · on time";
  const m = Math.abs(Math.round(secs / 60));
  return ` · ${m} min ${secs > 0 ? "late" : "early"}`;
}

function titleCase(s: string) {
  return s
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
    .join(" ");
}

// ─── Journey option union ───────────────────────────────────────────────────
type AnyOption =
  | { kind: "direct"; opt: TtcCommuteOption; eval: TtcCommuteEvaluationResponse }
  | { kind: "transfer"; opt: TtcTransferCommuteOption; eval: TtcCommuteEvaluationResponse }
  | { kind: "scheduled"; opt: TtcCommuteOption; eval: TtcCommuteEvaluationResponse };

function optionDeparture(o: AnyOption): number {
  const t = o.kind === "transfer" ? o.opt.firstLeg.departureTime : o.opt.departureTime;
  return t ? Date.parse(t) : Number.MAX_SAFE_INTEGER;
}

function optionMinutesAway(o: AnyOption) {
  return o.kind === "transfer" ? o.opt.minutesUntilDeparture : o.opt.minutesUntilDeparture;
}

function optionTotalMins(o: AnyOption) {
  if (o.kind === "transfer") return o.opt.totalTravelMinutes;
  return o.opt.rideDurationMinutes;
}

// ─── Timeline sub-components ───────────────────────────────────────────────

function Leg({ children }: { children: React.ReactNode }) {
  return <div style={{ paddingLeft: 12 }}>{children}</div>;
}

function TrackLine({ color = "#ccc", dashed = false }: { color?: string; dashed?: boolean }) {
  return (
    <div
      style={{
        width: 3,
        minHeight: 28,
        marginLeft: 10,
        borderRadius: 2,
        background: dashed
          ? `repeating-linear-gradient(to bottom, ${color} 0, ${color} 5px, transparent 5px, transparent 10px)`
          : color
      }}
    />
  );
}

function StopDot({ color = "#0f5b52" }: { color?: string }) {
  return (
    <div
      style={{
        width: 13,
        height: 13,
        borderRadius: "50%",
        background: color,
        border: "2.5px solid white",
        boxShadow: `0 0 0 2px ${color}`,
        flexShrink: 0,
        marginTop: 3
      }}
    />
  );
}

function LocationPin({ color = "#0f5b52" }: { color?: string }) {
  return (
    <i
      className="bi bi-geo-alt-fill"
      style={{ color, fontSize: "1.1rem", flexShrink: 0, marginLeft: 1 }}
      aria-hidden="true"
    />
  );
}

// ─── Walk leg row ────────────────────────────────────────────────────────────
function WalkLeg({ meters }: { meters: number }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 24 }}>
        <TrackLine dashed color="#b0b8c1" />
      </div>
      <div
        style={{
          fontSize: "0.78rem",
          color: "#666",
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "2px 0"
        }}
      >
        <i className="bi bi-person-walking" aria-hidden="true" style={{ color: "#888" }} />
        <span>{formatWalkLabel(meters)}</span>
      </div>
    </div>
  );
}

// ─── Transit leg row ─────────────────────────────────────────────────────────
function TransitLeg({
  routeShortName,
  routeTypeLabel,
  headsign,
  rideMins
}: {
  routeShortName: string | null;
  routeTypeLabel: string;
  headsign: string | null;
  rideMins: number;
}) {
  const color = routeColor(routeTypeLabel);
  const icon = routeIcon(routeTypeLabel);
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 24 }}>
        <TrackLine color={color} />
      </div>
      <Leg>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
            padding: "4px 0",
            fontSize: "0.8rem"
          }}
        >
          <span
            style={{
              background: color,
              color: "#fff",
              padding: "2px 9px",
              borderRadius: 999,
              fontWeight: 700,
              fontSize: "0.75rem",
              display: "flex",
              alignItems: "center",
              gap: 4
            }}
          >
            <i className={`bi ${icon}`} aria-hidden="true" />
            {routeShortName ? `Route ${routeShortName}` : titleCase(routeTypeLabel)}
          </span>
          {headsign && (
            <span style={{ color: "#555" }}>
              → {headsign}
            </span>
          )}
          <span style={{ color: "#888" }}>{rideMins} min</span>
        </div>
      </Leg>
    </div>
  );
}

// ─── Transfer wait row ───────────────────────────────────────────────────────
function TransferWaitLeg({ waitMins, walkMeters }: { waitMins: number; walkMeters: number }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 24 }}>
        <TrackLine dashed color="#e77049" />
      </div>
      <div style={{ fontSize: "0.78rem", color: "#c45a2a", padding: "3px 0", display: "flex", alignItems: "center", gap: 5 }}>
        <i className="bi bi-arrow-left-right" aria-hidden="true" />
        Transfer · wait {waitMins} min
        {walkMeters > 50 && <span className="ms-1">· walk {Math.round(walkMeters)} m</span>}
      </div>
    </div>
  );
}

// ─── Stop node row ───────────────────────────────────────────────────────────
function StopNode({
  stopName,
  time,
  delay,
  label,
  isTransfer
}: {
  stopName: string;
  time: string | null;
  delay?: number | null;
  label?: string;
  isTransfer?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "4px 0" }}>
      <StopDot color={isTransfer ? "#e77049" : "#0f5b52"} />
      <div style={{ fontSize: "0.84rem" }}>
        <span className="fw-semibold">{stopName}</span>
        {label && (
          <span
            style={{
              fontSize: "0.68rem",
              background: "rgba(15,91,82,0.1)",
              color: "#0f5b52",
              padding: "1px 6px",
              borderRadius: 999,
              fontWeight: 600,
              marginLeft: 6
            }}
          >
            {label}
          </span>
        )}
        {time && (
          <div className="small signalto-subtle mt-1">
            {fmtTime(time)}
            {fmtDelay(delay ?? null)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Address endpoint row ────────────────────────────────────────────────────
function AddressPin({ label, color = "#0f5b52" }: { label: string; color?: string }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "4px 0" }}>
      <LocationPin color={color} />
      <div
        className="fw-semibold text-truncate"
        style={{ fontSize: "0.85rem", color: "var(--signalto-ink)", lineHeight: 1.3 }}
        title={label}
      >
        {label}
      </div>
    </div>
  );
}

// ─── Summary bar ─────────────────────────────────────────────────────────────
function JourneySummary({
  totalMins,
  isTransfer,
  walkInMeters,
  walkOutMeters,
  departureTime
}: {
  totalMins: number;
  isTransfer: boolean;
  walkInMeters: number;
  walkOutMeters: number;
  departureTime: string | null;
}) {
  const walkIn = walkMinutes(walkInMeters);
  const walkOut = walkMinutes(walkOutMeters);
  const fullTotal = totalMins + walkIn + walkOut;
  return (
    <div
      style={{
        marginTop: 16,
        padding: "10px 14px",
        background: "rgba(15,91,82,0.07)",
        borderRadius: 10,
        fontSize: "0.82rem"
      }}
    >
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
        <div className="d-flex align-items-center gap-3">
          <span style={{ fontWeight: 700, fontSize: "1.05rem", color: "#0f5b52" }}>~{fullTotal} min</span>
          {departureTime && (
            <span className="signalto-subtle">Departs {fmtTime(departureTime)}</span>
          )}
        </div>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <span
            style={{
              background: "#0f5b52",
              color: "#fff",
              padding: "3px 10px",
              borderRadius: 999,
              fontWeight: 700,
              fontSize: "0.8rem"
            }}
          >
            <i className="bi bi-ticket-perforated me-1" aria-hidden="true" />
            {TTC_FARE_PRESTO} adult
          </span>
          <span style={{ fontSize: "0.72rem", color: "#888" }}>{TTC_TRANSFER_NOTE}</span>
          {isTransfer && (
            <span style={{ fontSize: "0.72rem", color: "#888" }}>
              {TTC_FARE_CASH} cash / {TTC_FARE_PRESTO} Presto
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Full timeline for one option ─────────────────────────────────────────────
function JourneyTimeline({
  option,
  originLabel,
  destinationLabel,
  walkInMeters,
  walkOutMeters
}: {
  option: AnyOption;
  originLabel: string;
  destinationLabel: string;
  walkInMeters: number;
  walkOutMeters: number;
}) {
  const { eval: ev } = option;
  const hasWalkIn = walkInMeters > 30;
  const hasWalkOut = walkOutMeters > 30;

  if (option.kind === "direct" || option.kind === "scheduled") {
    const opt = option.opt;
    return (
      <div style={{ paddingTop: 4 }}>
        {option.kind === "scheduled" && (
          <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 6, fontSize: "0.75rem", color: "#b05a00", background: "rgba(231,112,73,0.1)", borderRadius: 8, padding: "5px 10px" }}>
            <i className="bi bi-clock" aria-hidden="true" />
            Schedule only — no live tracking for subway
          </div>
        )}
        <AddressPin label={originLabel} />
        {hasWalkIn && <WalkLeg meters={walkInMeters} />}
        <StopNode
          stopName={ev.originStop.stopName}
          time={opt.departureTime}
          delay={opt.originDelaySeconds}
          label="Dep"
        />
        <TransitLeg
          routeShortName={opt.routeShortName}
          routeTypeLabel={opt.routeTypeLabel}
          headsign={opt.headsign}
          rideMins={opt.rideDurationMinutes}
        />
        <StopNode
          stopName={ev.destinationStop.stopName}
          time={opt.arrivalTime}
          delay={opt.destinationDelaySeconds}
          label="Arr"
        />
        {hasWalkOut && <WalkLeg meters={walkOutMeters} />}
        <AddressPin label={destinationLabel} color="#e77049" />
        <JourneySummary
          totalMins={opt.rideDurationMinutes}
          isTransfer={false}
          walkInMeters={walkInMeters}
          walkOutMeters={walkOutMeters}
          departureTime={opt.departureTime}
        />
      </div>
    );
  }

  // Transfer
  const opt = option.opt;
  return (
    <div style={{ paddingTop: 4 }}>
      <AddressPin label={originLabel} />
      {hasWalkIn && <WalkLeg meters={walkInMeters} />}
      <StopNode
        stopName={opt.firstLeg.departureStop.stopName}
        time={opt.firstLeg.departureTime}
        delay={opt.firstLeg.departureDelaySeconds}
        label="Dep"
      />
      <TransitLeg
        routeShortName={opt.firstLeg.routeShortName}
        routeTypeLabel={opt.firstLeg.routeTypeLabel}
        headsign={opt.firstLeg.headsign}
        rideMins={opt.firstLeg.rideDurationMinutes}
      />
      <StopNode
        stopName={opt.transferStop.stopName}
        time={opt.firstLeg.arrivalTime}
        delay={opt.firstLeg.arrivalDelaySeconds}
        isTransfer
        label="Transfer"
      />
      <TransferWaitLeg waitMins={opt.transferWaitMinutes} walkMeters={opt.transferWalkMeters} />
      <TransitLeg
        routeShortName={opt.secondLeg.routeShortName}
        routeTypeLabel={opt.secondLeg.routeTypeLabel}
        headsign={opt.secondLeg.headsign}
        rideMins={opt.secondLeg.rideDurationMinutes}
      />
      <StopNode
        stopName={opt.secondLeg.arrivalStop.stopName}
        time={opt.secondLeg.arrivalTime}
        delay={opt.secondLeg.arrivalDelaySeconds}
        label="Arr"
      />
      {hasWalkOut && <WalkLeg meters={walkOutMeters} />}
      <AddressPin label={destinationLabel} color="#e77049" />
      <JourneySummary
        totalMins={opt.totalTravelMinutes}
        isTransfer
        walkInMeters={walkInMeters}
        walkOutMeters={walkOutMeters}
        departureTime={opt.firstLeg.departureTime}
      />
    </div>
  );
}

// ─── Compact option selector chip ────────────────────────────────────────────
function OptionChip({
  option,
  index,
  selected,
  onClick
}: {
  option: AnyOption;
  index: number;
  selected: boolean;
  onClick: () => void;
}) {
  const dep = option.kind === "transfer" ? option.opt.firstLeg.departureTime : option.opt.departureTime;
  const mins = optionMinutesAway(option);
  const total = optionTotalMins(option);
  const isTransfer = option.kind === "transfer";
  const routeLabel =
    option.kind === "transfer"
      ? `${option.opt.firstLeg.routeShortName ?? "?"} → ${option.opt.secondLeg.routeShortName ?? "?"}`
      : (option.opt.routeShortName ?? titleCase(option.opt.routeTypeLabel));

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        all: "unset",
        display: "flex",
        flexDirection: "column",
        gap: 3,
        padding: "10px 14px",
        borderRadius: 10,
        border: selected ? "2px solid #0f5b52" : "1.5px solid rgba(16,34,51,0.1)",
        background: selected ? "rgba(15,91,82,0.06)" : "rgba(255,255,255,0.8)",
        cursor: "pointer",
        minWidth: 110,
        transition: "border-color 0.15s, background 0.15s",
        flexShrink: 0
      }}
    >
      <div style={{ fontSize: "0.7rem", fontWeight: 700, color: selected ? "#0f5b52" : "#888", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {index === 0 ? "Best" : `Option ${index + 1}`}
        {isTransfer && " · Transfer"}
        {option.kind === "scheduled" && " · Schedule"}
      </div>
      <div style={{ fontSize: "1.05rem", fontWeight: 800, color: selected ? "#0f5b52" : "var(--signalto-ink)" }}>
        {mins === 0 ? "Now" : `${mins} min`}
      </div>
      <div style={{ fontSize: "0.72rem", color: "#666" }}>
        {fmtTime(dep)} · {total} min ride
      </div>
      <div style={{ fontSize: "0.7rem", color: "#888" }}>{routeLabel}</div>
    </button>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────
type Props = {
  /** If NearbyStops pushes a stop, it's provided here */
  presetOriginStop?: TtcStop | null;
  presetDestinationStop?: TtcStop | null;
  /** Called whenever resolved TTC stops change (for notifications, map) */
  onStopsResolved?: (from: TtcStop | null, to: TtcStop | null) => void;
  /** User's GPS location label */
  locationLabel?: string;
  /** Nearby stops from user's GPS (shown in From dropdown when empty) */
  userNearbyStops?: TtcNearbyStop[];
  /** Called when user taps "Use my location" inside the From dropdown */
  onUseMyLocation?: () => void;
};

export function JourneyPlanPanel({ presetOriginStop, presetDestinationStop, onStopsResolved, locationLabel, userNearbyStops = [], onUseMyLocation }: Props) {
  const [originInput, setOriginInput] = useState(presetOriginStop?.stopName ?? "");
  const [destinationInput, setDestinationInput] = useState(presetDestinationStop?.stopName ?? "");
  const [originEndpoint, setOriginEndpoint] = useState<SelectedEndpoint | null>(
    presetOriginStop ? { kind: "stop", stop: presetOriginStop } : null
  );
  const [destinationEndpoint, setDestinationEndpoint] = useState<SelectedEndpoint | null>(
    presetDestinationStop ? { kind: "stop", stop: presetDestinationStop } : null
  );
  const [selectedOptionIdx, setSelectedOptionIdx] = useState(0);

  // Sync preset stops pushed in from NearbyStops panel
  useEffect(() => {
    if (!presetOriginStop) return;
    setOriginEndpoint({ kind: "stop", stop: presetOriginStop });
    setOriginInput(presetOriginStop.stopName);
    saveRecentStop(presetOriginStop);
  }, [presetOriginStop?.stopId]);

  useEffect(() => {
    if (!presetDestinationStop) return;
    setDestinationEndpoint({ kind: "stop", stop: presetDestinationStop });
    setDestinationInput(presetDestinationStop.stopName);
    saveRecentStop(presetDestinationStop);
  }, [presetDestinationStop?.stopId]);

  const debouncedOriginQuery = useDebounce(originInput.trim(), 180);
  const debouncedDestQuery = useDebounce(destinationInput.trim(), 180);

  const isOriginTyping = debouncedOriginQuery.length >= 2 && !originEndpoint;
  const isDestTyping = debouncedDestQuery.length >= 2 && !destinationEndpoint;

  // TTC stop name search (primary for transit users)
  const originStopSearch = useQuery({
    queryKey: ["stop-search-origin", debouncedOriginQuery],
    queryFn: () => api.searchTtcStops(debouncedOriginQuery, 8),
    enabled: isOriginTyping,
    staleTime: 120_000,
  });

  const destStopSearch = useQuery({
    queryKey: ["stop-search-dest", debouncedDestQuery],
    queryFn: () => api.searchTtcStops(debouncedDestQuery, 8),
    enabled: isDestTyping,
    staleTime: 120_000,
  });

  // Photon address autocomplete (secondary, for street addresses)
  const originAddressSuggestions = useQuery({
    queryKey: ["photon-origin", debouncedOriginQuery],
    queryFn: () => photonAutocomplete(debouncedOriginQuery),
    enabled: isOriginTyping,
    staleTime: 60_000,
  });

  const destAddressSuggestions = useQuery({
    queryKey: ["photon-dest", debouncedDestQuery],
    queryFn: () => photonAutocomplete(debouncedDestQuery),
    enabled: isDestTyping,
    staleTime: 60_000,
  });

  // Nearest TTC stops to a geocoded address endpoint
  const originPlace = originEndpoint?.kind === "address" ? originEndpoint.place : null;
  const destinationPlace = destinationEndpoint?.kind === "address" ? destinationEndpoint.place : null;

  const originNearby = useQuery({
    queryKey: ["trip-stops-near-origin", originPlace?.lat, originPlace?.lon],
    queryFn: () => api.getNearbyTtcStops({ lat: originPlace!.lat, lon: originPlace!.lon, radius: 750, limit: 5 }),
    enabled: Boolean(originPlace),
    staleTime: 300_000,
  });

  const destNearby = useQuery({
    queryKey: ["trip-stops-near-dest", destinationPlace?.lat, destinationPlace?.lon],
    queryFn: () => api.getNearbyTtcStops({ lat: destinationPlace!.lat, lon: destinationPlace!.lon, radius: 750, limit: 5 }),
    enabled: Boolean(destinationPlace),
    staleTime: 300_000,
  });

  // Resolve the actual TTC stop that will be used
  const fromStop: TtcStop | null =
    originEndpoint?.kind === "stop"
      ? originEndpoint.stop
      : (originNearby.data?.stops[0] ?? null);

  const toStop: TtcStop | null =
    destinationEndpoint?.kind === "stop"
      ? destinationEndpoint.stop
      : (destNearby.data?.stops[0] ?? null);

  // Commute evaluation
  const journey = useQuery({
    queryKey: ["trip-journey", fromStop?.stopId, toStop?.stopId],
    queryFn: () => api.getTtcCommuteEvaluation(fromStop!.stopId, toStop!.stopId),
    enabled: Boolean(fromStop && toStop && fromStop.stopId !== toStop.stopId),
    refetchInterval: 30_000
  });

  // Walk distances (haversine on frontend)
  // If endpoint.kind === "stop" the user selected the stop directly → walk = 0
  const walkInMeters =
    originEndpoint?.kind === "address" && fromStop
      ? haversineMeters(originEndpoint.place.lat, originEndpoint.place.lon, fromStop.latitude, fromStop.longitude)
      : 0;
  const walkOutMeters =
    destinationEndpoint?.kind === "address" && toStop
      ? haversineMeters(toStop.latitude, toStop.longitude, destinationEndpoint.place.lat, destinationEndpoint.place.lon)
      : 0;

  // Notify parent of resolved stops
  useEffect(() => {
    onStopsResolved?.(fromStop, toStop);
  }, [fromStop?.stopId, toStop?.stopId]);

  // Build unified sorted options list
  const ev = journey.data ?? null;
  const allOptions: AnyOption[] = ev
    ? [
        ...ev.options.slice(0, 4).map((opt): AnyOption => ({ kind: "direct", opt, eval: ev })),
        ...ev.transferOptions.slice(0, 3).map((opt): AnyOption => ({ kind: "transfer", opt, eval: ev })),
        ...(ev.scheduledOptions ?? []).slice(0, 4).map((opt): AnyOption => ({ kind: "scheduled", opt, eval: ev }))
      ].sort((a, b) => optionDeparture(a) - optionDeparture(b))
    : [];

  // Reset selection when options change
  useEffect(() => {
    setSelectedOptionIdx(0);
  }, [ev?.generatedAt]);

  function clearOrigin() {
    setOriginEndpoint(null);
    setOriginInput("");
  }

  function clearDestination() {
    setDestinationEndpoint(null);
    setDestinationInput("");
  }

  function swapPlaces() {
    const tempEndpoint = originEndpoint;
    const tempInput = originInput;
    setOriginEndpoint(destinationEndpoint);
    setOriginInput(destinationInput);
    setDestinationEndpoint(tempEndpoint);
    setDestinationInput(tempInput);
  }

  function formatEndpointLabel(ep: SelectedEndpoint | null, fallback: string): string {
    if (!ep) return fallback;
    if (ep.kind === "stop") return ep.stop.stopName;
    const parts: string[] = [];
    if (ep.place.housenumber) parts.push(ep.place.housenumber);
    if (ep.place.street) parts.push(ep.place.street);
    return parts.join(" ") || ep.place.name;
  }

  const originLabel = formatEndpointLabel(originEndpoint, "Origin");
  const destinationLabel = formatEndpointLabel(destinationEndpoint, "Destination");

  const isSearching = Boolean(originEndpoint && destinationEndpoint && fromStop && toStop);
  const selectedOption = allOptions[selectedOptionIdx] ?? allOptions[0] ?? null;
  const errorMsg =
    journey.error instanceof Error ? journey.error.message : "Unable to find TTC trips for this route right now.";

  return (
    <div className="signalto-panel p-4">
      <SectionHeader
        eyebrow="Trip Planner"
        title="Plan your journey"
        action={
          ev ? (
            <span className="signalto-pill">
              <i className="bi bi-broadcast me-1" aria-hidden="true" />
              Live · {formatTimestamp(ev.generatedAt).split(",")[1]?.trim() ?? ""}
            </span>
          ) : null
        }
      />

      <div className="row g-4">
        {/* ── Left: Endpoint inputs ── */}
        <div className="col-lg-4">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

            {/* ── Journey planner track layout ── */}
            <div style={{ display: "flex", gap: 10 }}>
              {/* Track line connecting From → To */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 28, paddingBottom: 2, flexShrink: 0 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#0f5b52", border: "2.5px solid white", boxShadow: "0 0 0 2px #0f5b52" }} />
                <div style={{ width: 2, flex: 1, minHeight: 20, background: "linear-gradient(to bottom, #0f5b52, #e77049)", margin: "4px 0", borderRadius: 1, opacity: 0.4 }} />
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#e77049", border: "2.5px solid white", boxShadow: "0 0 0 2px #e77049" }} />
              </div>

              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                <JourneyEndpointInput
                  id="journey-from"
                  label="From"
                  placeholder="Station, stop, or address…"
                  inputValue={originInput}
                  selected={originEndpoint}
                  stopResults={originStopSearch.data?.stops ?? []}
                  addressResults={originAddressSuggestions.data ?? []}
                  nearbyStops={userNearbyStops}
                  resolvedStop={originNearby.data?.stops[0] ?? null}
                  isLoadingStops={originStopSearch.isFetching}
                  isLoadingAddresses={originAddressSuggestions.isFetching}
                  onChange={(v) => {
                    setOriginInput(v);
                    if (originEndpoint && v !== (originEndpoint.kind === "stop" ? originEndpoint.stop.stopName : "")) setOriginEndpoint(null);
                  }}
                  onSelectStop={(stop) => { setOriginEndpoint({ kind: "stop", stop }); setOriginInput(stop.stopName); }}
                  onSelectAddress={(place) => { setOriginEndpoint({ kind: "address", place }); setOriginInput(place.name); }}
                  onClear={clearOrigin}
                  locationShortcut={onUseMyLocation ? { label: locationLabel ?? "Use my location", onUse: onUseMyLocation } : null}
                  accentColor="#0f5b52"
                />

                <JourneyEndpointInput
                  id="journey-to"
                  label="Destination"
                  placeholder="Station, stop, or address…"
                  inputValue={destinationInput}
                  selected={destinationEndpoint}
                  stopResults={destStopSearch.data?.stops ?? []}
                  addressResults={destAddressSuggestions.data ?? []}
                  nearbyStops={[]}
                  resolvedStop={destNearby.data?.stops[0] ?? null}
                  isLoadingStops={destStopSearch.isFetching}
                  isLoadingAddresses={destAddressSuggestions.isFetching}
                  onChange={(v) => {
                    setDestinationInput(v);
                    if (destinationEndpoint && v !== (destinationEndpoint.kind === "stop" ? destinationEndpoint.stop.stopName : "")) setDestinationEndpoint(null);
                  }}
                  onSelectStop={(stop) => { setDestinationEndpoint({ kind: "stop", stop }); setDestinationInput(stop.stopName); }}
                  onSelectAddress={(place) => { setDestinationEndpoint({ kind: "address", place }); setDestinationInput(place.name); }}
                  onClear={clearDestination}
                  accentColor="#e77049"
                />
              </div>
            </div>

            {/* Swap + loading hints */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                onClick={swapPlaces}
                className="btn signalto-btn-ghost btn-sm rounded-pill px-3 fw-semibold"
                disabled={!originEndpoint && !destinationEndpoint}
                style={{ fontSize: "0.78rem" }}
              >
                <i className="bi bi-arrow-down-up me-1" aria-hidden="true" />
                Swap
              </button>
              {originEndpoint?.kind === "address" && originNearby.isLoading && (
                <span style={{ fontSize: "0.72rem", color: "rgba(16,34,51,0.45)", display: "flex", alignItems: "center", gap: 5 }}>
                  <i className="bi bi-arrow-repeat transitly-spin" aria-hidden="true" />
                  Finding nearest stop…
                </span>
              )}
            </div>

            {/* No stops near address warning */}
            {originEndpoint?.kind === "address" && !fromStop && !originNearby.isLoading && (
              <div className="alert alert-warning rounded-3 border-0 mb-0 small py-2">
                No TTC stops found near that address. Try a more central location.
              </div>
            )}

            {/* Options selector */}
            {allOptions.length > 0 && (
              <div className="mt-1">
                <div className="signalto-list-label mb-2">
                  {allOptions.length} option{allOptions.length !== 1 ? "s" : ""} available
                </div>
                <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "thin" }}>
                  {allOptions.map((opt, i) => (
                    <OptionChip
                      key={i}
                      option={opt}
                      index={i}
                      selected={selectedOptionIdx === i}
                      onClick={() => setSelectedOptionIdx(i)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Recommendation headline */}
            {ev && (
              <div className="rounded-3 p-3 small" style={{ background: "rgba(15,91,82,0.07)", color: "#0f5b52" }}>
                <div className="fw-semibold">{ev.recommendation.headline}</div>
                <div className="mt-1" style={{ color: "#555", fontSize: "0.78rem" }}>{ev.recommendation.detail}</div>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Journey timeline ── */}
        <div className="col-lg-8">
          {!isSearching ? (
            <div className="signalto-note p-4 signalto-subtle h-100 d-flex align-items-center justify-content-center" style={{ minHeight: 200 }}>
              <div className="text-center">
                <i className="bi bi-map" style={{ fontSize: "2rem", color: "#ccc", display: "block", marginBottom: 10 }} aria-hidden="true" />
                <div className="small">Enter a From and Destination address above to see your TTC journey.</div>
              </div>
            </div>
          ) : journey.isLoading && !ev ? (
            <div className="signalto-note p-4 signalto-subtle d-flex flex-column align-items-center justify-content-center" style={{ minHeight: 200 }}>
              <div className="small mb-2">Finding TTC trips…</div>
              <div className="signalto-subtle small">{fromStop?.stopName} → {toStop?.stopName}</div>
            </div>
          ) : journey.isError ? (
            <div className="alert alert-danger rounded-4 border-0 mb-0">{errorMsg}</div>
          ) : !selectedOption ? (
            <div className="signalto-note p-4 signalto-subtle">
              <div className="mb-2">No TTC service found between these stops right now.</div>
              <div className="small mb-3" style={{ opacity: 0.75 }}>
                This app covers TTC only (bus, streetcar, subway). Your route may require GO Transit, UP Express, or a connection not on TTC.
              </div>
              <a
                href={`https://www.triplinx.ca/en/trip-planner`}
                target="_blank"
                rel="noopener noreferrer"
                className="small"
                style={{ color: "#0f5b52" }}
              >
                Try Triplinx for multi-agency routing →
              </a>
            </div>
          ) : (
            <div
              className="signalto-note p-4"
              style={{ borderRadius: "0.85rem", border: "1.5px solid rgba(15,91,82,0.12)" }}
            >
              <div className="signalto-list-label mb-3">
                {selectedOptionIdx === 0 ? "Best option" : `Option ${selectedOptionIdx + 1}`}
                {selectedOption.kind === "transfer" && (
                  <span className="ms-2" style={{ color: "#e77049" }}>· Transfer required</span>
                )}
                {selectedOption.kind === "scheduled" && (
                  <span className="ms-2" style={{ color: "#b05a00" }}>· Scheduled (subway)</span>
                )}
              </div>
              <JourneyTimeline
                option={selectedOption}
                originLabel={originLabel}
                destinationLabel={destinationLabel}
                walkInMeters={walkInMeters}
                walkOutMeters={walkOutMeters}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
