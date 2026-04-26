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
const KV_TTL = 6 * 60 * 60; // 6 hours in seconds

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

// ── Serialize ─────────────────────────────────────────────────────────────────
const payload = JSON.stringify({ fetchedAt: new Date().toISOString(), stops, routes, trips });
const payloadMB = (Buffer.byteLength(payload) / 1024 / 1024).toFixed(1);
console.log(`Serialized size: ${payloadMB} MB`);

if (Buffer.byteLength(payload) > 25 * 1024 * 1024) {
  throw new Error("Payload exceeds KV 25MB limit! Need to reduce data.");
}

// ── Upload to KV ──────────────────────────────────────────────────────────────
const payloadPath = join(tmpdir(), `ttc-kv-payload-${Date.now()}.json`);
import { writeFileSync } from "fs";
writeFileSync(payloadPath, payload);

console.log("Uploading to Cloudflare KV ...");
const { spawnSync } = await import("child_process");
const result = spawnSync(
  "npx",
  ["wrangler", "kv", "key", "put", "--remote", "--binding=TRANSIT_DATA", KV_KEY, `--path=${payloadPath}`, `--ttl=${KV_TTL}`],
  { stdio: "inherit", cwd: new URL("../", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"), shell: true }
);
if (result.status !== 0) throw new Error(`wrangler exited with status ${result.status}`);

// ── Cleanup ───────────────────────────────────────────────────────────────────
unlinkSync(zipPath);
unlinkSync(payloadPath);

console.log("Done! KV populated successfully.");
