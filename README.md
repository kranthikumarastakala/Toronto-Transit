# SignalTO

SignalTO is a zero-budget Toronto transit MVP built as:

- a `Cloudflare Worker` API
- an installable `React + Vite` PWA

## Apps

- `apps/api`: transit-source integration layer for TTC and GO
- `apps/web`: rider-facing dashboard shell

## Local Development

Run the API and web app in separate terminals:

```powershell
npm run dev:api
npm run dev:web
```

The web app proxies `/api` to the local Worker during development.

## Current Scope

- verified TTC GTFS-RT source wiring
- verified TTC and GO static feed URLs
- cached TTC static GTFS ingestion inside the Worker
- nearby TTC stop lookup from real coordinates
- TTC stop search by name or stop code
- live TTC stop arrivals from trip updates + static route metadata
- favorite TTC stops saved locally in the PWA
- saved commute pairs with persisted origin and destination
- leave-now direct-ride guidance with confidence scoring and backup options
- one-transfer TTC fallback guidance when no direct ride is visible
- feed-health dashboard for official sources

Further milestones are tracked in [docs/BUILD_PLAN.md](./docs/BUILD_PLAN.md).

## Current API Endpoints

- `GET /api/health`
- `GET /api/transit/sources`
- `GET /api/feed-status`
- `GET /api/ttc/alerts`
- `GET /api/ttc/vehicles/summary`
- `GET /api/ttc/stops/nearby?lat=43.6532&lon=-79.3832`
- `GET /api/ttc/stops/search?q=union`
- `GET /api/ttc/stops/:stopId/arrivals`
- `GET /api/ttc/commutes/evaluate?fromStopId=7758&toStopId=7308`
