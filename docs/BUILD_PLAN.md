# SignalTO Build Plan

## Goal

Build a zero-budget, mobile-first Toronto transit app that helps riders:

- see live TTC and GO arrivals
- monitor saved commutes
- get proactive disruption alerts
- recover from detours and missed transfers

The first release should be a **Progressive Web App (PWA)**, not a native iOS/Android app. This avoids App Store fees and lets us ship faster.

## Hard Constraints

- Budget: `$0`
- No paid maps, no paid trip-planning APIs, no paid push vendor, no paid analytics
- Avoid any dependency that requires a billing account on day 1
- Do not assume PRESTO account access or fare purchase APIs are publicly available

## Recommended Product Shape

### Phase 1 product

Ship a **commute assistant**, not a full "everything app" yet.

Phase 1 should do these 5 things extremely well:

1. Show nearby TTC and GO stops
2. Show live arrivals for favorite stops and routes
3. Monitor saved commute pairs like `Home -> Work`
4. Warn when a normal route is disrupted
5. Suggest a backup route using official schedule + realtime data

### What we should NOT build in v1

- PRESTO balance sync
- PRESTO top-up or payments
- full account system
- native iOS/Android binaries
- SMS alerts
- full citywide door-to-door navigation with premium maps

Those are either blocked by cost, blocked by missing public APIs, or too heavy for a solo zero-budget launch.

## Recommended Tech Stack

### Frontend

- `React`
- `TypeScript`
- `Vite`
- `TanStack Router`
- `TanStack Query`
- `Bootstrap 5`
- custom theme CSS
- `MapLibre GL JS`
- `vite-plugin-pwa`

### Why this stack

- `React + TypeScript` keeps hiring and community support strong.
- `Vite` is faster and simpler than a full SSR framework for a PWA-first product.
- `TanStack Query` is ideal for polling realtime transit feeds.
- `Bootstrap` gives us a polished responsive foundation without design spend.
- `MapLibre` avoids Google Maps / Mapbox lock-in and cost.
- PWA support lets us install the app on phones without App Store fees.

### Backend

- `Cloudflare Workers`
- `Hono`
- `Cloudflare D1`
- `Cloudflare KV`
- `Cloudflare Cron Triggers`

### Why this backend

- Runs on a free plan suitable for an early commercial MVP
- No server to manage
- Easy caching close to the user
- Cron jobs can ingest GTFS and GTFS-Realtime feeds on a schedule
- D1 is enough for favorites, saved commutes, alert history, and reliability snapshots

## Data And Storage Design

### Cloudflare D1 tables

- `users` or `anonymous_devices`
- `saved_places`
- `saved_commutes`
- `favorite_stops`
- `favorite_routes`
- `service_alerts`
- `route_reliability_snapshots`
- `trip_recommendation_logs`

### KV cache

Use KV for short-lived cached responses:

- TTC realtime feed snapshots
- GO API responses
- normalized stop lookup indices
- computed commute summaries

### Local device storage

For the first release, keep the user model very simple:

- save favorites in `IndexedDB`
- use local install + anonymous device ID
- add optional sign-in later only if truly needed

This avoids auth cost and complexity.

## Maps Strategy

Use `MapLibre` for the UI, but do not depend on a paid tile provider.

Recommended approach:

- start with a stop-first list UI as the primary experience
- use maps as a supporting layer, not the whole product
- host a small Toronto-focused PMTiles basemap later if needed

This matters because free public OpenStreetMap infrastructure is not intended to power a production startup at scale.

## Trip Planning Strategy

Do **not** start with a full Google Maps replacement.

Instead:

### v1 routing

- user selects origin and destination from saved places, recent places, or nearby stops
- backend computes best TTC / GO options using GTFS static + realtime
- walking is estimated for short transfers only
- UI emphasizes:
  - fastest
  - fewest transfers
  - least walking
  - highest reliability

### v2 routing

- add a RAPTOR-style transit routing engine
- add better walking transfers and accessibility preferences
- add multimodal layers such as Bike Share Toronto

## Public APIs And Data Sources

### Must-use in v1

1. `TTC GTFS static`
   - official schedules, stops, routes, trips
   - source: City of Toronto Open Data / TTC open data ecosystem

2. `TTC GTFS-Realtime / NVAS`
   - live vehicle positions, arrival predictions, trip updates, service alerts
   - source: City of Toronto Open Data / TTC open data ecosystem

3. `GO Transit / UP Express GTFS`
   - official static schedules for GO and UP Express
   - source: Metrolinx developer resources

