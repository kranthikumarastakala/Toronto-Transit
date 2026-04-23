import { TtcNearbyStop } from "../lib/api";
import { formatDistance } from "../lib/format-utils";

type NearbyStopsProps = {
  stops: TtcNearbyStop[];
  isLoading: boolean;
  isError: boolean;
  onPreview: (stopId: string) => void;
  onUseAsFrom: (stop: TtcNearbyStop) => void;
  onUseAsDestination: (stop: TtcNearbyStop) => void;
};

export function NearbyStops({
  stops,
  isLoading,
  isError,
  onPreview,
  onUseAsFrom,
  onUseAsDestination
}: NearbyStopsProps) {
  if (isLoading) {
    return (
      <div className="signalto-note p-4 signalto-subtle">
        Loading nearby TTC stops...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="alert alert-danger rounded-4 border-0 mb-0">
        Unable to load nearby TTC stops right now.
      </div>
    );
  }

  if (!stops.length) {
    return (
      <div className="signalto-note p-4 signalto-subtle">
        No nearby stops found.
      </div>
    );
  }

  return (
    <div className="signalto-scroll d-grid gap-3">
      {stops.map((stop) => (
        <div key={stop.stopId} className="signalto-source-card p-3">
          <div className="d-flex align-items-start justify-content-between gap-3">
            <div>
              <div className="fw-semibold">{stop.stopName}</div>
              <div className="small signalto-subtle mt-1">
                {stop.stopCode ? `Stop ${stop.stopCode}` : stop.stopId} - {formatDistance(stop.distanceMeters)}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm signalto-btn-ghost rounded-pill px-3"
              onClick={() => onPreview(stop.stopId)}
            >
              Preview
            </button>
          </div>
          <div className="d-flex flex-wrap gap-2 mt-3">
            <button
              type="button"
              className="btn btn-sm signalto-btn-primary rounded-pill px-3"
              onClick={() => onUseAsFrom(stop)}
            >
              Use as From
            </button>
            <button
              type="button"
              className="btn btn-sm signalto-btn-ghost rounded-pill px-3"
              onClick={() => onUseAsDestination(stop)}
            >
              Use as Destination
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
