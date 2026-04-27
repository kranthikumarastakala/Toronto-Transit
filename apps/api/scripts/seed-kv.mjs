/**
 * Downloads the TTC GTFS ZIP locally, parses stops/routes/trips,
 * and uploads the result to Cloudflare KV via wrangler.
 *
 * Run with: node apps/api/scripts/seed-kv.mjs
 */

import { createWriteStream, readFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { unzipSync, strFromU8 } from "fflate";

const GTFS_URL =
  "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/b811ead4-6eaf-4adb-8408-d389fb5a069c/resource/c920e221-7a1c-488b-8c5b-6d8cd4e85eaf/download/completegtfs.zip";
const KV_KEY = "ttc-static-dataset-v1";
const KV_TTL = 7 * 24 * 60 * 60; // 7 days — cron refreshes every 6h, this is a safety net

function parseNumber(value) {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function routeTypeLabel(routeType) {
  switch (routeType) {
    case 0: return "streetcar";
    case 1: return "subway";
    case 2: return "rail";
    case 3: return "bus";
    default: return "transit";
  }
}

function wheelchairLabel(value) {
  switch (value) {
    case "1": return "yes";
    case "2": return "no";
    default: return "unknown";
  }
}

function parseCsv(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter(Boolean);
  if (lines.length === 0) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const vals = line.split(",");
    const row = {};
    headers.forEach((h, i) => (row[h] = (vals[i] ?? "").trim()));
    return row;
  });
}

function getZipText(files, fileName) {
  const exact = files[fileName];
  if (exact) return strFromU8(exact);
  const key = Object.keys(files).find((k) => k.endsWith(`/${fileName}`));
  if (!key) throw new Error(`GTFS archive missing ${fileName}`);
  return strFromU8(files[key]);
}

// ── Download ──────────────────────────────────────────────────────────────────
const zipPath = join(tmpdir(), `completegtfs-${Date.now()}.zip`);
console.log(`Downloading GTFS ZIP to ${zipPath} ...`);
const start = Date.now();
const resp = await fetch(GTFS_URL);
if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
await pipeline(Readable.fromWeb(resp.body), createWriteStream(zipPath));
console.log(`Downloaded in ${((Date.now() - start) / 1000).toFixed(1)}s`);

// ── Parse ─────────────────────────────────────────────────────────────────────
console.log("Parsing GTFS ...");
const zipBytes = readFileSync(zipPath);
const files = unzipSync(new Uint8Array(zipBytes));

const stopsRaw = parseCsv(getZipText(files, "stops.txt"));
const routesRaw = parseCsv(getZipText(files, "routes.txt"));
const tripsRaw = parseCsv(getZipText(files, "trips.txt"));
const stopTimesRaw = parseCsv(getZipText(files, "stop_times.txt"));
let calendarsRaw = [];
let calendarDatesRaw = [];
try { calendarsRaw = parseCsv(getZipText(files, "calendar.txt")); } catch { console.warn("calendar.txt not found, skipping"); }
try { calendarDatesRaw = parseCsv(getZipText(files, "calendar_dates.txt")); } catch { console.warn("calendar_dates.txt not found, skipping"); }

const stops = stopsRaw
  .map((row) => {
    const stopId = row.stop_id?.trim();
    const stopName = row.stop_name?.trim();
    const lat = parseNumber(row.stop_lat);
    const lon = parseNumber(row.stop_lon);
    const locationType = parseNumber(row.location_type) ?? 0;
    if (!stopId || !stopName || lat === null || lon === null) return null;
    if (locationType > 1) return null;
    return {
      stopId,
      stopCode: row.stop_code?.trim() || null,
      stopName,
      latitude: lat,
      longitude: lon,
      locationType,
      parentStation: row.parent_station?.trim() || null,
      wheelchairBoarding: wheelchairLabel(row.wheelchair_boarding),
      searchText: `${stopName} ${row.stop_code ?? ""} ${stopId}`.toLowerCase(),
    };
  })
  .filter(Boolean);

const routes = routesRaw
  .filter((r) => r.route_id?.trim())
  .map((row) => {
    const routeType = parseNumber(row.route_type);
    return {
      routeId: row.route_id.trim(),
      routeShortName: row.route_short_name?.trim() || null,
      routeLongName: row.route_long_name?.trim() || null,
      routeType,
      routeTypeLabel: routeTypeLabel(routeType),
      routeColor: row.route_color?.trim() || null,
      routeTextColor: row.route_text_color?.trim() || null,
    };
  });

const trips = tripsRaw
  .filter((r) => r.trip_id?.trim() && r.route_id?.trim())
  .map((row) => ({
    tripId: row.trip_id.trim(),
    routeId: row.route_id.trim(),
    tripHeadsign: row.trip_headsign?.trim() || null,
    directionId: parseNumber(row.direction_id),
  }));

console.log(`Parsed: ${stops.length} stops, ${routes.length} routes, ${trips.length} trips`);

