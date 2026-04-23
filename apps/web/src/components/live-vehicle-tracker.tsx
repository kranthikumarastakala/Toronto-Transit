import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function LiveVehicleTracker() {
  const vehicleSummary = useQuery({
    queryKey: ["ttc-vehicles-live"],
    queryFn: api.getTtcVehicleSummary,
    refetchInterval: 5000, // Update every 5 seconds
    staleTime: 2000
  });

  if (vehicleSummary.isLoading) {
    return (
      <div className="p-4 text-center signalto-subtle">
        <i className="bi bi-hourglass-split animate-spin text-2xl mb-3 d-block" />
        Loading live vehicle data...
      </div>
    );
  }

  if (vehicleSummary.isError) {
    return (
      <div className="alert alert-danger rounded-4 border-0 mb-0">
        <i className="bi bi-exclamation-circle me-2" />
        Unable to load live vehicle tracking
      </div>
    );
  }

  const data = vehicleSummary.data;
  if (!data) return null;

  return (
    <div className="d-flex flex-column gap-3">
      {/* Summary Stats */}
      <div className="row g-3">
        <div className="col-sm-4">
          <div className="signalto-note p-3 text-center">
            <div className="signalto-list-label mb-2">Active Vehicles</div>
            <div className="display-6 fw-bold text-teal">{data.totalVehicles}</div>
          </div>
        </div>
        <div className="col-sm-4">
          <div className="signalto-note p-3 text-center">
            <div className="signalto-list-label mb-2">Busiest Route</div>
            <div className="h5 fw-semibold">
              {data.busiestRoutes.length > 0 ? (
                <>
                  <span className="text-teal">{data.busiestRoutes[0].routeId}</span>
                  <div className="small signalto-subtle mt-1">
                    {data.busiestRoutes[0].activeVehicles} vehicles
                  </div>
                </>
              ) : (
                <span className="signalto-subtle">—</span>
              )}
            </div>
          </div>
        </div>
        <div className="col-sm-4">
          <div className="signalto-note p-3 text-center">
            <div className="signalto-list-label mb-2">Last Update</div>
            <div className="small fw-semibold">
              {new Date(data.generatedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Top Routes by Activity */}
      {data.busiestRoutes.length > 0 ? (
        <div className="signalto-note p-3">
          <div className="signalto-list-label mb-3">
            <i className="bi bi-bar-chart-fill me-2 text-teal" />
            Top Routes by Activity
          </div>
          <div className="d-grid gap-2">
            {data.busiestRoutes.slice(0, 5).map((route) => (
              <div key={route.routeId} className="d-flex align-items-center justify-content-between">
                <span className="fw-semibold">{route.routeId}</span>
                <div className="d-flex align-items-center gap-2">
                  <div
                    className="bg-teal rounded"
                    style={{
                      height: "8px",
                      width: `${Math.max(20, (route.activeVehicles / Math.max(...data.busiestRoutes.map((r) => r.activeVehicles))) * 100)}px`,
                      transition: "width 0.3s ease"
                    }}
                  />
                  <small className="text-body-secondary min-width-fit">{route.activeVehicles}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Live Vehicle Grid */}
      {data.sampleVehicles.length > 0 ? (
        <div className="signalto-note p-3">
          <div className="signalto-list-label mb-3">
            <i className="bi bi-geo-alt-fill me-2 text-teal" />
            Live Vehicles ({data.sampleVehicles.length})
          </div>
          <div className="d-grid gap-2">
            {data.sampleVehicles.map((vehicle, idx) => (
              <div
                key={vehicle.vehicleId || idx}
                className="p-2 border border-ink/10 rounded-2 small"
                style={{
                  animationDelay: `${idx * 50}ms`
                }}
              >
                <div className="d-flex align-items-start justify-content-between gap-2">
                  <div className="flex-grow-1">
                    <div className="fw-semibold text-ink">
                      <i className="bi bi-bus-front-fill me-2 text-teal" />
                      {vehicle.label || vehicle.vehicleId || "Vehicle"}
                    </div>
                    <small className="signalto-subtle d-block mt-1">
                      Route: {vehicle.routeId || "—"}
                    </small>
                  </div>
                  <div className="text-end">
                    {vehicle.latitude && vehicle.longitude ? (
                      <div className="small">
                        <div className="fw-semibold text-teal">
                          <i className="bi bi-geo-alt me-1" />
                          {vehicle.latitude.toFixed(4)}
                        </div>
                        <small className="signalto-subtle">{vehicle.longitude.toFixed(4)}</small>
                      </div>
                    ) : (
                      <small className="signalto-subtle">No location</small>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
