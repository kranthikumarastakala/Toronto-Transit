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
  type TtcStop,
  type TtcTransferCommuteOption
} from "../lib/api";
import { haversineMeters, walkMinutes, formatWalkLabel } from "../lib/geo-utils";
import { AddressInput } from "./address-input";
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
  | { kind: "transfer"; opt: TtcTransferCommuteOption; eval: TtcCommuteEvaluationResponse };

function optionDeparture(o: AnyOption): number {
  const t = o.kind === "direct" ? o.opt.departureTime : o.opt.firstLeg.departureTime;
  return t ? Date.parse(t) : Number.MAX_SAFE_INTEGER;
}

function optionMinutesAway(o: AnyOption) {
  return o.kind === "direct" ? o.opt.minutesUntilDeparture : o.opt.minutesUntilDeparture;
}

function optionTotalMins(o: AnyOption) {
  if (o.kind === "direct") return o.opt.rideDurationMinutes;
  return o.opt.totalTravelMinutes;
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

  if (option.kind === "direct") {
    const opt = option.opt;
    return (
      <div style={{ paddingTop: 4 }}>
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
  const dep = option.kind === "direct" ? option.opt.departureTime : option.opt.firstLeg.departureTime;
  const mins = optionMinutesAway(option);
  const total = optionTotalMins(option);
  const isTransfer = option.kind === "transfer";
  const routeLabel =
    option.kind === "direct"
      ? (option.opt.routeShortName ?? titleCase(option.opt.routeTypeLabel))
      : `${option.opt.firstLeg.routeShortName ?? "?"} → ${option.opt.secondLeg.routeShortName ?? "?"}`;

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

// ─── Stop picker ─────────────────────────────────────────────────────────────
function StopPicker({
  stops,
  selectedIdx,
  onSelect
}: {
  stops: Array<{ stopId: string; stopName: string; distanceMeters?: number }>;
  selectedIdx: number;
  onSelect: (idx: number) => void;
}) {
  return (
    <div style={{ marginTop: 4 }}>
      <div className="signalto-list-label mb-1" style={{ fontSize: "0.68rem" }}>
        Board at
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {stops.map((stop, idx) => (
          <button
            key={stop.stopId}
            type="button"
            onClick={() => onSelect(idx)}
            style={{
              all: "unset",
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 8px",
              borderRadius: 8,
              background: idx === selectedIdx ? "rgba(15,91,82,0.09)" : "transparent",
              border: `1.5px solid ${idx === selectedIdx ? "rgba(15,91,82,0.3)" : "transparent"}`,
              cursor: "pointer",
              fontSize: "0.78rem"
            }}
          >
            <i
              className={idx === selectedIdx ? "bi bi-record-circle-fill" : "bi bi-circle"}
              style={{ color: idx === selectedIdx ? "#0f5b52" : "#bbb", fontSize: "0.75rem", flexShrink: 0 }}
              aria-hidden="true"
            />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontWeight: idx === selectedIdx ? 600 : 400,
                  color: idx === selectedIdx ? "#0f5b52" : "var(--signalto-ink)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                }}
              >
                {stop.stopName}
              </div>
              {stop.distanceMeters != null && (
                <div style={{ fontSize: "0.68rem", color: "#888" }}>{stop.distanceMeters} m away</div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
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
};

export function JourneyPlanPanel({ presetOriginStop, presetDestinationStop, onStopsResolved, locationLabel }: Props) {
  const [originInput, setOriginInput] = useState(presetOriginStop?.stopName ?? "");
  const [destinationInput, setDestinationInput] = useState(presetDestinationStop?.stopName ?? "");
  const [originPlace, setOriginPlace] = useState<PhotonFeature | null>(
    presetOriginStop
      ? { lat: presetOriginStop.latitude, lon: presetOriginStop.longitude, name: presetOriginStop.stopName, street: null, housenumber: null, city: "Toronto", state: "Ontario", type: "stop" }
      : null
  );
  const [destinationPlace, setDestinationPlace] = useState<PhotonFeature | null>(
    presetDestinationStop
      ? { lat: presetDestinationStop.latitude, lon: presetDestinationStop.longitude, name: presetDestinationStop.stopName, street: null, housenumber: null, city: "Toronto", state: "Ontario", type: "stop" }
      : null
  );
  const [selectedOptionIdx, setSelectedOptionIdx] = useState(0);
  const [selectedOriginStopIdx, setSelectedOriginStopIdx] = useState(0);
  const [selectedDestStopIdx, setSelectedDestStopIdx] = useState(0);

  // Reset stop selection whenever the address changes
  useEffect(() => { setSelectedOriginStopIdx(0); }, [originPlace]);
  useEffect(() => { setSelectedDestStopIdx(0); }, [destinationPlace]);

  // Sync preset stops when NearbyStops pushes them in
  useEffect(() => {
    if (!presetOriginStop) return;
    setOriginInput(presetOriginStop.stopName);
    setOriginPlace({ lat: presetOriginStop.latitude, lon: presetOriginStop.longitude, name: presetOriginStop.stopName, street: null, housenumber: null, city: "Toronto", state: "Ontario", type: "stop" });
  }, [presetOriginStop?.stopId]);

  useEffect(() => {
    if (!presetDestinationStop) return;
    setDestinationInput(presetDestinationStop.stopName);
    setDestinationPlace({ lat: presetDestinationStop.latitude, lon: presetDestinationStop.longitude, name: presetDestinationStop.stopName, street: null, housenumber: null, city: "Toronto", state: "Ontario", type: "stop" });
  }, [presetDestinationStop?.stopId]);

  const debouncedOriginQuery = useDebounce(originInput.trim(), 200);
  const debouncedDestQuery = useDebounce(destinationInput.trim(), 200);

  // Photon autocomplete for each field
  const originSuggestions = useQuery({
    queryKey: ["photon-origin", debouncedOriginQuery],
    queryFn: () => photonAutocomplete(debouncedOriginQuery),
    enabled: debouncedOriginQuery.length >= 2 && !originPlace,
    staleTime: 60_000
  });

  const destSuggestions = useQuery({
    queryKey: ["photon-dest", debouncedDestQuery],
    queryFn: () => photonAutocomplete(debouncedDestQuery),
    enabled: debouncedDestQuery.length >= 2 && !destinationPlace,
    staleTime: 60_000
  });

  // Auto-select when exactly one suggestion comes back
  useEffect(() => {
    if (!originPlace && originSuggestions.data?.length === 1) {
      const place = originSuggestions.data[0];
      setOriginPlace(place);
      setOriginInput(place.name);
    }
  }, [originSuggestions.data]);

  useEffect(() => {
    if (!destinationPlace && destSuggestions.data?.length === 1) {
      const place = destSuggestions.data[0];
      setDestinationPlace(place);
      setDestinationInput(place.name);
    }
  }, [destSuggestions.data]);

  // Nearest TTC stops to each address
  const originNearby = useQuery({
    queryKey: ["trip-stops-near-origin", originPlace?.lat, originPlace?.lon],
    queryFn: () => api.getNearbyTtcStops({ lat: originPlace!.lat, lon: originPlace!.lon, radius: 750, limit: 5 }),
    enabled: Boolean(originPlace),
    staleTime: 300_000
  });

  const destNearby = useQuery({
    queryKey: ["trip-stops-near-dest", destinationPlace?.lat, destinationPlace?.lon],
    queryFn: () => api.getNearbyTtcStops({ lat: destinationPlace!.lat, lon: destinationPlace!.lon, radius: 750, limit: 5 }),
    enabled: Boolean(destinationPlace),
    staleTime: 300_000
  });

  const fromStop = originNearby.data?.stops[selectedOriginStopIdx] ?? originNearby.data?.stops[0] ?? null;
  const toStop = destNearby.data?.stops[selectedDestStopIdx] ?? destNearby.data?.stops[0] ?? null;

  // Commute evaluation
  const journey = useQuery({
    queryKey: ["trip-journey", fromStop?.stopId, toStop?.stopId],
    queryFn: () => api.getTtcCommuteEvaluation(fromStop!.stopId, toStop!.stopId),
    enabled: Boolean(fromStop && toStop && fromStop.stopId !== toStop.stopId),
    refetchInterval: 30_000
  });

  // Walk distances (haversine on frontend)
  // If originPlace.type === "stop" the user is already at the stop → walk = 0
  const walkInMeters =
    originPlace && fromStop && originPlace.type !== "stop"
      ? haversineMeters(originPlace.lat, originPlace.lon, fromStop.latitude, fromStop.longitude)
      : 0;
  const walkOutMeters =
    destinationPlace && toStop && destinationPlace.type !== "stop"
      ? haversineMeters(toStop.latitude, toStop.longitude, destinationPlace.lat, destinationPlace.lon)
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
        ...ev.transferOptions.slice(0, 3).map((opt): AnyOption => ({ kind: "transfer", opt, eval: ev }))
      ].sort((a, b) => optionDeparture(a) - optionDeparture(b))
    : [];

  // Reset selection when options change
  useEffect(() => {
    setSelectedOptionIdx(0);
  }, [ev?.generatedAt]);

  function clearOrigin() {
    setOriginPlace(null);
    setOriginInput("");
  }

  function clearDestination() {
    setDestinationPlace(null);
    setDestinationInput("");
  }

  function swapPlaces() {
    const tempPlace = originPlace;
    const tempInput = originInput;
    setOriginPlace(destinationPlace);
    setOriginInput(destinationInput);
    setDestinationPlace(tempPlace);
    setDestinationInput(tempInput);
  }

  const originLabel =
    originPlace ? (originPlace.name + (originPlace.street && originPlace.street !== originPlace.name ? `, ${originPlace.street}` : "")) : "Origin";
  const destinationLabel =
    destinationPlace ? (destinationPlace.name + (destinationPlace.street && destinationPlace.street !== destinationPlace.name ? `, ${destinationPlace.street}` : "")) : "Destination";

  const isSearching = Boolean(originPlace && destinationPlace && fromStop && toStop);
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
        {/* ── Left: Address inputs ── */}
        <div className="col-lg-4">
          <div className="d-grid gap-2">
            <AddressInput
              id="journey-from"
              label="From"
              placeholder="Enter an address or landmark"
              value={originInput}
              selectedPlace={originPlace}
              suggestions={originSuggestions.data ?? []}
              isLoading={originSuggestions.isLoading}
              onChange={(v) => {
                setOriginInput(v);
                if (originPlace && v !== originPlace.name) setOriginPlace(null);
              }}
              onSelect={(place) => {
                setOriginPlace(place);
                setOriginInput(place.name);
              }}
              onClear={clearOrigin}
              nearbyStopHint={fromStop?.stopName ?? null}
            />

            {/* Stop picker — shown when place is chosen and multiple nearby stops exist */}
            {originPlace && (originNearby.data?.stops.length ?? 0) > 1 && (
              <StopPicker
                stops={originNearby.data!.stops}
                selectedIdx={selectedOriginStopIdx}
                onSelect={setSelectedOriginStopIdx}
              />
            )}

            <div className="d-flex justify-content-center">
              <button
                type="button"
                onClick={swapPlaces}
                className="btn signalto-btn-ghost rounded-pill px-3 py-1 small fw-semibold"
                disabled={!originPlace && !destinationPlace}
              >
                <i className="bi bi-arrow-down-up me-2" aria-hidden="true" />
                Swap
              </button>
            </div>

            <AddressInput
              id="journey-to"
              label="Destination"
              placeholder="Enter an address or landmark"
              value={destinationInput}
              selectedPlace={destinationPlace}
              suggestions={destSuggestions.data ?? []}
              isLoading={destSuggestions.isLoading}
              onChange={(v) => {
                setDestinationInput(v);
                if (destinationPlace && v !== destinationPlace.name) setDestinationPlace(null);
              }}
              onSelect={(place) => {
                setDestinationPlace(place);
                setDestinationInput(place.name);
              }}
              onClear={clearDestination}
              nearbyStopHint={toStop?.stopName ?? null}
            />

            {/* Stop picker */}
            {destinationPlace && (destNearby.data?.stops.length ?? 0) > 1 && (
              <StopPicker
                stops={destNearby.data!.stops}
                selectedIdx={selectedDestStopIdx}
                onSelect={setSelectedDestStopIdx}
              />
            )}

            {/* Status indicators */}
            {originPlace && !fromStop && originNearby.isLoading && (
              <div className="signalto-note p-2 small signalto-subtle">
                <i className="bi bi-search me-1" aria-hidden="true" />
                Finding nearest TTC stop…
              </div>
            )}
            {originPlace && !fromStop && !originNearby.isLoading && (
              <div className="alert alert-warning rounded-3 border-0 mb-0 small py-2">
                No TTC stops found near that address. Try a more central location.
              </div>
            )}

            {/* Options selector (compact chips — shown once results arrive) */}
            {allOptions.length > 0 && (
              <div className="mt-2">
                <div className="signalto-list-label mb-2">
                  {allOptions.length} option{allOptions.length !== 1 ? "s" : ""} available
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    overflowX: "auto",
                    paddingBottom: 4,
                    scrollbarWidth: "thin"
                  }}
                >
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
              <div
                className="rounded-3 p-3 mt-1 small"
                style={{ background: "rgba(15,91,82,0.07)", color: "#0f5b52" }}
              >
                <div className="fw-semibold">{ev.recommendation.headline}</div>
                <div className="mt-1" style={{ color: "#555", fontSize: "0.78rem" }}>
                  {ev.recommendation.detail}
                </div>
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
