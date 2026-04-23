import { useState } from "react";
import { TtcStopArrivalsResponse } from "../lib/api";
import { formatTimestamp, formatDelay, titleCase } from "../lib/format-utils";

type DepartureCardProps = {
  arrivals: TtcStopArrivalsResponse | null;
  isLoading: boolean;
  isError: boolean;
};

export function DepartureCard({ arrivals, isLoading, isError }: DepartureCardProps) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  if (!arrivals) {
    return <div className="signalto-note p-4 signalto-subtle">Choose a stop to see departures</div>;
  }
  if (isLoading) {
    return <div className="signalto-note p-4 signalto-subtle">Loading departures...</div>;
  }
  if (isError) {
    return <div className="alert alert-danger rounded-4 border-0 mb-0">Unable to load departures.</div>;
  }
  if (!arrivals.arrivals.length) {
    return <div className="signalto-note p-4 signalto-subtle">No live departures available for this stop.</div>;
  }

  const rows = arrivals.arrivals.slice(0, 8);

  return (
    <div style={{ borderRadius: "0.85rem", overflow: "hidden", border: "1px solid rgba(16,34,51,0.08)" }}>
      {rows.map((arrival, idx) => {
        const isOpen = openIdx === idx;
        const typeColor =
          arrival.routeTypeLabel === "subway"
            ? "#102233"
            : arrival.routeTypeLabel === "streetcar"
            ? "#e77049"
            : "#0f5b52";
        const isUrgent = arrival.minutesAway <= 2;
        const key = `${arrival.tripId ?? "trip"}-${arrival.routeId ?? "route"}-${arrival.predictedDepartureTime ?? idx}`;

        return (
          <div
            key={key}
            style={{
              borderBottom: idx < rows.length - 1 ? "1px solid rgba(16,34,51,0.07)" : "none",
              background: isOpen ? "rgba(15,91,82,0.04)" : "transparent",
              transition: "background 0.18s"
            }}
          >
            {/* Summary row — always visible */}
            <button
              onClick={() => setOpenIdx(isOpen ? null : idx)}
              style={{
                all: "unset",
                display: "flex",
                alignItems: "center",
                width: "100%",
                padding: "0.65rem 1rem",
                cursor: "pointer",
                gap: "0.75rem",
                boxSizing: "border-box"
              }}
              aria-expanded={isOpen}
            >
              {/* Route badge */}
              <span
                style={{
                  background: typeColor,
                  color: "#fff",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  padding: "2px 9px",
                  borderRadius: "99px",
                  flexShrink: 0,
                  letterSpacing: "0.03em",
                  minWidth: "2.8rem",
                  textAlign: "center"
                }}
              >
                {arrival.routeShortName ?? "—"}
              </span>

              {/* Headsign / route name */}
              <span
                style={{
                  flex: 1,
                  fontWeight: 500,
                  fontSize: "0.87rem",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: "var(--signalto-ink)"
                }}
              >
                {arrival.headsign ?? arrival.routeLongName ?? "TTC service"}
              </span>

              {/* ETA */}
              <span
                style={{
                  fontWeight: 800,
                  fontSize: "0.95rem",
                  color: isUrgent ? "#e77049" : typeColor,
                  flexShrink: 0,
                  fontVariantNumeric: "tabular-nums",
                  minWidth: "3.2rem",
                  textAlign: "right"
                }}
              >
                {arrival.minutesAway === 0 ? "Now" : `${arrival.minutesAway} min`}
              </span>

              {/* Chevron */}
              <i
                className={`bi bi-chevron-${isOpen ? "up" : "down"}`}
                style={{ fontSize: "0.72rem", color: "#aaa", flexShrink: 0, transition: "transform 0.2s" }}
                aria-hidden="true"
              />
            </button>

            {/* Expanded detail */}
            {isOpen && (
              <div
                style={{
                  padding: "0 1rem 0.85rem 1rem",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.5rem",
                  fontSize: "0.8rem"
                }}
              >
                <div className="signalto-note p-3">
                  <div className="signalto-list-label mb-1">Route</div>
                  <span className="signalto-pill" style={{ fontSize: "0.72rem" }}>
                    <i className="bi bi-signpost-split me-1" aria-hidden="true" />
                    {titleCase(arrival.routeTypeLabel)}
                  </span>
                </div>
                <div className="signalto-note p-3">
                  <div className="signalto-list-label mb-1">Delay</div>
                  {formatDelay(arrival.delaySeconds)}
                </div>
                <div className="signalto-note p-3">
                  <div className="signalto-list-label mb-1">Predicted</div>
                  {formatTimestamp(arrival.predictedDepartureTime)}
                </div>
                <div className="signalto-note p-3">
                  <div className="signalto-list-label mb-1">Scheduled</div>
                  {formatTimestamp(arrival.scheduledDepartureTime)}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
