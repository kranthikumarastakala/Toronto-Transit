export type HealthResponse = {
  status: string;
  generatedAt: string;
  service: string;
};

export type TransitSource = {
  id: string;
  label: string;
  provider: string;
  category: string;
  integrationStatus: "live" | "planned";
  requiresAuth: boolean;
  url: string;
  description: string;
};

export type TransitSourcesResponse = {
  generatedAt: string;
  sources: TransitSource[];
};

export type FeedStatus = {
  id: string;
  label: string;
  provider: string;
  status: "ok" | "error" | "needs_setup";
  checkedAt: string;
  responseMs: number | null;
  contentType: string | null;
  contentLength: number | null;
  detail: string;
};

export type FeedStatusResponse = {
  generatedAt: string;
  statuses: FeedStatus[];
};

export type TtcAlert = {
  id: string;
  headerText: string;
  descriptionText: string | null;
  effect: string;
  routes: string[];
  routeTypes: string[];
  activePeriodStart: string | null;
  activePeriodEnd: string | null;
};

export type TtcAlertsResponse = {
  generatedAt: string;
  totalAlerts: number;
  alerts: TtcAlert[];
};

export type TtcVehicleSummaryResponse = {
  generatedAt: string;
  totalVehicles: number;
  busiestRoutes: Array<{
    routeId: string;
    activeVehicles: number;
  }>;
  sampleVehicles: Array<{
    vehicleId: string | null;
    label: string | null;
    routeId: string | null;
    tripId: string | null;
    latitude: number | null;
    longitude: number | null;
  }>;
};

export type TtcVehicle = {
  vehicleId: string | null;
  label: string | null;
  routeId: string | null;
  routeShortName: string | null;
  routeTypeLabel: string;
  tripId: string | null;
  latitude: number;
  longitude: number;
  bearing: number | null;
  currentStatus: number | null;
};

export type TtcVehiclePositionsResponse = {
  generatedAt: string;
  totalVehicles: number;
  vehicles: TtcVehicle[];
};

export type TtcStop = {
  stopId: string;
  stopCode: string | null;
  stopName: string;
  latitude: number;
  longitude: number;
  locationType: number;
  parentStation: string | null;
  wheelchairBoarding: "yes" | "no" | "unknown";
};

export type TtcNearbyStop = TtcStop & {
  distanceMeters: number;
};

export type TtcNearbyStopsResponse = {
  generatedAt: string;
  referencePoint: {
    latitude: number;
    longitude: number;
  };
  radiusMeters: number;
  fallbackToNearest: boolean;
  stops: TtcNearbyStop[];
};

export type TtcStopSearchResponse = {
  generatedAt: string;
  query: string;
  totalMatches: number;
  stops: TtcStop[];
};

export type TtcStopArrivalsResponse = {
  generatedAt: string;
  stop: TtcStop;
  totalArrivals: number;
  arrivals: Array<{
    tripId: string | null;
    routeId: string | null;
    routeShortName: string | null;
    routeLongName: string | null;
    routeTypeLabel: string;
    headsign: string | null;
    directionId: number | null;
    predictedDepartureTime: string | null;
    scheduledDepartureTime: string | null;
    minutesAway: number;
    delaySeconds: number | null;
    stopSequence: number | null;
    scheduleRelationship: number | null;
  }>;
};

export type TtcCommuteOption = {
  tripId: string | null;
  routeId: string | null;
  routeShortName: string | null;
  routeLongName: string | null;
  routeTypeLabel: string;
  headsign: string | null;
  directionId: number | null;
  departureTime: string | null;
  arrivalTime: string | null;
  scheduledDepartureTime: string | null;
  scheduledArrivalTime: string | null;
  minutesUntilDeparture: number;
  rideDurationMinutes: number;
  originDelaySeconds: number | null;
  destinationDelaySeconds: number | null;
};

export type TtcCommuteLeg = {
  tripId: string | null;
  routeId: string | null;
  routeShortName: string | null;
  routeLongName: string | null;
  routeTypeLabel: string;
  headsign: string | null;
  directionId: number | null;
  departureStop: TtcStop;
  arrivalStop: TtcStop;
  departureTime: string | null;
  arrivalTime: string | null;
  scheduledDepartureTime: string | null;
  scheduledArrivalTime: string | null;
  minutesUntilDeparture: number;
  rideDurationMinutes: number;
  departureDelaySeconds: number | null;
  arrivalDelaySeconds: number | null;
};

export type TtcTransferCommuteOption = {
  minutesUntilDeparture: number;
  transferWaitMinutes: number;
  transferWalkMeters: number;
  totalTravelMinutes: number;
  arrivalTime: string | null;
  transferStop: TtcStop;
  firstLeg: TtcCommuteLeg;
  secondLeg: TtcCommuteLeg;
};

