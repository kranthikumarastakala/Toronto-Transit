import type { TtcCommuteOption, TtcTransferCommuteOption } from "../lib/api";
import { formatTimestamp, formatDelay, titleCase } from "../lib/format-utils";

type DirectRideCardProps = {
  option: TtcCommuteOption;
  index: number;
};

export function DirectRideCard({ option, index }: DirectRideCardProps) {
  return (
    <article className="signalto-arrival-card p-4">
      <div className="d-flex flex-column flex-lg-row align-items-lg-start justify-content-between gap-3">
        <div className="flex-grow-1">
          <div className="d-flex flex-wrap gap-2 mb-3">
            <span className="signalto-pill teal">
              <i className="bi bi-signpost-split" aria-hidden="true" />
              {index === 0 ? "Best option" : "Next option"}
            </span>
            <span className="signalto-pill">
              <i className="bi bi-diagram-3-fill" aria-hidden="true" />
              {titleCase(option.routeTypeLabel)}
            </span>
            <span className="signalto-pill">
              <i className="bi bi-badge-4k" aria-hidden="true" />
              {option.routeShortName ?? "Route"}
            </span>
          </div>
          <h3 className="h4 fw-bold mb-2">{option.routeLongName ?? option.headsign ?? "TTC service"}</h3>
          <p className="signalto-subtle mb-0">
            {option.headsign ?? "Headsign unavailable"} - {formatDelay(option.originDelaySeconds)}
          </p>
        </div>
        <div className="signalto-arrival-eta px-3 py-3">
          <span className="signalto-arrival-number">{option.minutesUntilDeparture}</span>
          <span className="small text-uppercase text-body-secondary">min</span>
        </div>
      </div>

      <div className="row g-3 mt-2 small">
        <div className="col-sm-4">
          <div className="signalto-note p-3 h-100">
            <div className="signalto-list-label mb-1">Departure</div>
            {formatTimestamp(option.departureTime)}
          </div>
        </div>
        <div className="col-sm-4">
          <div className="signalto-note p-3 h-100">
            <div className="signalto-list-label mb-1">Arrival</div>
            {formatTimestamp(option.arrivalTime)}
          </div>
        </div>
        <div className="col-sm-4">
          <div className="signalto-note p-3 h-100">
            <div className="signalto-list-label mb-1">Ride Time</div>
            About {option.rideDurationMinutes} min
          </div>
        </div>
      </div>
    </article>
  );
}

type TransferOptionCardProps = {
  option: TtcTransferCommuteOption;
  index: number;
};

export function TransferOptionCard({ option, index }: TransferOptionCardProps) {
  return (
    <article className="signalto-arrival-card p-4">
      <div className="d-flex flex-column flex-lg-row align-items-lg-start justify-content-between gap-3">
        <div className="flex-grow-1">
          <div className="d-flex flex-wrap gap-2 mb-3">
            <span className="signalto-pill teal">
              <i className="bi bi-shuffle" aria-hidden="true" />
              {index === 0 ? "Best transfer" : "Next transfer"}
            </span>
            <span className="signalto-pill">
              <i className="bi bi-pin-map-fill" aria-hidden="true" />
              {option.transferStop.stopName}
            </span>
          </div>
          <h3 className="h4 fw-bold mb-2">
            Take {option.firstLeg.routeShortName ?? "TTC"} then {option.secondLeg.routeShortName ?? "TTC"}
          </h3>
          <p className="signalto-subtle mb-0">
            Wait about {option.transferWaitMinutes} min to transfer and arrive in about {option.totalTravelMinutes} min.
          </p>
        </div>
        <div className="signalto-arrival-eta px-3 py-3">
          <span className="signalto-arrival-number">{option.minutesUntilDeparture}</span>
          <span className="small text-uppercase text-body-secondary">min</span>
        </div>
      </div>

      <div className="row g-3 mt-2">
        <div className="col-md-6">
          <div className="signalto-note p-3 h-100">
            <div className="signalto-list-label mb-1">First TTC ride</div>
            <div className="fw-semibold">{option.firstLeg.departureStop.stopName}</div>
            <div className="small signalto-subtle mt-1">
              {formatTimestamp(option.firstLeg.departureTime)} to {formatTimestamp(option.firstLeg.arrivalTime)}
            </div>
            <div className="small signalto-subtle mt-2">
              {titleCase(option.firstLeg.routeTypeLabel)} {option.firstLeg.routeShortName ?? ""} -{" "}
              {formatDelay(option.firstLeg.departureDelaySeconds)}
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="signalto-note p-3 h-100">
            <div className="signalto-list-label mb-1">Second TTC ride</div>
            <div className="fw-semibold">{option.secondLeg.departureStop.stopName}</div>
            <div className="small signalto-subtle mt-1">
              {formatTimestamp(option.secondLeg.departureTime)} to {formatTimestamp(option.secondLeg.arrivalTime)}
            </div>
            <div className="small signalto-subtle mt-2">
              {titleCase(option.secondLeg.routeTypeLabel)} {option.secondLeg.routeShortName ?? ""} -{" "}
              {formatDelay(option.secondLeg.departureDelaySeconds)}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
