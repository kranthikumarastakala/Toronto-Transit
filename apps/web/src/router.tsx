import { useDeferredValue, useEffect, useState, type ReactNode } from "react";
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { api, type TtcCommuteEvaluationResponse, type TtcStop, type TtcTransferCommuteOption } from "./lib/api";
import { usePersistedState } from "./lib/use-persisted-state";
import { SearchCard } from "./components/search-card";
import { RecommendationCard } from "./components/recommendation-card";
import { NearbyStopsCarousel } from "./components/nearby-stops";

const queryClient = new QueryClient();

type LocationState = {
  latitude: number;
  longitude: number;
  label: string;
  source: "fallback" | "browser";
};

const fallbackLocation: LocationState = {
  latitude: 43.6532,
  longitude: -79.3832,
  label: "Downtown Toronto fallback",
  source: "fallback"
};

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatDistance(distanceMeters: number) {
  if (distanceMeters < 1_000) {
    return `${distanceMeters} m`;
  }

  return `${(distanceMeters / 1_000).toFixed(1)} km`;
}

function formatWheelchair(value: "yes" | "no" | "unknown") {
  switch (value) {
    case "yes":
      return "Wheelchair accessible";
    case "no":
      return "Accessibility unknown or limited";
    default:
      return "Accessibility not specified";
  }
}

function formatDelay(delaySeconds: number | null) {
  if (delaySeconds === null) {
    return "Realtime only";
  }

  if (delaySeconds === 0) {
    return "On time";
  }

  const minutes = Math.round(Math.abs(delaySeconds) / 60);
  return `${minutes} min ${delaySeconds > 0 ? "late" : "early"}`;
}

function titleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function recommendationPresentation(status: TtcCommuteEvaluationResponse["recommendation"]["status"]) {
  switch (status) {
    case "leave_now":
      return { className: "signalto-commute-banner now", icon: "bi bi-lightning-charge-fill" };
    case "leave_soon":
      return { className: "signalto-commute-banner soon", icon: "bi bi-alarm-fill" };
    case "plan_ahead":
      return { className: "signalto-commute-banner ahead", icon: "bi bi-calendar2-check-fill" };
    default:
      return { className: "signalto-commute-banner none", icon: "bi bi-signpost-split-fill" };
  }
}

function confidencePresentation(level: TtcCommuteEvaluationResponse["confidence"]["level"]) {
  switch (level) {
    case "high":
      return { className: "signalto-pill teal", icon: "bi bi-shield-fill-check" };
    case "moderate":
      return { className: "signalto-pill", icon: "bi bi-shield-half" };
    default:
      return { className: "signalto-pill coral", icon: "bi bi-exclamation-shield-fill" };
  }
}

function sameStop(left: TtcStop | null, right: TtcStop | null) {
  return Boolean(left && right && left.stopId === right.stopId);
}

type SectionHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
};

function SectionHeader({ eyebrow, title, description, action }: SectionHeaderProps) {
  return (
    <div className="d-flex flex-column flex-lg-row align-items-lg-end justify-content-between gap-3 mb-4">
      <div>
        <div className="signalto-kicker">{eyebrow}</div>
        <h2 className="signalto-panel-title mt-2 mb-2">{title}</h2>
        <p className="signalto-subtle mb-0">{description}</p>
      </div>
      {action ? <div className="flex-shrink-0">{action}</div> : null}
    </div>
  );
}

type SearchPickerProps = {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  selectedStop: TtcStop | null;
  results: TtcStop[];
  isLoading: boolean;
  isError: boolean;
  onChange: (value: string) => void;
  onChooseStop: (stop: TtcStop) => void;
  onClear: () => void;
};