export type TtcCommuteEvaluationResponse = {
  generatedAt: string;
  originStop: TtcStop;
  destinationStop: TtcStop;
  recommendation: {
    status: "leave_now" | "leave_soon" | "plan_ahead" | "no_direct_trip";
    journeyType: "direct" | "transfer" | "none";
    headline: string;
    detail: string;
    backupDetail: string | null;
  };
  confidence: {
    level: "high" | "moderate" | "low";
    score: number;
    summary: string;
    reasons: string[];
  };
  primaryOption: TtcCommuteOption | null;
  backupOption: TtcCommuteOption | null;
  totalOptions: number;
  options: TtcCommuteOption[];
  bestTransferOption: TtcTransferCommuteOption | null;
  backupTransferOption: TtcTransferCommuteOption | null;
  totalTransferOptions: number;
  transferOptions: TtcTransferCommuteOption[];
};

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);

  if (!response.ok) {
    try {
      const payload = (await response.json()) as { error?: string };

      if (payload.error) {
        throw new Error(payload.error);
      }
    } catch (error) {
      if (error instanceof Error && error.message) {
        throw error;
      }
    }

    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  getHealth: () => getJson<HealthResponse>("/api/health"),
  getSources: () => getJson<TransitSourcesResponse>("/api/transit/sources"),
  getFeedStatus: () => getJson<FeedStatusResponse>("/api/feed-status"),
  getTtcAlerts: () => getJson<TtcAlertsResponse>("/api/ttc/alerts"),
  getTtcVehicleSummary: () => getJson<TtcVehicleSummaryResponse>("/api/ttc/vehicles/summary"),
  getTtcVehiclePositions: () => getJson<TtcVehiclePositionsResponse>("/api/ttc/vehicles"),
  getNearbyTtcStops: (params: { lat: number; lon: number; radius?: number; limit?: number }) =>
    getJson<TtcNearbyStopsResponse>(
      `/api/ttc/stops/nearby?lat=${params.lat}&lon=${params.lon}&radius=${params.radius ?? 750}&limit=${params.limit ?? 8}`
    ),
  searchTtcStops: (query: string, limit = 8) =>
    getJson<TtcStopSearchResponse>(`/api/ttc/stops/search?q=${encodeURIComponent(query)}&limit=${limit}`),
  getTtcStopArrivals: (stopId: string) => getJson<TtcStopArrivalsResponse>(`/api/ttc/stops/${stopId}/arrivals`),
  getTtcCommuteEvaluation: (fromStopId: string, toStopId: string) =>
    getJson<TtcCommuteEvaluationResponse>(
      `/api/ttc/commutes/evaluate?fromStopId=${encodeURIComponent(fromStopId)}&toStopId=${encodeURIComponent(toStopId)}`
    )
};

export type GeocodedPlace = {
  lat: number;
  lon: number;
  displayName: string;
};

export async function geocodeAddress(query: string): Promise<GeocodedPlace[]> {
  const encoded = encodeURIComponent(`${query}, Toronto, Ontario, Canada`);
  const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=3&countrycodes=ca`;
  const response = await fetch(url, { headers: { "Accept-Language": "en", "User-Agent": "TorontoTransit/1.0" } });
  if (!response.ok) return [];
  const data = (await response.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  return data.map((d) => ({ lat: parseFloat(d.lat), lon: parseFloat(d.lon), displayName: d.display_name }));
}

// ─── Photon address autocomplete (OSM-based, no auth required) ───────────────

export type PhotonFeature = {
  lat: number;
  lon: number;
  name: string;
  street: string | null;
  housenumber: string | null;
  city: string | null;
  state: string | null;
  type: string;
};

export async function photonAutocomplete(query: string): Promise<PhotonFeature[]> {
  if (query.trim().length < 2) return [];
  const q = encodeURIComponent(`${query}, Toronto`);
  const url = `https://photon.komoot.io/api/?q=${q}&lat=43.6532&lon=-79.3832&limit=6&lang=en`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const data = (await resp.json()) as {
      features?: Array<{
        geometry: { coordinates: [number, number] };
        properties: Record<string, string | undefined>;
      }>;
    };
    return (data.features ?? []).map((f) => ({
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
      name: f.properties.name ?? f.properties.street ?? "Unknown",
      street: f.properties.street ?? null,
      housenumber: f.properties.housenumber ?? null,
      city: f.properties.city ?? null,
      state: f.properties.state ?? null,
      type: f.properties.type ?? f.properties.osm_key ?? "place"
    }));
  } catch {
    return [];
  }
}
