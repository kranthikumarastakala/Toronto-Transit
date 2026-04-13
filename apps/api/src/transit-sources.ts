export type TransitSource = {
  id: string;
  label: string;
  provider: "TTC" | "GO" | "UP Express" | "Metrolinx";
  category: "static_gtfs" | "realtime_alerts" | "realtime_trip_updates" | "realtime_vehicle_positions" | "api";
  integrationStatus: "live" | "planned";
  requiresAuth: boolean;
  url: string;
  description: string;
};

export const transitSources: TransitSource[] = [
  {
    id: "ttc-complete-gtfs",
    label: "TTC Complete GTFS ZIP",
    provider: "TTC",
    category: "static_gtfs",
    integrationStatus: "live",
    requiresAuth: false,
    url: "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/b811ead4-6eaf-4adb-8408-d389fb5a069c/resource/c920e221-7a1c-488b-8c5b-6d8cd4e85eaf/download/completegtfs.zip",
    description: "Merged TTC GTFS feed for subway, streetcar, and bus schedules."
  },
  {
    id: "ttc-surface-gtfs",
    label: "TTC Surface GTFS ZIP",
    provider: "TTC",
    category: "static_gtfs",
    integrationStatus: "live",
    requiresAuth: false,
    url: "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/bd4809dd-e289-4de8-bbde-c5c00dafbf4f/resource/28514055-d011-4ed7-8bb0-97961dfe2b66/download/surfacegtfs.zip",
    description: "Surface-only GTFS feed used with TTC realtime data."
  },
  {
    id: "ttc-alerts",
    label: "TTC GTFS-RT Alerts",
    provider: "TTC",
    category: "realtime_alerts",
    integrationStatus: "live",
    requiresAuth: false,
    url: "https://gtfsrt.ttc.ca/alerts/all?format=binary",
    description: "Combined TTC realtime service alerts including subway, bus, streetcar, stops, and accessibility."
  },
  {
    id: "ttc-trip-updates",
    label: "TTC GTFS-RT Trip Updates",
    provider: "TTC",
    category: "realtime_trip_updates",
    integrationStatus: "live",
    requiresAuth: false,
    url: "https://gtfsrt.ttc.ca/trips/update?format=binary",
    description: "Realtime trip updates for TTC service changes and trip progression."
  },
  {
    id: "ttc-vehicle-positions",
    label: "TTC GTFS-RT Vehicle Positions",
    provider: "TTC",
    category: "realtime_vehicle_positions",
    integrationStatus: "live",
    requiresAuth: false,
    url: "https://gtfsrt.ttc.ca/vehicles/position?format=binary",
    description: "Realtime TTC vehicle position feed."
  },
  {
    id: "go-static-gtfs",
    label: "GO Transit GTFS ZIP",
    provider: "GO",
    category: "static_gtfs",
    integrationStatus: "live",
    requiresAuth: false,
    url: "https://assets.metrolinx.com/raw/upload/Documents/Metrolinx/Open%20Data/GO-GTFS.zip",
    description: "Official GO Transit static GTFS schedules published by Metrolinx."
  },
  {
    id: "up-static-gtfs",
    label: "UP Express GTFS ZIP",
    provider: "UP Express",
    category: "static_gtfs",
    integrationStatus: "live",
    requiresAuth: false,
    url: "https://assets.metrolinx.com/raw/upload/Documents/Metrolinx/Open%20Data/UP-GTFS.zip",
    description: "Official UP Express static GTFS schedules published by Metrolinx."
  },
  {
    id: "go-open-data-api",
    label: "GO Open Data API",
    provider: "Metrolinx",
    category: "api",
    integrationStatus: "planned",
    requiresAuth: true,
    url: "https://api.openmetrolinx.com/OpenDataAPI/",
    description: "Metrolinx GO API for stop schedules, service updates, departures, and fares. Registration required."
  }
];

export const ttcAlertSource = transitSources.find((source) => source.id === "ttc-alerts")!;
export const ttcTripUpdateSource = transitSources.find((source) => source.id === "ttc-trip-updates")!;
export const ttcVehicleSource = transitSources.find((source) => source.id === "ttc-vehicle-positions")!;
