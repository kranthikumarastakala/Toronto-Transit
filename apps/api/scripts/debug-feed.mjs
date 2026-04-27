import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

const resp = await fetch('https://gtfsrt.ttc.ca/trips/update?format=binary');
const buf = await resp.arrayBuffer();
const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buf));
const entities = feed.entity ?? [];
console.log('Total trip entities:', entities.length);

// Collect all unique route IDs
const routeIds = new Set(entities.map(e => e.tripUpdate?.trip?.routeId).filter(Boolean));
const allRoutes = [...routeIds].sort();
console.log('Unique route IDs in feed:', allRoutes.join(', '));

// Find subway routes (TTC subway is route_id 1 and 2)
const subwayRouteIds = allRoutes.filter(r => r === '1' || r === '2' || r === '3' || r === '4');
console.log('Potential subway route IDs:', subwayRouteIds.join(', ') || 'NONE');

const subwayEntities = entities.filter(e => subwayRouteIds.includes(e.tripUpdate?.trip?.routeId));
console.log('Subway entities:', subwayEntities.length);

// Print first 3 subway entities if any
subwayEntities.slice(0, 3).forEach(e => {
  console.log('\nRoute:', e.tripUpdate?.trip?.routeId, 'Trip:', e.tripUpdate?.trip?.tripId);
  const stops = (e.tripUpdate?.stopTimeUpdate ?? []).slice(0, 5);
  stops.forEach(s => console.log('  stop_id:', s.stopId, 'seq:', String(s.stopSequence)));
});

// Show sample of first entity regardless
console.log('\n--- First entity sample ---');
const first = entities[0];
console.log('Route:', first?.tripUpdate?.trip?.routeId);
first?.tripUpdate?.stopTimeUpdate?.slice(0, 4).forEach(s =>
  console.log('  stop_id:', s.stopId)
);