// ── Subway schedule (static fallback for Line 1 & 2, not in GTFS-RT) ──────────
console.log("Building subway schedule (stop_times + calendar) ...");
function parseGtfsTime(s) {
  const p = s?.trim().split(":");
  if (!p || p.length < 3) return null;
  const h = parseInt(p[0], 10), m = parseInt(p[1], 10), sec = parseInt(p[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(sec)) return null;
  return h * 3600 + m * 60 + sec;
}
const subwayRouteIds = new Set(routes.filter((r) => r.routeType === 1).map((r) => r.routeId));
console.log(`Subway route IDs: ${[...subwayRouteIds].join(", ")}`);
const subwayTripSet = new Set(tripsRaw.filter((r) => subwayRouteIds.has(r.route_id?.trim())).map((r) => r.trip_id?.trim()));
console.log(`Subway trips: ${subwayTripSet.size}`);

// Build trip → stops list
const tripStopsMap = new Map();
let skipped = 0;
for (const row of stopTimesRaw) {
  const tripId = row.trip_id?.trim();
  if (!tripId || !subwayTripSet.has(tripId)) { skipped++; continue; }
  const stopId = row.stop_id?.trim();
  const depSec = parseGtfsTime(row.departure_time ?? row.arrival_time);
  const seq = parseNumber(row.stop_sequence);
  if (!stopId || depSec === null) continue;
  if (!tripStopsMap.has(tripId)) tripStopsMap.set(tripId, []);
  tripStopsMap.get(tripId).push({ stopId, departureSeconds: depSec, seq: seq ?? 0 });
}
console.log(`Subway stop_time rows collected: ${[...tripStopsMap.values()].reduce((a, v) => a + v.length, 0)} (skipped ${skipped})`);

const subwayTrips = tripsRaw
  .filter((r) => subwayTripSet.has(r.trip_id?.trim()))
  .map((row) => {
    const tripId = row.trip_id.trim();
    const rawStops = tripStopsMap.get(tripId) ?? [];
    rawStops.sort((a, b) => a.seq - b.seq);
    return {
      tripId,
      routeId: row.route_id.trim(),
      serviceId: row.service_id?.trim() || null,
      headsign: row.trip_headsign?.trim() || null,
      directionId: parseNumber(row.direction_id),
      stops: rawStops.map(({ stopId, departureSeconds }) => ({ stopId, departureSeconds })),
    };
  })
  .filter((t) => t.stops.length >= 2);

const calendars = calendarsRaw.map((row) => ({
  serviceId: row.service_id?.trim(),
  monday: row.monday === "1",
  tuesday: row.tuesday === "1",
  wednesday: row.wednesday === "1",
  thursday: row.thursday === "1",
  friday: row.friday === "1",
  saturday: row.saturday === "1",
  sunday: row.sunday === "1",
  startDate: row.start_date?.trim() || "",
  endDate: row.end_date?.trim() || "",
})).filter((r) => r.serviceId);

const calendarDates = calendarDatesRaw.map((row) => ({
  serviceId: row.service_id?.trim(),
  date: row.date?.trim() || "",
  exceptionType: parseNumber(row.exception_type) ?? 0,
})).filter((r) => r.serviceId && r.date);

console.log(`Subway schedule: ${subwayTrips.length} trips, ${calendars.length} calendars, ${calendarDates.length} calendarDates`);

// ── Serialize ─────────────────────────────────────────────────────────────────
const payload = JSON.stringify({ fetchedAt: new Date().toISOString(), stops, routes, trips });
const payloadMB = (Buffer.byteLength(payload) / 1024 / 1024).toFixed(1);
console.log(`Main dataset size: ${payloadMB} MB`);

if (Buffer.byteLength(payload) > 25 * 1024 * 1024) {
  throw new Error("Payload exceeds KV 25MB limit! Need to reduce data.");
}

const subwayPayload = JSON.stringify({
  fetchedAt: new Date().toISOString(),
  trips: subwayTrips,
  calendars,
  calendarDates,
});
const subwayMB = (Buffer.byteLength(subwayPayload) / 1024 / 1024).toFixed(2);
console.log(`Subway schedule size: ${subwayMB} MB`);

// ── Upload to KV ──────────────────────────────────────────────────────────────
const payloadPath = join(tmpdir(), `ttc-kv-payload-${Date.now()}.json`);
const subwayPayloadPath = join(tmpdir(), `ttc-kv-subway-${Date.now()}.json`);
import { writeFileSync } from "fs";
writeFileSync(payloadPath, payload);
writeFileSync(subwayPayloadPath, subwayPayload);

console.log("Uploading main dataset to Cloudflare KV ...");
const { spawnSync } = await import("child_process");
const cwd = new URL("../", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const result = spawnSync(
  "npx",
  ["wrangler", "kv", "key", "put", "--remote", "--preview", "false", "--binding=TRANSIT_DATA", KV_KEY, `--path=${payloadPath}`, `--ttl=${KV_TTL}`],
  { stdio: "inherit", cwd, shell: true }
);
if (result.status !== 0) throw new Error(`wrangler exited with status ${result.status}`);

console.log("Uploading subway schedule to Cloudflare KV ...");
const result2 = spawnSync(
  "npx",
  ["wrangler", "kv", "key", "put", "--remote", "--preview", "false", "--binding=TRANSIT_DATA", "ttc-subway-schedule-v1", `--path=${subwayPayloadPath}`, `--ttl=${KV_TTL}`],
  { stdio: "inherit", cwd, shell: true }
);
if (result2.status !== 0) throw new Error(`wrangler (subway) exited with status ${result2.status}`);

// ── Cleanup ───────────────────────────────────────────────────────────────────
unlinkSync(zipPath);
unlinkSync(payloadPath);
unlinkSync(subwayPayloadPath);

console.log("Done! KV populated successfully.");