function SearchPicker({
  id,
  label,
  placeholder,
  value,
  selectedStop,
  results,
  isLoading,
  isError,
  onChange,
  onChooseStop,
  onClear
}: SearchPickerProps) {
  const searching = value.trim().length >= 2;

  return (
    <div className="signalto-section-banner p-3 p-lg-4 h-100">
      <label htmlFor={id} className="signalto-list-label d-block mb-2">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="form-control signalto-input"
      />

      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3 small signalto-subtle">
        <span>
          {selectedStop
            ? `${selectedStop.stopName}${selectedStop.stopCode ? ` - Stop ${selectedStop.stopCode}` : ""}`
            : "Choose a stop from the results below."}
        </span>
        {selectedStop ? (
          <button type="button" className="btn btn-link p-0 text-decoration-none" onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>

      <div className="signalto-scroll d-grid gap-2 mt-3">
        {!searching ? (
          <div className="signalto-note p-3 small signalto-subtle">Type at least 2 characters to search TTC stops.</div>
        ) : isLoading ? (
          <div className="signalto-note p-3 small signalto-subtle">Searching TTC stops...</div>
        ) : isError ? (
          <div className="alert alert-danger rounded-4 border-0 mb-0">Unable to search TTC stops right now.</div>
        ) : results.length ? (
          results.map((stop) => (
            <button
              key={stop.stopId}
              type="button"
              onClick={() => onChooseStop(stop)}
              className={`signalto-stop-button ${selectedStop?.stopId === stop.stopId ? "is-selected" : ""}`}
            >
              <div className="d-flex align-items-start justify-content-between gap-3">
                <div>
                  <div className="fw-semibold fs-6">{stop.stopName}</div>
                  <div className="small signalto-stop-meta mt-1">
                    {stop.stopCode ? `Stop ${stop.stopCode}` : stop.stopId}
                  </div>
                </div>
                <span className="signalto-stop-distance">{stop.locationType === 1 ? "Station" : "Stop"}</span>
              </div>
              <div className="small signalto-stop-meta mt-3">
                <i className="bi bi-universal-access me-2" aria-hidden="true" />
                {formatWheelchair(stop.wheelchairBoarding)}
              </div>
            </button>
          ))
        ) : (
          <div className="signalto-note p-3 small signalto-subtle">No TTC stops matched that search yet.</div>
        )}
      </div>
    </div>
  );
}

function DirectRideCard({
  option,
  index
}: {
  option: NonNullable<TtcCommuteEvaluationResponse["primaryOption"]>;
  index: number;
}) {
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

function TransferOptionCard({
  option,
  index
}: {
  option: TtcTransferCommuteOption;
  index: number;
}) {
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

function DashboardPage() {
  const [location, setLocation] = useState<LocationState>(fallbackLocation);
  const [locationStatus, setLocationStatus] = useState<"idle" | "locating" | "ready" | "error">("idle");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [originStop, setOriginStop] = usePersistedState<TtcStop | null>("signalto.trip-search.origin", null);
  const [destinationStop, setDestinationStop] = usePersistedState<TtcStop | null>(
    "signalto.trip-search.destination",
    null
  );
  const [originInput, setOriginInput] = useState(originStop?.stopName ?? "");
  const [destinationInput, setDestinationInput] = useState(destinationStop?.stopName ?? "");
  const [draftOrigin, setDraftOrigin] = useState<TtcStop | null>(originStop);
  const [draftDestination, setDraftDestination] = useState<TtcStop | null>(destinationStop);

  const deferredOriginQuery = useDeferredValue(originInput.trim());
  const deferredDestinationQuery = useDeferredValue(destinationInput.trim());

  const health = useQuery({
    queryKey: ["health"],
    queryFn: api.getHealth,
    refetchInterval: 30_000
  });

  const vehicles = useQuery({
    queryKey: ["ttc-vehicles-summary"],
    queryFn: api.getTtcVehicleSummary,
    refetchInterval: 30_000
  });

  const nearbyStops = useQuery({
    queryKey: ["ttc-nearby-stops", location.latitude, location.longitude],
    queryFn: () => api.getNearbyTtcStops({ lat: location.latitude, lon: location.longitude, radius: 900, limit: 8 }),
    staleTime: 300_000
  });

  const originSearch = useQuery({
    queryKey: ["ttc-origin-search", deferredOriginQuery],
    queryFn: () => api.searchTtcStops(deferredOriginQuery, 6),
    enabled: deferredOriginQuery.length >= 2,
    staleTime: 300_000
  });

  const destinationSearch = useQuery({
    queryKey: ["ttc-destination-search", deferredDestinationQuery],
    queryFn: () => api.searchTtcStops(deferredDestinationQuery, 6),
    enabled: deferredDestinationQuery.length >= 2,
    staleTime: 300_000
  });

  const arrivals = useQuery({
    queryKey: ["ttc-stop-arrivals", selectedStopId],
    queryFn: () => api.getTtcStopArrivals(selectedStopId!),
    enabled: Boolean(selectedStopId),
    refetchInterval: 20_000
  });

  const commuteEvaluation = useQuery({
    queryKey: ["ttc-commute-evaluation", originStop?.stopId, destinationStop?.stopId],
    queryFn: () => api.getTtcCommuteEvaluation(originStop!.stopId, destinationStop!.stopId),
    enabled: Boolean(originStop && destinationStop && !sameStop(originStop, destinationStop)),
    refetchInterval: 30_000
  });

  useEffect(() => {
    if (!selectedStopId) {
      setSelectedStopId(originStop?.stopId ?? nearbyStops.data?.stops[0]?.stopId ?? null);
    }
  }, [nearbyStops.data, originStop, selectedStopId]);

  const locationModeLabel = location.source === "browser" ? "Live location" : "Fallback mode";
  const previewSearchStops = [...(originSearch.data?.stops ?? []), ...(destinationSearch.data?.stops ?? [])];
  const previewStop =
    arrivals.data?.stop ??
    nearbyStops.data?.stops.find((stop) => stop.stopId === selectedStopId) ??
    previewSearchStops.find((stop) => stop.stopId === selectedStopId) ??
    draftOrigin ??
    null;
  const commutePresentation = recommendationPresentation(
    commuteEvaluation.data?.recommendation.status ?? "no_direct_trip"
  );
  const commuteConfidence = commuteEvaluation.data
    ? confidencePresentation(commuteEvaluation.data.confidence.level)
    : null;
  const tripResults = commuteEvaluation.data ?? null;
  const directOptions = tripResults?.options.slice(0, 4) ?? [];
  const transferOptions = tripResults?.transferOptions.slice(0, 4) ?? [];
  const canSearch = Boolean(draftOrigin && draftDestination && !sameStop(draftOrigin, draftDestination));
  const hasTripSearch = Boolean(originStop && destinationStop);
  const searchButtonLabel = commuteEvaluation.isLoading && !tripResults ? "Searching..." : "Search";
  const commuteErrorMessage =
    commuteEvaluation.error instanceof Error ? commuteEvaluation.error.message : "Unable to search this TTC trip right now.";

  function requestBrowserLocation() {
    if (!navigator.geolocation) {
      setLocationStatus("error");
      setLocationError("Browser geolocation is not available here.");
      return;
    }

    setLocationStatus("locating");
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          label: "Your live location",
          source: "browser"
        });
        setLocationStatus("ready");
      },
      (error) => {
        setLocationStatus("error");
        setLocationError(error.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 60_000
      }
    );
  }

  function handleOriginInputChange(value: string) {
    setOriginInput(value);

    if (draftOrigin && value.trim() !== draftOrigin.stopName) {
      setDraftOrigin(null);
    }
  }

  function handleDestinationInputChange(value: string) {
    setDestinationInput(value);

    if (draftDestination && value.trim() !== draftDestination.stopName) {
      setDraftDestination(null);
    }
  }

  function chooseOriginStop(stop: TtcStop) {
    setDraftOrigin(stop);
    setOriginInput(stop.stopName);
    setSelectedStopId(stop.stopId);
  }

  function chooseDestinationStop(stop: TtcStop) {
    setDraftDestination(stop);
    setDestinationInput(stop.stopName);
    setSelectedStopId(stop.stopId);
  }

  function clearOriginSelection() {
    setDraftOrigin(null);
    setOriginInput("");
  }

  function clearDestinationSelection() {
    setDraftDestination(null);
    setDestinationInput("");
  }

  function runTripSearch() {
    if (!draftOrigin || !draftDestination || sameStop(draftOrigin, draftDestination)) {
      return;
    }

    setOriginStop(draftOrigin);
    setDestinationStop(draftDestination);
    setSelectedStopId(draftOrigin.stopId);
  }

  function swapDraftStops() {
    const nextOrigin = draftDestination;
    const nextDestination = draftOrigin;

    setDraftOrigin(nextOrigin);
    setDraftDestination(nextDestination);
    setOriginInput(nextOrigin?.stopName ?? "");
    setDestinationInput(nextDestination?.stopName ?? "");
  }

  function clearTripSearch() {
    setDraftOrigin(null);
    setDraftDestination(null);
    setOriginStop(null);
    setDestinationStop(null);
    setOriginInput("");
    setDestinationInput("");
    setSelectedStopId(nearbyStops.data?.stops[0]?.stopId ?? null);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream via-cream to-mist">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-ink/5">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-teal to-navy flex items-center justify-center text-white text-lg">
                <i className="bi bi-train-lightrail-front-fill" />
              </div>
              <div>
                <div className="font-bold text-ink">SignalTO</div>
                <div className="text-xs text-ink/50">Toronto Transit</div>
              </div>
            </div>
            {vehicles.data && (
              <div className="text-right text-xs">
                <div className="text-ink/50">{vehicles.data.totalVehicles} active</div>
                <div className="font-semibold text-teal">vehicles</div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 pb-12 space-y-8">
        {/* Search Section - Hero */}
        <section className="space-y-4">
          <form onSubmit={(e) => { e.preventDefault(); runTripSearch(); }} className="space-y-4">
            <SearchCard
              id="origin"
              label="From"
              placeholder="Search origin stop..."
              value={originInput}
              selectedStop={draftOrigin}
              results={originSearch.data?.stops ?? []}
              isLoading={originSearch.isLoading}
              isError={originSearch.isError}
              onChange={handleOriginInputChange}
              onChooseStop={chooseOriginStop}
              onClear={clearOriginSelection}
            />

            <SearchCard
              id="destination"
              label="To"
              placeholder="Search destination stop..."
              value={destinationInput}
              selectedStop={draftDestination}
              results={destinationSearch.data?.stops ?? []}
              isLoading={destinationSearch.isLoading}
              isError={destinationSearch.isError}
              onChange={handleDestinationInputChange}
              onChooseStop={chooseDestinationStop}
              onClear={clearDestinationSelection}
            />

            {sameStop(draftOrigin, draftDestination) && (
              <div className="px-4 py-3 bg-coral/10 border border-coral/20 rounded-xl text-sm text-coral">
                <i className="bi bi-exclamation-circle mr-2" />
                Choose two different stops
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={!canSearch}
                className={`flex-1 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                  canSearch
                    ? "bg-teal text-white hover:bg-teal-deep shadow-lg hover:shadow-xl"
                    : "bg-ink/5 text-ink/30 cursor-not-allowed"
                }`}
              >
                <i className="bi bi-search" />
                {commuteEvaluation.isLoading && !tripResults ? "Searching..." : "Find Trip"}
              </button>
              {hasTripSearch && (
                <button
                  type="button"
                  onClick={clearTripSearch}
                  className="px-4 py-3 rounded-xl border border-ink/10 text-ink/60 hover:bg-ink/5 transition-colors"
                >
                  <i className="bi bi-x-lg" />
                </button>
              )}
            </div>
          </form>
        </section>

        {/* Recommendation Section */}
        {hasTripSearch && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-ink">Trip Recommendation</h2>
              {tripResults && (
                <div className="text-xs text-ink/50">
                  Updated {formatTimestamp(tripResults.generatedAt)}
                </div>
              )}
            </div>
            <RecommendationCard
              data={tripResults}
              isLoading={commuteEvaluation.isLoading}
              isError={commuteEvaluation.isError}
              errorMessage={commuteErrorMessage}
            />
          </section>
        )}

        {/* Nearby Stops Section */}
        <section className="space-y-4">
          <h2 className="font-bold text-ink">Nearby Stops</h2>
          <NearbyStopsCarousel
            stops={nearbyStops.data?.stops ?? []}
            isLoading={nearbyStops.isLoading}
            isError={nearbyStops.isError}
            onPreview={setSelectedStopId}
            onUseAsFrom={chooseOriginStop}
            onUseAsDestination={chooseDestinationStop}
          />
        </section>

        {/* Live Departures Section */}
        {selectedStopId && previewStop && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-ink">{previewStop.stopName}</h2>
                <div className="text-xs text-ink/50 mt-1">
                  {previewStop.stopCode ? `Stop ${previewStop.stopCode}` : previewStop.stopId}
                </div>
              </div>
              {arrivals.data && (
                <div className="text-right">
                  <div className="text-3xl font-bold text-teal">{arrivals.data.totalArrivals}</div>
                  <div className="text-xs text-ink/50">departures</div>
                </div>
              )}
            </div>

            {arrivals.isLoading && (
              <div className="text-center py-8 text-ink/50">
                <i className="bi bi-hourglass-split text-xl mb-2 block animate-pulse-subtle" />
                Loading departures...
              </div>
            )}

            {arrivals.isError && (
              <div className="px-4 py-3 bg-coral/10 border border-coral/20 rounded-xl text-sm text-coral">
                <i className="bi bi-exclamation-circle mr-2" />
                Unable to load departures
              </div>
            )}

            {arrivals.data && arrivals.data.arrivals.length > 0 && (
              <div className="space-y-2">
                {arrivals.data.arrivals.slice(0, 6).map((arrival, idx) => (
                  <div key={idx} className="p-4 bg-white border border-ink/5 rounded-2xl hover:border-teal/20 transition-all animate-in">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-semibold text-ink">{arrival.routeShortName || "Route"}</div>
                        <div className="text-xs text-ink/60 mt-1">{arrival.headsign || "TTC Service"}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-teal">{arrival.minutesAway}</div>
                        <div className="text-xs text-ink/50">min</div>
                      </div>
                    </div>
                    {arrival.delaySeconds !== null && arrival.delaySeconds !== 0 && (
                      <div className="text-xs text-coral">
                        {arrival.delaySeconds > 0 ? "+" : "-"}{Math.abs(Math.round(arrival.delaySeconds / 60))} min
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function RootLayout() {
  return (
    <>
      <Outlet />
    </>
  );
function RootLayout() {
  return (
    <>
      <Outlet />
    </>
  );
}
              <div className="d-flex flex-wrap gap-2 mb-3">
                <span className="signalto-chip signalto-chip-dark">
                  <i className="bi bi-1-circle-fill" aria-hidden="true" />
                  Choose From
                </span>
                <span className="signalto-chip signalto-chip-dark">
                  <i className="bi bi-2-circle-fill" aria-hidden="true" />
                  Choose Destination
                </span>
                <span className="signalto-chip signalto-chip-dark">
                  <i className="bi bi-3-circle-fill" aria-hidden="true" />
                  Click Search
                </span>
              </div>
              <p className="signalto-kicker mb-2">Step By Step</p>
              <h1 className="signalto-display mb-3">Find your next TTC trip.</h1>
              <p className="fs-5 signalto-subtle mb-4">
                Search a From stop and a Destination stop, then click Search to see the next TTC subway, streetcar,
                bus, or rail options for that trip.
              </p>

              <div className="d-flex flex-wrap gap-2">
                <span className="signalto-chip">
                  <i className="bi bi-geo-fill" aria-hidden="true" />
                  {location.label}
                </span>
                <span className="signalto-chip">
                  <i className="bi bi-signpost-split-fill" aria-hidden="true" />
                  {nearbyStops.data ? `${nearbyStops.data.stops.length} nearby stops` : "Loading stops"}
                </span>
                <span className="signalto-chip">
                  <i className="bi bi-heart-pulse-fill" aria-hidden="true" />
                  {health.data?.status === "ok" ? "API healthy" : "Checking API"}
                </span>
              </div>

              {locationError ? (
                <div className="alert alert-danger mt-3 mb-0 rounded-4 border-0 shadow-sm" role="alert">
                  {locationError}
                </div>
              ) : null}
            </div>

            <div className="col-lg-4">
              <div className="signalto-mini-panel h-100 p-4 p-lg-4">
                <div className="signalto-kicker text-white-50 mb-3">Helpful shortcuts</div>
                <div className="d-grid gap-3">
                  <button
                    type="button"
                    onClick={requestBrowserLocation}
                    className="btn btn-light btn-lg rounded-pill px-4 fw-semibold"
                  >
                    <i className="bi bi-crosshair me-2" aria-hidden="true" />
                    {locationStatus === "locating" ? "Finding you..." : "Use my location"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void nearbyStops.refetch();
                    }}
                    className="btn signalto-btn-ghost btn-lg rounded-pill px-4 fw-semibold"
                  >
                    <i className="bi bi-arrow-repeat me-2" aria-hidden="true" />
                    Refresh nearby stops
                  </button>
                  <div className="rounded-4 p-3 border border-light border-opacity-10 bg-white bg-opacity-10">
                    <div className="text-white-50 small">Current preview stop</div>
                    <div className="fw-semibold mt-1">
                      {previewStop?.stopName ?? "Choose a nearby stop to preview departures"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="row g-4 mb-4">
          <div className="col-xl-5">
            <form
              className="signalto-panel p-4 p-lg-4 h-100"
              onSubmit={(event) => {
                event.preventDefault();
                runTripSearch();
              }}
            >
              <SectionHeader
                eyebrow="Trip Search"
                title="Choose your stops"
                description="Search by TTC station or stop name. When both stops are selected, click Search to load the next TTC options."
              />

              <div className="d-grid gap-3">
                <SearchPicker
                  id="origin-search"
                  label="From"
                  placeholder="Search a TTC starting station or stop"
                  value={originInput}
                  selectedStop={draftOrigin}
                  results={originSearch.data?.stops ?? []}
                  isLoading={originSearch.isLoading}
                  isError={originSearch.isError}
                  onChange={handleOriginInputChange}
                  onChooseStop={chooseOriginStop}
                  onClear={clearOriginSelection}
                />

                <div className="d-flex justify-content-center">
                  <button
                    type="button"
                    onClick={swapDraftStops}
                    className="btn signalto-btn-ghost rounded-pill px-4 fw-semibold"
                    disabled={!draftOrigin && !draftDestination}
                  >
                    <i className="bi bi-arrow-down-up me-2" aria-hidden="true" />
                    Swap
                  </button>
                </div>

                <SearchPicker
                  id="destination-search"
                  label="Destination"
                  placeholder="Search your TTC destination station or stop"
                  value={destinationInput}
                  selectedStop={draftDestination}
                  results={destinationSearch.data?.stops ?? []}
                  isLoading={destinationSearch.isLoading}
                  isError={destinationSearch.isError}
                  onChange={handleDestinationInputChange}
                  onChooseStop={chooseDestinationStop}
                  onClear={clearDestinationSelection}
                />
              </div>

              {sameStop(draftOrigin, draftDestination) ? (
                <div className="alert alert-warning rounded-4 border-0 mt-3 mb-0">
                  Choose two different TTC stops or stations before you search.
                </div>
              ) : null}

              <div className="signalto-note p-3 mt-3">
                <div className="signalto-list-label mb-2">Selected trip</div>
                <div className="fw-semibold">
                  {draftOrigin?.stopName ?? "Choose From"} to {draftDestination?.stopName ?? "Choose Destination"}
                </div>
                <div className="small signalto-subtle mt-2">
                  {canSearch
                    ? "Search will show the next upcoming TTC options for this trip."
                    : "Pick two different TTC stops or stations to enable Search."}
                </div>
              </div>

              <div className="d-flex flex-column flex-sm-row gap-3 mt-4">
                <button
                  type="submit"
                  className="btn signalto-btn-primary btn-lg rounded-pill px-4 fw-semibold flex-grow-1"
                  disabled={!canSearch}
                >
                  <i className="bi bi-search me-2" aria-hidden="true" />
                  {searchButtonLabel}
                </button>
                <button
                  type="button"
                  onClick={clearTripSearch}
                  className="btn signalto-btn-ghost btn-lg rounded-pill px-4 fw-semibold"
                >
                  <i className="bi bi-x-circle me-2" aria-hidden="true" />
                  Clear
                </button>
              </div>
            </form>
          </div>

          <div className="col-xl-7">
            <div className="signalto-panel p-4 p-lg-4 h-100">
              <SectionHeader
                eyebrow="Search Results"
                title="Upcoming TTC options"
                description="After you click Search, this panel shows the next direct TTC rides first and transfer options after that."
                action={
                  tripResults ? (
                    <span className="signalto-pill">
                      <i className="bi bi-clock-history" aria-hidden="true" />
                      Updated {formatTimestamp(tripResults.generatedAt)}
                    </span>
                  ) : null
                }
              />

              {!hasTripSearch ? (
                <div className="signalto-note p-4 signalto-subtle">
                  Search results will appear here after you choose a From stop, a Destination stop, and click Search.
                </div>
              ) : commuteEvaluation.isLoading ? (
                <div className="signalto-note p-4 signalto-subtle">Loading upcoming TTC options...</div>
              ) : commuteEvaluation.isError ? (
                <div className="alert alert-danger rounded-4 border-0 mb-0">{commuteErrorMessage}</div>
              ) : !tripResults ? (
                <div className="signalto-note p-4 signalto-subtle">Search results are not ready yet. Try Search again.</div>
              ) : (
                <>
                  <div className={`${commutePresentation.className} p-4 p-lg-4 mb-4`}>
                    <div className="d-flex flex-column flex-lg-row align-items-lg-start justify-content-between gap-3">
                      <div>
                        <div className="signalto-kicker text-white-50">Search result</div>
                        <h3 className="h2 fw-bold mt-2 mb-2">{tripResults.recommendation.headline}</h3>
                        <p className="mb-2 text-white-50">{tripResults.recommendation.detail}</p>
                        {tripResults.recommendation.backupDetail ? (
                          <p className="mb-0 text-white-50">{tripResults.recommendation.backupDetail}</p>
                        ) : null}
                      </div>
                      <div className="display-6 flex-shrink-0">
                        <i className={commutePresentation.icon} aria-hidden="true" />
                      </div>
                    </div>
                  </div>

                  <div className="row g-3 mb-4">
                    <div className="col-md-6">
                      <div className="signalto-note p-3 h-100">
                        <div className="signalto-list-label mb-1">From</div>
                        <div className="fw-semibold">{tripResults.originStop.stopName}</div>
                        <div className="small signalto-subtle mt-1">
                          {tripResults.originStop.stopCode ? `Stop ${tripResults.originStop.stopCode}` : tripResults.originStop.stopId}
                        </div>
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="signalto-note p-3 h-100">
                        <div className="signalto-list-label mb-1">Destination</div>
                        <div className="fw-semibold">{tripResults.destinationStop.stopName}</div>
                        <div className="small signalto-subtle mt-1">
                          {tripResults.destinationStop.stopCode
                            ? `Stop ${tripResults.destinationStop.stopCode}`
                            : tripResults.destinationStop.stopId}
                        </div>
                      </div>
                    </div>
                    <div className="col-12">
                      <div className="signalto-note p-3">
                        <div className="d-flex flex-wrap gap-2 mb-3">
                          {commuteConfidence ? (
                            <span className={commuteConfidence.className}>
                              <i className={commuteConfidence.icon} aria-hidden="true" />
                              {tripResults.confidence.score}/100
                            </span>
                          ) : null}
                          <span className="signalto-pill teal">
                            <i className="bi bi-diagram-2-fill" aria-hidden="true" />
                            {tripResults.totalOptions} direct found
                          </span>
                          <span className="signalto-pill">
                            <i className="bi bi-shuffle" aria-hidden="true" />
                            {tripResults.totalTransferOptions} transfer found
                          </span>
                        </div>
                        <ul className="small signalto-subtle ps-3 mb-0">
                          {tripResults.confidence.reasons.map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>

                  {directOptions.length ? (
                    <>
                      <div className="signalto-list-label mb-3">Direct TTC options</div>
                      <div className="d-grid gap-3">
                        {directOptions.map((option, index) => (
                          <DirectRideCard
                            key={`${option.tripId ?? option.routeId ?? index}-${option.departureTime ?? index}`}
                            option={option}
                            index={index}
                          />
                        ))}
                      </div>
                    </>
                  ) : null}

                  {transferOptions.length ? (
                    <>
                      <div className={`signalto-list-label mb-3 ${directOptions.length ? "mt-4" : ""}`}>
                        Transfer options
                      </div>
                      <div className="d-grid gap-3">
                        {transferOptions.map((option, index) => (
                          <TransferOptionCard
                            key={`${option.firstLeg.tripId ?? "first"}-${option.secondLeg.tripId ?? "second"}-${option.transferStop.stopId}`}
                            option={option}
                            index={index}
                          />
                        ))}
                      </div>
                    </>
                  ) : null}

                  {!directOptions.length && !transferOptions.length ? (
                    <div className="signalto-note p-4 signalto-subtle">
                      No upcoming TTC option is visible for this stop pair right now. Try another nearby stop or search
                      again in a moment.
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </section>

        <section className="row g-4">
          <div className="col-xl-5">
            <div className="signalto-panel p-4 p-lg-4 h-100">
              <SectionHeader
                eyebrow="Nearby Stops"
                title="Quick picks near you"
                description="If you do not know the stop name, you can pick a nearby stop and use it as your From or Destination."
              />

              <div className="signalto-scroll d-grid gap-3">
                {nearbyStops.isLoading ? (
                  <div className="signalto-note p-4 signalto-subtle">Loading nearby TTC stops...</div>
                ) : nearbyStops.isError ? (
                  <div className="alert alert-danger rounded-4 border-0 mb-0">
                    Unable to load nearby TTC stops right now.
                  </div>
                ) : (
                  nearbyStops.data?.stops.map((stop) => (
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
                          onClick={() => setSelectedStopId(stop.stopId)}
                        >
                          Preview
                        </button>
                      </div>
                      <div className="d-flex flex-wrap gap-2 mt-3">
                        <button
                          type="button"
                          className="btn btn-sm signalto-btn-primary rounded-pill px-3"
                          onClick={() => chooseOriginStop(stop)}
                        >
                          Use as From
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm signalto-btn-ghost rounded-pill px-3"
                          onClick={() => chooseDestinationStop(stop)}
                        >
                          Use as Destination
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <div className="col-xl-7">
            <div className="signalto-panel p-4 p-lg-4 h-100">
              <SectionHeader
                eyebrow="Live Departures"
                title={previewStop ? previewStop.stopName : "Pick a stop to preview departures"}
                description="This shows the next TTC departures for the stop you preview, so you can confirm you picked the right location."
                action={
                  previewStop ? (
                    <span className="signalto-pill teal">
                      <i className="bi bi-broadcast" aria-hidden="true" />
                      {arrivals.data ? `${arrivals.data.totalArrivals} departures` : "Loading"}
                    </span>
                  ) : null
                }
              />
              {!selectedStopId ? (
                <div className="signalto-note p-4 signalto-subtle">
                  Choose a nearby stop or a search result to preview upcoming TTC departures.
                </div>
              ) : arrivals.isLoading ? (
                <div className="signalto-note p-4 signalto-subtle">Loading live departures...</div>
              ) : arrivals.isError ? (
                <div className="alert alert-danger rounded-4 border-0 mb-0">
                  Unable to load stop departures right now.
                </div>
              ) : (
                <>
                  <div className="signalto-arrival-summary p-4 p-lg-4 mb-4">
                    <div className="row g-4 align-items-center">
                      <div className="col-md-8">
                        <div className="signalto-kicker text-white-50">Preview stop</div>
                        <h3 className="h2 fw-bold mt-2 mb-2">{arrivals.data?.stop.stopName}</h3>
                        <p className="mb-3 text-white-50">
                          {arrivals.data?.stop.stopCode ? `Stop ${arrivals.data.stop.stopCode}` : arrivals.data?.stop.stopId}
                        </p>
                        <div className="d-flex flex-wrap gap-2">
                          <span className="badge rounded-pill text-bg-light px-3 py-2">
                            {formatWheelchair(arrivals.data?.stop.wheelchairBoarding ?? "unknown")}
                          </span>
                          <span className="badge rounded-pill text-bg-light px-3 py-2">
                            Updated {formatTimestamp(arrivals.data?.generatedAt)}
                          </span>
                        </div>
                      </div>
                      <div className="col-md-4">
                        <div className="rounded-4 bg-white bg-opacity-10 p-4 border border-light border-opacity-10 text-md-end">
                          <div className="signalto-kicker text-white-50">Departures now</div>
                          <div className="display-6 fw-bold mt-2 mb-0">{arrivals.data?.totalArrivals ?? 0}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {arrivals.data?.arrivals.length ? (
                    <div className="d-grid gap-3">
                      {arrivals.data.arrivals.map((arrival, index) => (
                        <article
                          key={`${arrival.tripId ?? "trip"}-${arrival.routeId ?? "route"}-${arrival.predictedDepartureTime ?? index}`}
                          className="signalto-arrival-card p-4"
                        >
                          <div className="d-flex flex-column flex-lg-row align-items-lg-start justify-content-between gap-3">
                            <div className="flex-grow-1">
                              <div className="d-flex flex-wrap gap-2 mb-3">
                                <span className="signalto-pill teal">
                                  <i className="bi bi-signpost-split" aria-hidden="true" />
                                  {titleCase(arrival.routeTypeLabel)}
                                </span>
                                <span className="signalto-pill">
                                  <i className="bi bi-badge-4k" aria-hidden="true" />
                                  {arrival.routeShortName ?? "Route"}
                                </span>
                              </div>
                              <h3 className="h4 fw-bold mb-2">
                                {arrival.routeLongName ?? arrival.headsign ?? "TTC service"}
                              </h3>
                              <p className="signalto-subtle mb-0">
                                {arrival.headsign ?? "Headsign unavailable"} - {formatDelay(arrival.delaySeconds)}
                              </p>
                            </div>
                            <div className="signalto-arrival-eta px-3 py-3">
                              <span className="signalto-arrival-number">{arrival.minutesAway}</span>
                              <span className="small text-uppercase text-body-secondary">min</span>
                            </div>
                          </div>

                          <div className="row g-3 mt-2 small">
                            <div className="col-sm-6">
                              <div className="signalto-note p-3 h-100">
                                <div className="signalto-list-label mb-1">Predicted</div>
                                {formatTimestamp(arrival.predictedDepartureTime)}
                              </div>
                            </div>
                            <div className="col-sm-6">
                              <div className="signalto-note p-3 h-100">
                                <div className="signalto-list-label mb-1">Scheduled</div>
                                {formatTimestamp(arrival.scheduledDepartureTime)}
                              </div>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="signalto-note p-4 signalto-subtle">
                      No live TTC departures are currently available for this stop.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </section>

        <div className="signalto-footer-space" />
      </main>
    </div>
  );
}

function RootLayout() {
  return (
    <>
      <Outlet />
    </>
  );
}

const rootRoute = createRootRoute({
  component: RootLayout
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardPage
});

const routeTree = rootRoute.addChildren([indexRoute]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent"
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function AppRouter() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

