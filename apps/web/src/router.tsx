import { useDeferredValue, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { api, geocodeAddress, type TtcAlert, type TtcCommuteEvaluationResponse, type TtcStop, type TtcTransferCommuteOption } from "./lib/api";
import { usePersistedState } from "./lib/use-persisted-state";
import { SearchInput } from "./components/search-input";
import { RecommendationCard } from "./components/recommendation-card";
import { DepartureCard } from "./components/departure-card";
import { NearbyStops } from "./components/nearby-stops";
import { SectionHeader } from "./components/section-header";
import { DirectRideCard, TransferOptionCard } from "./components/trip-option-cards";
import { SwipeableCard } from "./components/swipeable-card";
import { LiveVehicleMap } from "./components/live-vehicle-map";
import { formatTimestamp, formatDistance, formatDelay, titleCase, formatWheelchair } from "./lib/format-utils";
import { recommendationPresentation, confidencePresentation } from "./lib/presentation-utils";

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

function sameStop(left: TtcStop | null, right: TtcStop | null) {
  return Boolean(left && right && left.stopId === right.stopId);
}

type AlertsListProps = { alerts: TtcAlert[]; isLoading: boolean; isError: boolean };

function AlertsList({ alerts, isLoading, isError }: AlertsListProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (isLoading) {
    return <div className="signalto-note p-3 signalto-subtle small">Checking for alerts…</div>;
  }
  if (isError) {
    return <div className="alert alert-danger rounded-4 border-0 mb-0 small">Unable to load alerts.</div>;
  }
  if (!alerts.length) {
    return (
      <div className="d-flex align-items-center gap-2 signalto-note p-3" style={{ color: "#0f5b52" }}>
        <i className="bi bi-check-circle-fill" aria-hidden="true" />
        <span className="small fw-semibold">All systems running normally</span>
      </div>
    );
  }

  const effectIcon: Record<string, string> = {
    DETOUR: "bi-sign-turn-right",
    REDUCED_SERVICE: "bi-dash-circle",
    SIGNIFICANT_DELAYS: "bi-hourglass-split",
    STOP_MOVED: "bi-geo",
    NO_SERVICE: "bi-x-octagon",
    OTHER_EFFECT: "bi-exclamation-circle",
    UNKNOWN_EFFECT: "bi-question-circle"
  };

  return (
    <div style={{ borderRadius: "0.85rem", overflow: "hidden", border: "1px solid rgba(16,34,51,0.08)", maxHeight: "22rem", overflowY: "auto" }}>
      {alerts.map((alert) => {
        const isOpen = openId === alert.id;
        const iconClass = effectIcon[alert.effect] ?? "bi-exclamation-circle";
        const routeList = alert.routes.slice(0, 5).join(", ");
        const moreRoutes = alert.routes.length > 5 ? ` +${alert.routes.length - 5} more` : "";
        return (
          <div
            key={alert.id}
            style={{
              borderBottom: "1px solid rgba(16,34,51,0.07)",
              background: isOpen ? "rgba(231,112,73,0.04)" : "transparent",
              transition: "background 0.18s"
            }}
          >
            <button
              onClick={() => setOpenId(isOpen ? null : alert.id)}
              style={{
                all: "unset",
                display: "flex",
                alignItems: "flex-start",
                width: "100%",
                padding: "0.6rem 0.9rem",
                cursor: "pointer",
                gap: "0.65rem",
                boxSizing: "border-box"
              }}
              aria-expanded={isOpen}
            >
              <i
                className={`bi ${iconClass}`}
                style={{ color: "#e77049", fontSize: "0.9rem", marginTop: "0.1rem", flexShrink: 0 }}
                aria-hidden="true"
              />
              <span style={{ flex: 1, fontSize: "0.83rem", fontWeight: 500, lineHeight: 1.35, color: "var(--signalto-ink)", textAlign: "left" }}>
                {alert.headerText}
                {routeList && (
                  <span style={{ display: "block", fontSize: "0.71rem", color: "#999", marginTop: "2px", fontWeight: 400 }}>
                    Routes: {routeList}{moreRoutes}
                  </span>
                )}
              </span>
              <i
                className={`bi bi-chevron-${isOpen ? "up" : "down"}`}
                style={{ fontSize: "0.68rem", color: "#bbb", flexShrink: 0, marginTop: "0.2rem" }}
                aria-hidden="true"
              />
            </button>
            {isOpen && alert.descriptionText && (
              <div style={{ padding: "0 0.9rem 0.75rem 2.3rem", fontSize: "0.78rem", color: "#555", lineHeight: 1.55 }}>
                {alert.descriptionText}
              </div>
            )}
          </div>
        );
      })}
    </div>
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

  const ttcAlerts = useQuery({
    queryKey: ["ttc-alerts"],
    queryFn: api.getTtcAlerts,
    refetchInterval: 60_000,
    staleTime: 30_000
  });

  // Stops near the chosen origin — used as live destination suggestions
  const stopsNearOrigin = useQuery({
    queryKey: ["ttc-stops-near-origin", draftOrigin?.stopId],
    queryFn: () =>
      api.getNearbyTtcStops({
        lat: draftOrigin!.latitude,
        lon: draftOrigin!.longitude,
        radius: 1500,
        limit: 10
      }),
    enabled: Boolean(draftOrigin),
    staleTime: 300_000
  });

  // Destination suggestions: stops near origin (minus origin itself), or user's nearby stops as fallback
  const destinationSuggestions = draftOrigin
    ? (stopsNearOrigin.data?.stops ?? []).filter((s) => s.stopId !== draftOrigin.stopId)
    : (nearbyStops.data?.stops ?? []);
  const destinationSuggestionsLabel = draftOrigin
    ? `Stops reachable from ${draftOrigin.stopName}`
    : "Nearby stops";

  // When TTC stop search returns 0 matches, fall back to address geocoding
  const originHasNoStopResults =
    deferredOriginQuery.length >= 3 && !originSearch.isLoading && (originSearch.data?.totalMatches ?? -1) === 0;
  const destinationHasNoStopResults =
    deferredDestinationQuery.length >= 3 && !destinationSearch.isLoading && (destinationSearch.data?.totalMatches ?? -1) === 0;

  const originGeocode = useQuery({
    queryKey: ["geocode-origin", deferredOriginQuery],
    queryFn: () => geocodeAddress(deferredOriginQuery),
    enabled: originHasNoStopResults,
    staleTime: 600_000
  });

  const destinationGeocode = useQuery({
    queryKey: ["geocode-destination", deferredDestinationQuery],
    queryFn: () => geocodeAddress(deferredDestinationQuery),
    enabled: destinationHasNoStopResults,
    staleTime: 600_000
  });

  const originGeocodeStops = useQuery({
    queryKey: ["stops-near-geocode-origin", originGeocode.data?.[0]?.lat, originGeocode.data?.[0]?.lon],
    queryFn: () =>
      api.getNearbyTtcStops({ lat: originGeocode.data![0].lat, lon: originGeocode.data![0].lon, radius: 500, limit: 5 }),
    enabled: Boolean(originGeocode.data?.[0]),
    staleTime: 300_000
  });

  const destinationGeocodeStops = useQuery({
    queryKey: ["stops-near-geocode-destination", destinationGeocode.data?.[0]?.lat, destinationGeocode.data?.[0]?.lon],
    queryFn: () =>
      api.getNearbyTtcStops({
        lat: destinationGeocode.data![0].lat,
        lon: destinationGeocode.data![0].lon,
        radius: 500,
        limit: 5
      }),
    enabled: Boolean(destinationGeocode.data?.[0]),
    staleTime: 300_000
  });

  // Blended search results: prefer direct TTC stop matches, fall back to geocoded nearby stops
  const originResults =
    (originSearch.data?.stops.length ?? 0) > 0
      ? (originSearch.data?.stops ?? [])
      : (originGeocodeStops.data?.stops ?? []);
  const destinationResults =
    (destinationSearch.data?.stops.length ?? 0) > 0
      ? (destinationSearch.data?.stops ?? [])
      : (destinationGeocodeStops.data?.stops ?? []);

  const originResultsLabel =
    (originGeocodeStops.data?.stops.length ?? 0) > 0 && !(originSearch.data?.stops.length)
      ? `Nearest TTC stops to "${originGeocode.data?.[0]?.displayName?.split(",")[0] ?? deferredOriginQuery}"`
      : undefined;
  const destinationResultsLabel =
    (destinationGeocodeStops.data?.stops.length ?? 0) > 0 && !(destinationSearch.data?.stops.length)
      ? `Nearest TTC stops to "${destinationGeocode.data?.[0]?.displayName?.split(",")[0] ?? deferredDestinationQuery}"`
      : undefined;

  // Arrivals specifically for the From stop — used for 1-min departure alerts
  const originArrivals = useQuery({
    queryKey: ["ttc-origin-arrivals", originStop?.stopId],
    queryFn: () => api.getTtcStopArrivals(originStop!.stopId),
    enabled: Boolean(originStop),
    refetchInterval: 20_000
  });

  // Track which trip IDs we've already notified so we don't spam
  const notifiedTripsRef = useRef(new Set<string>());
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );

  async function requestNotifPermission() {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setNotifPermission(result);
  }

  // Fire a browser notification when a departure at the From stop is ≤ 1 min away
  useEffect(() => {
    if (!originStop || !originArrivals.data || notifPermission !== "granted") return;
    for (const arrival of originArrivals.data.arrivals) {
      if (arrival.minutesAway > 1) continue;
      const key = `${arrival.tripId ?? arrival.routeId ?? ""}-${arrival.predictedDepartureTime ?? arrival.scheduledDepartureTime ?? ""}`;
      if (notifiedTripsRef.current.has(key)) continue;
      notifiedTripsRef.current.add(key);
      const route = arrival.routeShortName ?? arrival.routeId ?? "TTC";
      const headsign = arrival.headsign ?? arrival.routeLongName ?? "";
      const eta = arrival.minutesAway === 0 ? "arriving now" : "1 min away";
      new Notification(`Route ${route} — ${eta}`, {
        body: `${headsign ? `${headsign} · ` : ""}Departing from ${originStop.stopName}`,
        icon: "/favicon.ico",
        tag: key
      });
    }
  }, [originArrivals.data, originStop, notifPermission]);

  useEffect(() => {
    if (!selectedStopId) {
      setSelectedStopId(originStop?.stopId ?? nearbyStops.data?.stops[0]?.stopId ?? null);
    }
  }, [nearbyStops.data, originStop, selectedStopId]);

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
    // Auto-trigger trip search if destination is already set
    if (draftDestination && !sameStop(stop, draftDestination)) {
      setOriginStop(stop);
      setDestinationStop(draftDestination);
    }
  }

  function chooseDestinationStop(stop: TtcStop) {
    setDraftDestination(stop);
    setDestinationInput(stop.stopName);
    setSelectedStopId(stop.stopId);
    // Auto-trigger trip search if origin is already set
    if (draftOrigin && !sameStop(draftOrigin, stop)) {
      setOriginStop(draftOrigin);
      setDestinationStop(stop);
    }
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
    <div className="container p-3 p-lg-4">
      <section className="row g-3 mb-3">
        <div className="col-lg-6">
          <div className="signalto-panel p-4 h-100">
            <SectionHeader
              eyebrow="Trip Search"
              title="Plan your trip"
            />

            <form
              className="d-grid gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                runTripSearch();
              }}
            >
              <SearchInput
                id="origin-search"
                label="From"
                placeholder="Address, stop name, or route number"
                value={originInput}
                selectedStop={draftOrigin}
                results={originResults}
                isLoading={originSearch.isLoading || originGeocode.isLoading || originGeocodeStops.isLoading}
                isError={originSearch.isError}
                onChange={handleOriginInputChange}
                onChooseStop={chooseOriginStop}
                onClear={clearOriginSelection}
                suggestions={nearbyStops.data?.stops ?? []}
                suggestionsLabel={locationStatus === "ready" ? "Nearby stops · Your location" : "Nearby stops"}
                resultsLabel={originResultsLabel}
                locationShortcut={
                  nearbyStops.data?.stops[0]
                    ? { label: nearbyStops.data.stops[0].stopName, stop: nearbyStops.data.stops[0] }
                    : null
                }
              />

              <div className="d-flex justify-content-center my-1">
                <button
                  type="button"
                  onClick={swapDraftStops}
                  className="btn signalto-btn-ghost rounded-pill px-3 py-1 small fw-semibold"
                  disabled={!draftOrigin && !draftDestination}
                >
                  <i className="bi bi-arrow-down-up me-2" aria-hidden="true" />
                  Swap
                </button>
              </div>

              <SearchInput
                id="destination-search"
                label="Destination"
                placeholder="Address, stop name, or route number"
                value={destinationInput}
                selectedStop={draftDestination}
                results={destinationResults}
                isLoading={destinationSearch.isLoading || destinationGeocode.isLoading || destinationGeocodeStops.isLoading}
                isError={destinationSearch.isError}
                onChange={handleDestinationInputChange}
                onChooseStop={chooseDestinationStop}
                onClear={clearDestinationSelection}
                suggestions={destinationSuggestions}
                suggestionsLabel={destinationSuggestionsLabel}
                resultsLabel={destinationResultsLabel}
              />

              {sameStop(draftOrigin, draftDestination) ? (
                <div className="alert alert-warning rounded-4 border-0 mb-0">
                  Choose two different TTC stops or stations before you search.
                </div>
              ) : null}

              <div className="d-flex flex-column flex-sm-row gap-2 mt-2">
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

              {/* Notification opt-in — only show when a From stop is picked */}
              {originStop && (
                <div
                  className="d-flex align-items-center justify-content-between gap-2 rounded-3 px-3 py-2 mt-1"
                  style={{
                    background: notifPermission === "granted" ? "rgba(15,91,82,0.07)" : "rgba(231,112,73,0.07)",
                    fontSize: "0.8rem"
                  }}
                >
                  <span style={{ color: notifPermission === "granted" ? "#0f5b52" : "#c45a2a", fontWeight: 500 }}>
                    <i className={`bi bi-bell${notifPermission === "granted" ? "-fill" : ""} me-2`} aria-hidden="true" />
                    {notifPermission === "granted"
                      ? `Alerts on for ${originStop.stopName}`
                      : notifPermission === "denied"
                      ? "Notifications blocked by browser"
                      : "Get notified 1 min before departure"}
                  </span>
                  {notifPermission === "default" && (
                    <button
                      type="button"
                      onClick={requestNotifPermission}
                      className="btn btn-sm rounded-pill px-3 fw-semibold"
                      style={{ background: "#e77049", color: "#fff", fontSize: "0.75rem", border: "none" }}
                    >
                      Enable
                    </button>
                  )}
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Service alerts — fills the empty col-lg-6 beside trip search */}
        <div className="col-lg-6">
          <div className="signalto-panel p-4 h-100">
            <SectionHeader
              eyebrow="Service Alerts"
              title="Live disruptions"
              action={
                ttcAlerts.data && ttcAlerts.data.totalAlerts > 0 ? (
                  <span className="signalto-pill" style={{ background: "#e77049", color: "#fff", borderColor: "transparent" }}>
                    <i className="bi bi-exclamation-triangle me-1" aria-hidden="true" />
                    {ttcAlerts.data.totalAlerts}
                  </span>
                ) : null
              }
            />
            <AlertsList
              alerts={ttcAlerts.data?.alerts ?? []}
              isLoading={ttcAlerts.isLoading}
              isError={ttcAlerts.isError}
            />
          </div>
        </div>
      </section>

      <section className="row g-3 mb-3">
        <div className="col-xl-7">
          <div className="signalto-panel p-4 h-100">
            <SectionHeader
              eyebrow="Results"
              title="Upcoming options"
              action={
                tripResults ? (
                  <span className="signalto-pill">
                    <i className="bi bi-clock-history" aria-hidden="true" />
                    {formatTimestamp(tripResults.generatedAt)}
                  </span>
                ) : null
              }
            />

            {!hasTripSearch ? (
              <div className="signalto-note p-3 signalto-subtle small">
                Choose a From stop and a Destination, then click Search.
              </div>
            ) : commuteEvaluation.isLoading ? (
              <div className="signalto-note p-4 signalto-subtle">Loading upcoming TTC options...</div>
            ) : commuteEvaluation.isError ? (
              <div className="alert alert-danger rounded-4 border-0 mb-0">{commuteErrorMessage}</div>
            ) : !tripResults ? (
              <div className="signalto-note p-4 signalto-subtle">Search results are not ready yet. Try Search again.</div>
            ) : (
              <>
                <div className={`${commutePresentation.className} p-3 mb-3`}>
                  <div className="d-flex align-items-center justify-content-between gap-3">
                    <div>
                      <h3 className="h5 fw-bold mb-1">{tripResults.recommendation.headline}</h3>
                      <p className="mb-0 text-white-50 small">{tripResults.recommendation.detail}</p>
                    </div>
                    <div className="fs-3 flex-shrink-0">
                      <i className={commutePresentation.icon} aria-hidden="true" />
                    </div>
                  </div>
                </div>

                {directOptions.length ? (
                  <>
                    <div className="signalto-list-label mb-3">Direct TTC options</div>
                    <SwipeableCard
                      title={`${directOptions.length} direct option${directOptions.length !== 1 ? "s" : ""} available`}
                    >
                      {directOptions.map((option, index) => (
                        <DirectRideCard
                          key={`${option.tripId ?? option.routeId ?? index}-${option.departureTime ?? index}`}
                          option={option}
                          index={index}
                        />
                      ))}
                    </SwipeableCard>
                  </>
                ) : null}

                {transferOptions.length ? (
                  <>
                    <div className={`signalto-list-label mb-3 ${directOptions.length ? "mt-4" : ""}`}>
                      Transfer options
                    </div>
                    <SwipeableCard
                      title={`${transferOptions.length} transfer option${transferOptions.length !== 1 ? "s" : ""} available`}
                    >
                      {transferOptions.map((option, index) => (
                        <TransferOptionCard
                          key={`${option.firstLeg.tripId ?? "first"}-${option.secondLeg.tripId ?? "second"}-${option.transferStop.stopId}`}
                          option={option}
                          index={index}
                        />
                      ))}
                    </SwipeableCard>
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

        <div className="col-xl-5">
          <div className="signalto-panel p-4 h-100">
            <SectionHeader
              eyebrow="Nearby"
              title="Stops near you"
              action={
                <button
                  type="button"
                  onClick={requestBrowserLocation}
                  className="btn signalto-btn-ghost btn-sm rounded-pill px-3 fw-semibold"
                >
                  <i className="bi bi-crosshair me-1" aria-hidden="true" />
                  {locationStatus === "locating" ? "Locating…" : "My location"}
                </button>
              }
            />

            <NearbyStops
              stops={nearbyStops.data?.stops ?? []}
              isLoading={nearbyStops.isLoading}
              isError={nearbyStops.isError}
              onPreview={setSelectedStopId}
              onUseAsFrom={chooseOriginStop}
              onUseAsDestination={chooseDestinationStop}
            />
          </div>
        </div>
      </section>

      <section className="row g-3 mb-3">
        <div className="col-12">
          <div className="signalto-panel p-4">
            <SectionHeader
              eyebrow="Live Departures"
              title={previewStop ? previewStop.stopName : "Pick a stop"}
              action={
                arrivals.data ? (
                  <span className="signalto-pill teal">
                    <i className="bi bi-broadcast me-1" aria-hidden="true" />
                    {arrivals.data.totalArrivals} departures
                  </span>
                ) : null
              }
            />
            {!selectedStopId ? (
              <div className="signalto-note p-4 signalto-subtle">
                Choose a nearby stop or a search result to preview upcoming TTC departures.
              </div>
            ) : arrivals.isLoading ? (
              <div className="signalto-note p-3 signalto-subtle small">Loading live departures…</div>
            ) : arrivals.isError ? (
              <div className="alert alert-danger rounded-4 border-0 mb-0">
                Unable to load stop departures right now.
              </div>
            ) : (
              <>
                {arrivals.data?.arrivals.length ? (
                  <DepartureCard
                    arrivals={arrivals.data}
                    isLoading={arrivals.isLoading}
                    isError={arrivals.isError}
                  />
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

      <section className="row g-3 mb-3">
        <div className="col-12">
          <div className="signalto-panel p-4">
            <SectionHeader
              eyebrow="Live Map"
              title="Vehicle tracking"
            />
            <LiveVehicleMap
              originStop={originStop}
              destinationStop={destinationStop}
              focusRouteIds={
                tripResults
                  ? new Set([
                      ...directOptions.map((o) => o.routeId).filter(Boolean) as string[],
                      ...transferOptions.flatMap((o) => [
                        o.firstLeg.routeId,
                        o.secondLeg.routeId
                      ]).filter(Boolean) as string[]
                    ])
                  : undefined
              }
              focusTripIds={
                tripResults
                  ? new Set([
                      ...directOptions.map((o) => o.tripId).filter(Boolean) as string[],
                      ...transferOptions.flatMap((o) => [
                        o.firstLeg.tripId,
                        o.secondLeg.tripId
                      ]).filter(Boolean) as string[]
                    ])
                  : undefined
              }
            />
          </div>
        </div>
      </section>

      <div className="signalto-footer-space" />
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

