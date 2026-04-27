import { strFromU8, unzipSync } from "fflate";
import Papa from "papaparse";
import { ttcCompleteGtfsSource } from "./transit-source-utils";

type RawStopRow = {
  stop_id?: string;
  stop_code?: string;
  stop_name?: string;
  stop_lat?: string;
  stop_lon?: string;
  location_type?: string;
  parent_station?: string;
  wheelchair_boarding?: string;
};

type RawRouteRow = {
  route_id?: string;
  route_short_name?: string;
  route_long_name?: string;
  route_type?: string;
  route_color?: string;
  route_text_color?: string;
};

type RawTripRow = {
  trip_id?: string;
  route_id?: string;
  trip_headsign?: string;
  direction_id?: string;
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

export type TtcRoute = {
  routeId: string;
  routeShortName: string | null;
  routeLongName: string | null;
  routeType: number | null;
  routeTypeLabel: string;
  routeColor: string | null;
  routeTextColor: string | null;
};

export type TtcTrip = {
  tripId: string;
  routeId: string;
  tripHeadsign: string | null;
  directionId: number | null;
};

// ─── Subway static schedule (fallback — subway not in GTFS-RT) ─────────────────

export type SubwayStopTime = {
  stopId: string;
  /** Seconds since midnight of the GTFS service day (can be >86400 for late-night) */
  departureSeconds: number;
};

export type SubwayScheduledTrip = {
  tripId: string;
  routeId: string;
  serviceId: string | null;
  headsign: string | null;
  directionId: number | null;
  stops: SubwayStopTime[];
};

export type SubwayCalendar = {
  serviceId: string;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  startDate: string; // YYYYMMDD
  endDate: string;   // YYYYMMDD
};

export type SubwayCalendarDate = {
  serviceId: string;
  date: string;        // YYYYMMDD
  exceptionType: number; // 1=added, 2=removed
};

export type TtcSubwaySchedule = {
  fetchedAt: string;
  trips: SubwayScheduledTrip[];
  calendars: SubwayCalendar[];
  calendarDates: SubwayCalendarDate[];
};

const KV_SUBWAY_KEY = "ttc-subway-schedule-v1";
let cachedSubwaySchedule: TtcSubwaySchedule | null = null;
let subwayCacheExpiresAt = 0;

type SearchableStop = TtcStop & {
  searchText: string;
};

export type TtcStaticDataset = {
  fetchedAt: string;
  stops: SearchableStop[];
  stopsById: Map<string, SearchableStop>;
  routesById: Map<string, TtcRoute>;
  tripsById: Map<string, TtcTrip>;
};

const STATIC_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const KV_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days — cron refreshes every 6h, this is a safety net
const KV_DATASET_KEY = "ttc-static-dataset-v1";

// Module-level in-memory cache (warm for the lifetime of this isolate)
let cachedDataset: TtcStaticDataset | null = null;
let cacheExpiresAt = 0;

// KV binding — set once per isolate via initKv()
let _kv: KVNamespace | null = null;

export function initKv(kv: KVNamespace): void {
  _kv = kv;
}

type SerializedDataset = {
  fetchedAt: string;
  stops: SearchableStop[];
  routes: TtcRoute[];
  trips: TtcTrip[];
};

function deserialize(data: SerializedDataset): TtcStaticDataset {
  const stopsById = new Map(data.stops.map((s) => [s.stopId, s]));
  const routesById = new Map(data.routes.map((r) => [r.routeId, r]));
  const tripsById = new Map(data.trips.map((t) => [t.tripId, t]));
  return { fetchedAt: data.fetchedAt, stops: data.stops, stopsById, routesById, tripsById };
}

function serialize(dataset: TtcStaticDataset): SerializedDataset {
  return {
    fetchedAt: dataset.fetchedAt,
    stops: dataset.stops,
    routes: Array.from(dataset.routesById.values()),
    trips: Array.from(dataset.tripsById.values())
  };
}

function parseCsvRows<T>(content: string, fileName: string): T[] {
  const parsed = Papa.parse<T>(content, {
    header: true,
    skipEmptyLines: true
  });

  if (parsed.errors.length > 0) {
    const firstError = parsed.errors[0];
    throw new Error(`${fileName} parse error on row ${firstError.row}: ${firstError.message}`);
  }

  return parsed.data;
}

function parseNumber(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function getZipText(files: Record<string, Uint8Array>, fileName: string) {
  const exact = files[fileName];

  if (exact) {
    return strFromU8(exact);
  }

  const matchedKey = Object.keys(files).find((key) => key.endsWith(`/${fileName}`));

  if (!matchedKey) {
    throw new Error(`GTFS archive is missing ${fileName}`);
  }

  return strFromU8(files[matchedKey]);
}

function routeTypeLabel(routeType: number | null) {
  switch (routeType) {
    case 0:
      return "streetcar";
    case 1:
      return "subway";
    case 2:
      return "rail";
    case 3:
      return "bus";
    default:
      return "transit";
  }
}

function wheelchairLabel(value: string | undefined): "yes" | "no" | "unknown" {
  switch (value) {
    case "1":
      return "yes";
    case "2":
      return "no";
    default:
      return "unknown";
  }
}

async function loadTtcStaticDataset(): Promise<TtcStaticDataset> {
  const response = await fetch(ttcCompleteGtfsSource.url);

  if (!response.ok) {
    throw new Error(`TTC static GTFS request failed with ${response.status}`);
  }

  const archive = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const stopsText = getZipText(archive, "stops.txt");
  const routesText = getZipText(archive, "routes.txt");
  const tripsText = getZipText(archive, "trips.txt");

  const stops = parseCsvRows<RawStopRow>(stopsText, "stops.txt")
    .map((row) => {
      const stopId = row.stop_id?.trim();
      const stopName = row.stop_name?.trim();
      const latitude = parseNumber(row.stop_lat);
      const longitude = parseNumber(row.stop_lon);
      const locationType = parseNumber(row.location_type) ?? 0;

      if (!stopId || !stopName || latitude === null || longitude === null) {
        return null;
      }

      if (locationType > 1) {
        return null;
      }

      const stop: SearchableStop = {
        stopId,
        stopCode: row.stop_code?.trim() || null,
        stopName,
        latitude,
        longitude,
        locationType,
        parentStation: row.parent_station?.trim() || null,
        wheelchairBoarding: wheelchairLabel(row.wheelchair_boarding),
        searchText: `${stopName} ${row.stop_code ?? ""} ${stopId}`.toLowerCase()
      };

      return stop;
    })
    .filter((stop): stop is SearchableStop => Boolean(stop));

  const routesById = new Map<string, TtcRoute>();

  for (const row of parseCsvRows<RawRouteRow>(routesText, "routes.txt")) {
    const routeId = row.route_id?.trim();

    if (!routeId) {
      continue;
    }

    const routeType = parseNumber(row.route_type);

    routesById.set(routeId, {
      routeId,
      routeShortName: row.route_short_name?.trim() || null,
      routeLongName: row.route_long_name?.trim() || null,
      routeType,
      routeTypeLabel: routeTypeLabel(routeType),
      routeColor: row.route_color?.trim() || null,
      routeTextColor: row.route_text_color?.trim() || null
    });
  }

  const tripsById = new Map<string, TtcTrip>();

  for (const row of parseCsvRows<RawTripRow>(tripsText, "trips.txt")) {
    const tripId = row.trip_id?.trim();
    const routeId = row.route_id?.trim();

    if (!tripId || !routeId) {
      continue;
    }

    tripsById.set(tripId, {
      tripId,
      routeId,
      tripHeadsign: row.trip_headsign?.trim() || null,
      directionId: parseNumber(row.direction_id)
    });
  }

  const stopsById = new Map(stops.map((stop) => [stop.stopId, stop]));

  const dataset: TtcStaticDataset = {
    fetchedAt: new Date().toISOString(),
    stops,
    stopsById,
    routesById,
    tripsById
  };

  return dataset;
}

// Called by the cron trigger (scheduled handler) — downloads GTFS, stores in KV + memory.
// Never called on the HTTP request path.
export async function refreshGtfsToKv(): Promise<void> {
  const dataset = await loadTtcStaticDataset();

  if (_kv) {
    await _kv.put(KV_DATASET_KEY, JSON.stringify(serialize(dataset)), {
      expirationTtl: KV_TTL_SECONDS
    });
  }

  cachedDataset = dataset;
  cacheExpiresAt = Date.now() + STATIC_CACHE_TTL_MS;
}

// Called on every API request — reads in-memory cache first, then KV, never downloads.
export async function getTtcStaticDataset(): Promise<TtcStaticDataset> {
  const now = Date.now();

  // 1. In-memory (fastest — same isolate)
  if (cachedDataset && now < cacheExpiresAt) {
    return cachedDataset;
  }

  // 2. KV (fast — no HTTP download)
  if (_kv) {
    const raw = await _kv.get(KV_DATASET_KEY, "text");
    if (raw) {
      const dataset = deserialize(JSON.parse(raw) as SerializedDataset);
      cachedDataset = dataset;
      cacheExpiresAt = now + STATIC_CACHE_TTL_MS;
      return dataset;
    }
  }

  // 3. KV not yet populated — cron hasn't run yet
  throw new Error("TTC static data not yet available. Please try again in a few minutes.");
}

export async function getTtcSubwaySchedule(): Promise<TtcSubwaySchedule | null> {
  const now = Date.now();

  if (cachedSubwaySchedule && now < subwayCacheExpiresAt) {
    return cachedSubwaySchedule;
  }

  if (_kv) {
    const raw = await _kv.get(KV_SUBWAY_KEY, "text");
    if (raw) {
      const schedule = JSON.parse(raw) as TtcSubwaySchedule;
      cachedSubwaySchedule = schedule;
      subwayCacheExpiresAt = now + STATIC_CACHE_TTL_MS;
      return schedule;
    }
  }

  return null; // not seeded yet — degrade gracefully
}

export function toPublicStop(stop: TtcStop) {
  return {
    stopId: stop.stopId,
    stopCode: stop.stopCode,
    stopName: stop.stopName,
    latitude: stop.latitude,
    longitude: stop.longitude,
    locationType: stop.locationType,
    parentStation: stop.parentStation,
    wheelchairBoarding: stop.wheelchairBoarding
  };
}
