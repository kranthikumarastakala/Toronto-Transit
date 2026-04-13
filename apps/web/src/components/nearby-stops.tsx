import type { TtcNearbyStop } from "../lib/api";

interface NearbyStopsProps {
  stops: TtcNearbyStop[];
  isLoading: boolean;
  isError: boolean;
  onPreview: (stopId: string) => void;
  onUseAsFrom: (stop: TtcNearbyStop) => void;
  onUseAsDestination: (stop: TtcNearbyStop) => void;
}

function formatDistance(meters: number) {
  if (meters < 1000) {
    return `${meters}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

export function NearbyStopsCarousel({
  stops,
  isLoading,
  isError,
  onPreview,
  onUseAsFrom,
  onUseAsDestination
}: NearbyStopsProps) {
  if (isLoading) {
    return (
      <div className="text-center py-8 text-ink/50">
        <i className="bi bi-hourglass-split text-xl mb-2 block animate-pulse-subtle" />
        Finding nearby stops...
      </div>
    );
  }

  if (isError || stops.length === 0) {
    return (
      <div className="text-center py-8 text-ink/50">
        <i className="bi bi-inbox text-xl mb-2 block" />
        No nearby stops found
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {stops.map((stop) => (
        <div
          key={stop.stopId}
          className="group p-4 bg-white border border-ink/5 rounded-2xl hover:border-teal/30 hover:shadow-md transition-all animate-in cursor-pointer"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <div className="font-semibold text-ink">{stop.stopName}</div>
              <div className="text-xs text-ink/50 mt-1">
                {stop.stopCode ? `Stop ${stop.stopCode}` : stop.stopId} • {formatDistance(stop.distanceMeters)}
              </div>
            </div>
            <button
              onClick={() => onPreview(stop.stopId)}
              className="ml-2 px-3 py-2 text-xs font-semibold text-ink/40 hover:text-teal transition-colors"
            >
              <i className="bi bi-eye" />
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => onUseAsFrom(stop)}
              className="flex-1 px-3 py-2 bg-teal text-white rounded-xl text-xs font-semibold hover:bg-teal-deep transition-colors"
            >
              <i className="bi bi-arrow-up-right mr-1" />
              From
            </button>
            <button
              onClick={() => onUseAsDestination(stop)}
              className="flex-1 px-3 py-2 bg-ink/5 text-ink border border-ink/10 rounded-xl text-xs font-semibold hover:bg-ink/10 transition-colors"
            >
              <i className="bi bi-arrow-down-left mr-1" />
              To
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
