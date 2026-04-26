import { Hono } from "hono";
import { cors } from "hono/cors";
import { getFeedStatuses } from "./feed-status";
import {
  evaluateTtcCommute,
  getNearbyTtcStops,
  getTtcAlertSummaries,
  getTtcStopArrivals,
  getTtcVehicleSummary,
  getTtcVehiclePositions,
  searchTtcStops
} from "./ttc";
import { initKv, refreshGtfsToKv } from "./ttc-static";
import { transitSources } from "./transit-sources";

type Env = {
  Bindings: {
    GO_OPEN_DATA_API_KEY?: string;
    TRANSIT_DATA: KVNamespace;
  };
};

const app = new Hono<Env>();

// Initialise the KV binding for this isolate on every request
app.use("*", async (c, next) => {
  initKv(c.env.TRANSIT_DATA);
  await next();
});

function parseNumberQuery(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseIntegerQuery(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = parseNumberQuery(value);
  const valueOrFallback = parsed === null ? fallback : Math.floor(parsed);
  return Math.min(maximum, Math.max(minimum, valueOrFallback));
}

app.use(
  "/api/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "OPTIONS"]
  })
);

app.get("/api/health", (c) => {
  return c.json(
    {
      status: "ok",
      generatedAt: new Date().toISOString(),
      service: "signalto-api"
    },
    200,
    {
      "Cache-Control": "no-store"
    }
  );
});

app.get("/api/admin/warm", async (c) => {
  c.executionCtx.waitUntil(refreshGtfsToKv());
  return c.json({ status: "warming", message: "GTFS refresh triggered in background. Check /api/ttc/stops/nearby in ~3 minutes." }, 202);
});

app.get("/api/transit/sources", (c) => {
  return c.json(
    {
      generatedAt: new Date().toISOString(),
      sources: transitSources
    },
    200,
    {
      "Cache-Control": "public, max-age=300"
    }
  );
});

app.get("/api/feed-status", async (c) => {
  const statuses = await getFeedStatuses(c.env.GO_OPEN_DATA_API_KEY ?? null);

  return c.json(
    {
      generatedAt: new Date().toISOString(),
      statuses
    },
    200,
    {
      "Cache-Control": "public, max-age=45"
    }
  );
});

app.get("/api/ttc/alerts", async (c) => {
  try {
    const payload = await getTtcAlertSummaries();

    return c.json(payload, 200, {
      "Cache-Control": "public, max-age=30"
    });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Unable to load TTC alerts."
      },
      502
    );
  }
});

app.get("/api/ttc/stops/search", async (c) => {
  const query = c.req.query("q")?.trim() ?? "";

  if (query.length < 2) {
    return c.json(
      {
        error: "Query must be at least 2 characters."
      },
      400
    );
  }

  const limit = parseIntegerQuery(c.req.query("limit"), 8, 1, 12);

  try {
    const payload = await searchTtcStops(query, limit);

    return c.json(payload, 200, {
      "Cache-Control": "public, max-age=300"
    });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Unable to search TTC stops."
      },
      502
    );
  }
});

app.get("/api/ttc/stops/nearby", async (c) => {
  const latitude = parseNumberQuery(c.req.query("lat"));
  const longitude = parseNumberQuery(c.req.query("lon"));

  if (latitude === null || longitude === null) {
    return c.json(
      {
        error: "Valid lat and lon query parameters are required."
      },
      400
    );
  }

  const radiusMeters = parseIntegerQuery(c.req.query("radius"), 750, 150, 2_000);
  const limit = parseIntegerQuery(c.req.query("limit"), 8, 1, 12);

  try {
    const payload = await getNearbyTtcStops(latitude, longitude, radiusMeters, limit);

    return c.json(payload, 200, {
      "Cache-Control": "public, max-age=300"
    });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Unable to load nearby TTC stops."
      },
      502
    );
  }
});

app.get("/api/ttc/stops/:stopId/arrivals", async (c) => {
  try {
    const payload = await getTtcStopArrivals(c.req.param("stopId"));

    return c.json(payload, 200, {
      "Cache-Control": "public, max-age=20"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load TTC stop arrivals.";
    const status = message === "TTC stop not found" ? 404 : 502;

    return c.json(
      {
        error: message
      },
      status
    );
  }
});

app.get("/api/ttc/commutes/evaluate", async (c) => {
  const fromStopId = c.req.query("fromStopId")?.trim() ?? "";
  const toStopId = c.req.query("toStopId")?.trim() ?? "";

  if (!fromStopId || !toStopId) {
    return c.json(
      {
        error: "fromStopId and toStopId are required."
      },
      400
    );
  }

  try {
    const payload = await evaluateTtcCommute(fromStopId, toStopId);

    return c.json(payload, 200, {
      "Cache-Control": "public, max-age=20"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to evaluate TTC commute.";
    const status =
      message === "Origin and destination must be different" || message === "One or both TTC stops were not found"
        ? 400
        : 502;

    return c.json(
      {
        error: message
      },
      status
    );
  }
});

app.get("/api/ttc/vehicles/summary", async (c) => {
  try {
    const payload = await getTtcVehicleSummary();

    return c.json(payload, 200, {
      "Cache-Control": "public, max-age=20"
    });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Unable to load TTC vehicle positions."
      },
      502
    );
  }
});

app.get("/api/ttc/vehicles", async (c) => {
  try {
    const payload = await getTtcVehiclePositions();

    return c.json(payload, 200, {
      "Cache-Control": "public, max-age=15"
    });
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Unable to load TTC vehicle positions."
      },
      502
    );
  }
});

app.notFound((c) => {
  return c.json(
    {
      error: "Not found"
    },
    404
  );
});

type EnvBindings = Env["Bindings"];

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: EnvBindings, ctx: ExecutionContext) {
    initKv(env.TRANSIT_DATA);
    ctx.waitUntil(refreshGtfsToKv());
  }
};
