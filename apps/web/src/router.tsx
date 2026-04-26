import { useEffect, useRef, useState } from "react";
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { api, type TtcAlert, type TtcStop } from "./lib/api";
import { usePersistedState } from "./lib/use-persisted-state";
import { DepartureCard } from "./components/departure-card";
import { NearbyStops } from "./components/nearby-stops";
import { SectionHeader } from "./components/section-header";
import { LiveVehicleMap } from "./components/live-vehicle-map";
import { JourneyPlanPanel } from "./components/journey-plan-panel";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000
    }
  }
});

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
  // Resolved stops from JourneyPlanPanel — used for notifications + map
  const [originStop, setOriginStop] = usePersistedState<TtcStop | null>("signalto.trip-search.origin", null);
  const [destinationStop, setDestinationStop] = usePersistedState<TtcStop | null>(
    "signalto.trip-search.destination",
    null
  );
  // Preset stops pushed in from NearbyStops "Use as From/Destination"
  const [presetOriginStop, setPresetOriginStop] = useState<TtcStop | null>(null);
  const [presetDestinationStop, setPresetDestinationStop] = useState<TtcStop | null>(null);

  const nearbyStops = useQuery({
    queryKey: ["ttc-nearby-stops", location.latitude, location.longitude],
    queryFn: () => api.getNearbyTtcStops({ lat: location.latitude, lon: location.longitude, radius: 900, limit: 8 }),
    staleTime: 300_000
  });

  const arrivals = useQuery({
    queryKey: ["ttc-stop-arrivals", selectedStopId],
    queryFn: () => api.getTtcStopArrivals(selectedStopId!),
    enabled: Boolean(selectedStopId),
    refetchInterval: 20_000
  });

  const ttcAlerts = useQuery({
    queryKey: ["ttc-alerts"],
    queryFn: api.getTtcAlerts,
    refetchInterval: 60_000,
    staleTime: 30_000
  });

  // Arrivals for origin stop — used for 1-min departure notifications
  const originArrivals = useQuery({
    queryKey: ["ttc-origin-arrivals", originStop?.stopId],
    queryFn: () => api.getTtcStopArrivals(originStop!.stopId),
    enabled: Boolean(originStop),
    refetchInterval: 20_000
  });

  const notifiedTripsRef = useRef(new Set<string>());
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );

  async function requestNotifPermission() {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setNotifPermission(result);
  }

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
    if (navigator.geolocation) {
      requestBrowserLocation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedStopId) {
      setSelectedStopId(originStop?.stopId ?? nearbyStops.data?.stops[0]?.stopId ?? null);
    }
  }, [nearbyStops.data, originStop, selectedStopId]);

  const previewStop =
    arrivals.data?.stop ??
    nearbyStops.data?.stops.find((stop) => stop.stopId === selectedStopId) ??
    null;

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
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    );
  }

  function handleStopsResolved(from: TtcStop | null, to: TtcStop | null) {
    setOriginStop(from);
    setDestinationStop(to);
    if (from) setSelectedStopId(from.stopId);
  }

  return (
    <div className="container p-3 p-lg-4">
      {/* ── Trip Planner (full-width) ── */}
      <section className="row g-3 mb-3">
        <div className="col-12">
          <JourneyPlanPanel
            presetOriginStop={presetOriginStop ?? undefined}
            presetDestinationStop={presetDestinationStop ?? undefined}
            onStopsResolved={handleStopsResolved}
            locationLabel={locationStatus === "ready" ? "Your live location" : undefined}
            userNearbyStops={nearbyStops.data?.stops ?? []}
            onUseMyLocation={requestBrowserLocation}
          />
        </div>
      </section>

      {/* ── Service Alerts ── */}
      <section className="row g-3 mb-3">
        <div className="col-12">
          <div className="signalto-panel p-4">
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

      {/* ── Nearby Stops + Notification bar ── */}
      <section className="row g-3 mb-3">
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
              onUseAsFrom={(stop) => setPresetOriginStop(stop)}
              onUseAsDestination={(stop) => setPresetDestinationStop(stop)}
            />
          </div>
        </div>

        <div className="col-xl-7">
          <div className="signalto-panel p-4 h-100">
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

            {/* Notification opt-in */}
            {originStop && (
              <div
                className="d-flex align-items-center justify-content-between gap-2 rounded-3 px-3 py-2 mb-3"
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

            {!selectedStopId ? (
              <div className="signalto-note p-4 signalto-subtle">
                Choose a nearby stop or search result to preview upcoming TTC departures.
              </div>
            ) : arrivals.isLoading ? (
              <div className="signalto-note p-3 signalto-subtle small">Loading live departures…</div>
            ) : arrivals.isError ? (
              <div className="alert alert-danger rounded-4 border-0 mb-0">
                Unable to load stop departures right now.
              </div>
            ) : arrivals.data?.arrivals.length ? (
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
          </div>
        </div>
      </section>

      {/* ── Live Map ── */}
      <section className="row g-3 mb-3">
        <div className="col-12">
          <div className="signalto-panel p-4">
            <SectionHeader eyebrow="Live Map" title="Vehicle tracking" />
            <LiveVehicleMap
              originStop={originStop}
              destinationStop={destinationStop}
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