4. `GO Open Data API`
   - service-at-a-glance, stop schedules, service updates, union departures, fares
   - source: Open Data GO API from Metrolinx

### Nice-to-have in v2

5. `Bike Share Toronto GBFS`
   - station status and bike availability if we confirm stable public access and licensing

6. `Weather`
   - only if it materially improves disruption predictions
   - use a truly free source with commercial-friendly terms

## APIs We Should Avoid Depending On

### PRESTO

We should assume **no public rider-account API** for PRESTO unless Metrolinx formally partners with us.

That means:

- no balance sync
- no autoload setup
- no card management
- no direct wallet integration from our app

We can still support:

- fare estimation
- transfer window logic where publicly documented
- deep links to official PRESTO properties if useful

## Architecture Overview

### Client

- PWA loads on mobile web
- gets nearest stops using browser geolocation
- polls cached backend endpoints
- stores favorites locally
- can subscribe to browser push notifications later

### Worker API

- `/api/stops/nearby`
- `/api/routes/:id/arrivals`
- `/api/commutes/evaluate`
- `/api/alerts/active`
- `/api/trips/recommend`

### Scheduled jobs

- refresh GTFS static datasets when updates are published
- ingest TTC realtime every 15-30 seconds
- ingest GO API snapshots every 30-60 seconds where useful
- compute reliability scores for favorite routes

## Core Features By Milestone

### Milestone 0: Data validation

- download TTC and GO static feeds
- validate schema compatibility
- inspect realtime freshness
- prove we can join static and realtime data cleanly

### Milestone 1: PWA shell

- mobile UI
- installable app
- nearby stops
- favorite stops
- live arrivals

### Milestone 2: Saved commute monitoring

- save `Home`, `Work`, `School`, custom places
- evaluate best route every few minutes
- show "leave now", "delay", or "take backup" recommendations
- support live one-transfer fallbacks before full citywide routing exists

### Milestone 3: Disruption intelligence

- unify TTC + GO alerts
- detect route instability
- rank route options by reliability

### Milestone 4: Sharper differentiation

- trust score per route
- detour-aware recommendations
- lightweight trip history

## Testing Stack

- `Vitest` for unit tests
- `Playwright` for end-to-end tests
- mocked feed fixtures for TTC and GO

## Observability Without Spending Money

- structured logs from Workers
- simple internal analytics written to D1
- no third-party analytics SDK in v1

## Deployment

### Production

- Cloudflare Workers for API
- Cloudflare static hosting for the frontend
- D1 + KV attached to the Worker

### Local development

- `npm` or `pnpm`
- `wrangler` for local Worker dev
- local SQLite-backed D1 during development

## Why PWA First Is The Right Call

As of April 12, 2026:

- Apple says you can test apps on your own devices for free, but App Store distribution requires the Apple Developer Program, which costs `$99 USD` per year unless you qualify for a waiver.
- Because you said you cannot invest any money, App Store distribution should not be our initial path.

So the build order should be:

1. PWA
2. validate user demand
3. prove retention
4. only then consider app-store packaging

## Recommended Build Sequence

1. Set up monorepo with `apps/web` and `apps/api`
2. Ingest TTC and GO static feeds
3. Build live arrivals for stops
4. Build saved commute evaluation
5. Add alerts and reliability scoring
6. Add installable PWA polish
7. Add browser push if usage justifies it

## Success Metrics For The MVP

- daily active riders
- percentage of users who save at least 1 commute
- alert open rate
- commute recommendation accuracy
- day-7 and day-30 retention

## Sources

- TTC customer research and interest in an integrated app:
  - https://pw.ttc.ca/-/media/Project/TTC/DevProto/Documents/Home/About-the-TTC/5_year_plan_10_year_outlook/2023/TTC-5YSP-and-CXAP---Final-Round-Three-Survey-Summary.pdf
- TTC notes that Transit is the only place customers can currently see certain realtime detour information:
  - https://www.ttc.ca/riding-the-ttc/Updates/Unplanned-bus-or-streetcar-diversion
- GO / UP Express developer data:
  - https://www.gotransit.com/en/partner-with-us/software-developers
- GO Open Data API:
  - https://api.openmetrolinx.com/OpenDataAPI/
- PRESTO app capabilities and product scope:
  - https://apps.apple.com/us/app/presto/id1437927882
- Apple membership and distribution cost:
  - https://developer.apple.com/support/compare-memberships/
  - https://developer.apple.com/programs/
- Cloudflare free plan / developer platform starting point:
  - https://www.cloudflare.com/plans/free/
  - https://www.cloudflare.com/plans/developer-platform/
