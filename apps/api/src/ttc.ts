import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { getTtcStaticDataset, toPublicStop } from "./ttc-static";
import { ttcAlertSource, ttcTripUpdateSource, ttcVehicleSource } from "./transit-sources";

const effectLabels: Record<number, string> = {
  1: "No service",
  2: "Reduced service",
  3: "Significant delays",
  4: "Detour",
  5: "Additional service",
  6: "Modified service",
  7: "Other effect",
  8: "Unknown effect",
  9: "Stop moved",
  10: "No effect",
  11: "Accessibility issue"
};

const routeTypeLabels: Record<number, string> = {
  0: "streetcar",
  1: "subway",
  3: "bus"
};

type TranslationText =
  | string
  | {
      translation?: Array<{
        text?: string | null;
      }> | null;
      text?: string | null;
    }
  | null
  | undefined;

type NumericLike =
  | number
  | {
      toNumber?: () => number;
      low?: number;
      high?: number;
      unsigned?: boolean;
    }
  | null
  | undefined;

type PublicStop = ReturnType<typeof toPublicStop>;

type TripStopEvent = {
  index: number;
  stopId: string;
  stopSequence: number | null;
  predictedUnix: number;
  predictedMs: number;
  delaySeconds: number | null;
};

type TripSnapshot = {
  tripId: string | null;
  routeId: string | null;
  routeShortName: string | null;
  routeLongName: string | null;
  routeTypeLabel: string;
  headsign: string | null;
  directionId: number | null;
  events: TripStopEvent[];
};

type CommuteLeg = {
  tripId: string | null;
  routeId: string | null;
  routeShortName: string | null;
  routeLongName: string | null;
  routeTypeLabel: string;
  headsign: string | null;
  directionId: number | null;
  departureStop: PublicStop;
  arrivalStop: PublicStop;
  departureTime: string | null;
  arrivalTime: string | null;
  scheduledDepartureTime: string | null;
  scheduledArrivalTime: string | null;
  minutesUntilDeparture: number;
  rideDurationMinutes: number;
  departureDelaySeconds: number | null;
  arrivalDelaySeconds: number | null;
};

type DirectCommuteOption = {
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

type TransferCommuteOption = {
  minutesUntilDeparture: number;
  transferWaitMinutes: number;
  transferWalkMeters: number;
  totalTravelMinutes: number;
  arrivalTime: string | null;
  transferStop: PublicStop;
  firstLeg: CommuteLeg;
  secondLeg: CommuteLeg;
};

type CommuteConfidence = {
  level: "high" | "moderate" | "low";
  score: number;
  summary: string;
  reasons: string[];
};

const MAX_TRANSFER_EVENTS_PER_TRIP = 12;
const MAX_FIRST_LEG_MINUTES = 45;
const MAX_SECOND_LEG_MINUTES = 70;
const MIN_TRANSFER_WAIT_MINUTES = 2;
const MAX_TRANSFER_WAIT_MINUTES = 25;

function translationToText(value: TranslationText): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value.trim() || null;
  }

  if (typeof value.text === "string" && value.text.trim().length > 0) {
    return value.text.trim();
  }

  if (Array.isArray(value.translation)) {
    for (const item of value.translation) {
      if (typeof item.text === "string" && item.text.trim().length > 0) {
        return item.text.trim();
      }
    }
  }

  return null;
}

async function decodeFeed(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/octet-stream"
    }
  });

  if (!response.ok) {
    throw new Error(`TTC feed request failed with ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(arrayBuffer));
}

function toNumericValue(value: NumericLike) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (value && typeof value === "object") {
    if (typeof value.toNumber === "function") {
      const numeric = value.toNumber();

      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }

    if (typeof value.low === "number" && Number.isFinite(value.low) && (value.high ?? 0) === 0) {
      return value.low;
    }
  }

  return null;
}

function formatIsoFromUnixSeconds(value: NumericLike) {
  const numeric = toNumericValue(value);
  return numeric !== null ? new Date(numeric * 1000).toISOString() : null;
}

function formatClockTime(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-CA", {
        timeStyle: "short"
      }).format(new Date(value))
    : null;
}

function sameStopSequence(left: TripStopEvent, right: TripStopEvent) {
  return (
    (left.stopSequence !== null && right.stopSequence !== null && right.stopSequence > left.stopSequence) ||
    right.index > left.index
  );
}

function buildTripSnapshots(
  feed: Awaited<ReturnType<typeof decodeFeed>>,
  dataset: Awaited<ReturnType<typeof getTtcStaticDataset>>,
  nowMs: number
) {
  return (feed.entity ?? [])
    .map((entity) => {
      const tripUpdate = entity.tripUpdate;

      if (!tripUpdate) {
        return null;
      }

      const tripId = tripUpdate.trip?.tripId ?? null;
      const trip = tripId ? dataset.tripsById.get(tripId) : null;
      const routeId = tripUpdate.trip?.routeId ?? trip?.routeId ?? null;
      const route = routeId ? dataset.routesById.get(routeId) : null;

      const events = (tripUpdate.stopTimeUpdate ?? [])
        .map((update, index) => {
          const stopId = update.stopId?.trim();
          const predictedUnix = toNumericValue(update.departure?.time ?? update.arrival?.time);

          if (!stopId || predictedUnix === null) {
            return null;
          }

          const predictedMs = predictedUnix * 1000;

          if (predictedMs < nowMs - 60_000) {
            return null;
          }

          return {
            index,
            stopId,
            stopSequence: toNumericValue(update.stopSequence),
            predictedUnix,
            predictedMs,
            delaySeconds: toNumericValue(update.departure?.delay ?? update.arrival?.delay)
          };
        })
        .filter((event): event is TripStopEvent => Boolean(event));

      if (events.length < 2) {
        return null;
      }

      return {
        tripId,
        routeId,
        routeShortName: route?.routeShortName ?? routeId,
        routeLongName: route?.routeLongName ?? null,
        routeTypeLabel: route?.routeTypeLabel ?? "transit",
        headsign: trip?.tripHeadsign ?? null,
        directionId: trip?.directionId ?? null,
        events
      };
    })
    .filter((snapshot): snapshot is TripSnapshot => Boolean(snapshot));
}

function buildCommuteLeg(
  snapshot: TripSnapshot,
  departureEvent: TripStopEvent,
  arrivalEvent: TripStopEvent,
  dataset: Awaited<ReturnType<typeof getTtcStaticDataset>>,
  nowMs: number
) {
  const departureStop = dataset.stopsById.get(departureEvent.stopId);
  const arrivalStop = dataset.stopsById.get(arrivalEvent.stopId);

  if (!departureStop || !arrivalStop || !sameStopSequence(departureEvent, arrivalEvent)) {
    return null;
  }

  return {
    tripId: snapshot.tripId,
    routeId: snapshot.routeId,
    routeShortName: snapshot.routeShortName,
    routeLongName: snapshot.routeLongName,
    routeTypeLabel: snapshot.routeTypeLabel,
    headsign: snapshot.headsign,
    directionId: snapshot.directionId,
    departureStop: toPublicStop(departureStop),
    arrivalStop: toPublicStop(arrivalStop),
    departureTime: formatIsoFromUnixSeconds(departureEvent.predictedUnix),
    arrivalTime: formatIsoFromUnixSeconds(arrivalEvent.predictedUnix),
    scheduledDepartureTime:
      typeof departureEvent.delaySeconds === "number"
        ? formatIsoFromUnixSeconds(departureEvent.predictedUnix - departureEvent.delaySeconds)
        : null,
    scheduledArrivalTime:
      typeof arrivalEvent.delaySeconds === "number"
        ? formatIsoFromUnixSeconds(arrivalEvent.predictedUnix - arrivalEvent.delaySeconds)
        : null,
    minutesUntilDeparture: Math.max(0, Math.round((departureEvent.predictedMs - nowMs) / 60_000)),
    rideDurationMinutes: Math.max(1, Math.round((arrivalEvent.predictedMs - departureEvent.predictedMs) / 60_000)),
    departureDelaySeconds: departureEvent.delaySeconds,
    arrivalDelaySeconds: arrivalEvent.delaySeconds
  };
}

function toDirectOption(leg: CommuteLeg): DirectCommuteOption {
  return {
    tripId: leg.tripId,
    routeId: leg.routeId,
    routeShortName: leg.routeShortName,
    routeLongName: leg.routeLongName,
    routeTypeLabel: leg.routeTypeLabel,
    headsign: leg.headsign,
    directionId: leg.directionId,
    departureTime: leg.departureTime,
    arrivalTime: leg.arrivalTime,
    scheduledDepartureTime: leg.scheduledDepartureTime,
    scheduledArrivalTime: leg.scheduledArrivalTime,
    minutesUntilDeparture: leg.minutesUntilDeparture,
    rideDurationMinutes: leg.rideDurationMinutes,
    originDelaySeconds: leg.departureDelaySeconds,
    destinationDelaySeconds: leg.arrivalDelaySeconds
  };
}

function stopMatchKeys(stopId: string, dataset: Awaited<ReturnType<typeof getTtcStaticDataset>>) {
  const stop = dataset.stopsById.get(stopId);
  return stop?.parentStation ? [stopId, `parent:${stop.parentStation}`] : [stopId];
}

function getBoardableStopIds(stopId: string, dataset: Awaited<ReturnType<typeof getTtcStaticDataset>>) {
  const stop = dataset.stopsById.get(stopId);

  if (!stop) {
    console.warn(`[getBoardableStopIds] Stop not found: ${stopId}`);
    return [];
  }

  if (stop.locationType !== 1) {
    return [stopId];
  }

  const childStopIds = dataset.stops
    .filter((candidate) => candidate.parentStation === stopId && candidate.locationType === 0)
    .map((candidate) => candidate.stopId);

  if (childStopIds.length === 0) {
    console.warn(`[getBoardableStopIds] Parent station has no child stops: ${stopId} (${stop.stopName})`);
  }

  return childStopIds.length ? childStopIds : [stopId];
}

/**
 * Returns all boardable stop IDs within `radiusMeters` of the given stop.
 * This catches cases where the user selected a bus bay at a subway station —
 * the subway platform stops are a short distance away with different stop IDs.
 */
function expandToNearbyBoardableStops(
  stopId: string,
  dataset: Awaited<ReturnType<typeof getTtcStaticDataset>>,
  radiusMeters = 250
): string[] {
  const anchor = dataset.stopsById.get(stopId);
  if (!anchor) return [];

  return dataset.stops
    .filter(
      (s) =>
        s.stopId !== stopId &&
        s.locationType === 0 &&
        haversineMeters(anchor.latitude, anchor.longitude, s.latitude, s.longitude) <= radiusMeters
    )
    .map((s) => s.stopId);
}

function sortDirectCommuteOptions(options: DirectCommuteOption[]) {
  return options
    .sort((left, right) => {
      const leftDeparture = left.departureTime ? Date.parse(left.departureTime) : Number.MAX_SAFE_INTEGER;
      const rightDeparture = right.departureTime ? Date.parse(right.departureTime) : Number.MAX_SAFE_INTEGER;

      if (leftDeparture !== rightDeparture) {
        return leftDeparture - rightDeparture;
      }

      const leftArrival = left.arrivalTime ? Date.parse(left.arrivalTime) : Number.MAX_SAFE_INTEGER;
      const rightArrival = right.arrivalTime ? Date.parse(right.arrivalTime) : Number.MAX_SAFE_INTEGER;

      return leftArrival - rightArrival;
    })
    .slice(0, 6);
}

function dedupeDirectCommuteOptions(options: DirectCommuteOption[]) {
  const deduped = new Map<string, DirectCommuteOption>();

  for (const option of options) {
    const key = [
      option.tripId ?? "trip",
      option.routeId ?? "route",
      option.departureTime ?? "departure",
      option.arrivalTime ?? "arrival"
    ].join("|");

    if (!deduped.has(key)) {
      deduped.set(key, option);
    }
  }

  return sortDirectCommuteOptions(Array.from(deduped.values()));
}

function sortTransferCommuteOptions(options: TransferCommuteOption[]) {
  return options
    .sort((left, right) => {
      const leftDeparture = left.firstLeg.departureTime ? Date.parse(left.firstLeg.departureTime) : Number.MAX_SAFE_INTEGER;
      const rightDeparture = right.firstLeg.departureTime ? Date.parse(right.firstLeg.departureTime) : Number.MAX_SAFE_INTEGER;

      if (leftDeparture !== rightDeparture) {
        return leftDeparture - rightDeparture;
      }

      const leftArrival = left.arrivalTime ? Date.parse(left.arrivalTime) : Number.MAX_SAFE_INTEGER;
      const rightArrival = right.arrivalTime ? Date.parse(right.arrivalTime) : Number.MAX_SAFE_INTEGER;

      return leftArrival - rightArrival;
    })
    .slice(0, 6);
}

function dedupeTransferCommuteOptions(options: TransferCommuteOption[]) {
  const deduped = new Map<string, TransferCommuteOption>();

  for (const option of options) {
    const key = [
      option.firstLeg.tripId ?? "first",
      option.secondLeg.tripId ?? "second",
      option.transferStop.stopId,
      option.firstLeg.departureTime ?? "departure",
      option.arrivalTime ?? "arrival"
    ].join("|");

    if (!deduped.has(key)) {
      deduped.set(key, option);
    }
  }

  return sortTransferCommuteOptions(Array.from(deduped.values()));
}

function calculateTransferWalkMeters(
  originStopId: string,
  boardingStopId: string,
  dataset: Awaited<ReturnType<typeof getTtcStaticDataset>>
) {
  if (originStopId === boardingStopId) {
    return 0;
  }

  const originStop = dataset.stopsById.get(originStopId);
  const boardingStop = dataset.stopsById.get(boardingStopId);

  if (!originStop || !boardingStop) {
    return 0;
  }

  return Math.round(
    haversineMeters(originStop.latitude, originStop.longitude, boardingStop.latitude, boardingStop.longitude)
  );
}

function resolveTransferStop(
  originStopId: string,
  boardingStopId: string,
  dataset: Awaited<ReturnType<typeof getTtcStaticDataset>>
) {
  const originStop = dataset.stopsById.get(originStopId);
  const boardingStop = dataset.stopsById.get(boardingStopId);

  if (
    originStop?.parentStation &&
    boardingStop?.parentStation &&
    originStop.parentStation === boardingStop.parentStation
  ) {
    const parentStation = dataset.stopsById.get(originStop.parentStation);

    if (parentStation) {
      return toPublicStop(parentStation);
    }
  }

  return toPublicStop(originStop ?? boardingStop!);
}

function buildCommuteRecommendation(
  primaryDirect: DirectCommuteOption | null,
  backupDirect: DirectCommuteOption | null,
  primaryTransfer: TransferCommuteOption | null,
  backupTransfer: TransferCommuteOption | null
) {
  if (primaryDirect) {
    const routeLabel = primaryDirect.routeShortName ? `Route ${primaryDirect.routeShortName}` : "the next TTC vehicle";
    const arrivalLabel = primaryDirect.arrivalTime
      ? `arrive around ${formatClockTime(primaryDirect.arrivalTime)}`
      : "arrive later";
    const backupDetail = backupDirect
      ? `Backup: ${backupDirect.routeShortName ? `Route ${backupDirect.routeShortName}` : "another direct option"} in ${backupDirect.minutesUntilDeparture} min.`
      : primaryTransfer
        ? `Fallback: transfer at ${primaryTransfer.transferStop.stopName} if you miss this vehicle.`
        : null;

    if (primaryDirect.minutesUntilDeparture <= 3) {
      return {
        status: "leave_now" as const,
        journeyType: "direct" as const,
        headline: `Leave now for ${routeLabel}`,
        detail: `Board within ${Math.max(0, primaryDirect.minutesUntilDeparture)} min and ${arrivalLabel}.`,
        backupDetail
      };
    }

    if (primaryDirect.minutesUntilDeparture <= 10) {
      return {
        status: "leave_soon" as const,
        journeyType: "direct" as const,
        headline: `${routeLabel} leaves in ${primaryDirect.minutesUntilDeparture} min`,
        detail: `You have a short buffer before departure and should head out soon to ${arrivalLabel}.`,
        backupDetail
      };
    }

    return {
      status: "plan_ahead" as const,
      journeyType: "direct" as const,
      headline: `Your next direct option is in ${primaryDirect.minutesUntilDeparture} min`,
      detail: `${routeLabel} is the best direct ride at the moment and should ${arrivalLabel}.`,
      backupDetail
    };
  }

  if (primaryTransfer) {
    const firstRoute = primaryTransfer.firstLeg.routeShortName
      ? `Route ${primaryTransfer.firstLeg.routeShortName}`
      : "your first TTC leg";
    const secondRoute = primaryTransfer.secondLeg.routeShortName
      ? `Route ${primaryTransfer.secondLeg.routeShortName}`
      : "your connecting TTC leg";
    const arrivalLabel = primaryTransfer.arrivalTime
      ? `arrive around ${formatClockTime(primaryTransfer.arrivalTime)}`
      : "arrive later";
    const walkDetail =
      primaryTransfer.transferWalkMeters > 0 ? ` Walk about ${primaryTransfer.transferWalkMeters} m between vehicles.` : "";
    const backupDetail = backupTransfer
      ? `Backup transfer: ${backupTransfer.firstLeg.routeShortName ? `Route ${backupTransfer.firstLeg.routeShortName}` : "first leg"} then ${backupTransfer.secondLeg.routeShortName ? `Route ${backupTransfer.secondLeg.routeShortName}` : "second leg"}.`
      : null;

    if (primaryTransfer.minutesUntilDeparture <= 3) {
      return {
        status: "leave_now" as const,
        journeyType: "transfer" as const,
        headline: `Leave now and transfer at ${primaryTransfer.transferStop.stopName}`,
        detail: `Take ${firstRoute}, then switch to ${secondRoute}. Transfer wait about ${primaryTransfer.transferWaitMinutes} min and ${arrivalLabel}.${walkDetail}`,
        backupDetail
      };
    }

    if (primaryTransfer.minutesUntilDeparture <= 10) {
      return {
        status: "leave_soon" as const,
        journeyType: "transfer" as const,
        headline: `Head out soon for a transfer at ${primaryTransfer.transferStop.stopName}`,
        detail: `Catch ${firstRoute}, then change to ${secondRoute}. Transfer wait about ${primaryTransfer.transferWaitMinutes} min and ${arrivalLabel}.${walkDetail}`,
        backupDetail
      };
    }

    return {
      status: "plan_ahead" as const,
      journeyType: "transfer" as const,
      headline: `Your best live trip uses a transfer at ${primaryTransfer.transferStop.stopName}`,
      detail: `${firstRoute} to ${secondRoute} is the best fallback right now. Leave in ${primaryTransfer.minutesUntilDeparture} min and ${arrivalLabel}.${walkDetail}`,
      backupDetail
    };
  }

  return {
    status: "no_direct_trip" as const,
    journeyType: "none" as const,
    headline: "No live route is visible right now",
    detail: "We could not find a direct or one-transfer TTC trip in the current live feed for this stop pair.",
    backupDetail: null
  };
}

function buildDirectCommuteConfidence(
  primary: DirectCommuteOption | null,
  backup: DirectCommuteOption | null,
  totalOptions: number,
  transferFallback: TransferCommuteOption | null
): CommuteConfidence {
  if (!primary) {
    return buildTransferCommuteConfidence(null, null, 0);
  }

  let score = 46;
  const reasons: string[] = [];

  if (totalOptions >= 3) {
    score += 16;
    reasons.push(`${totalOptions} direct ride options are visible right now.`);
  } else if (totalOptions === 2) {
    score += 10;
    reasons.push("More than one direct ride is available right now.");
  } else {
    reasons.push("Only one direct ride is visible right now.");
  }

  if (backup) {
    score += 10;
    reasons.push(
      `A backup direct ride${backup.routeShortName ? ` on Route ${backup.routeShortName}` : ""} is also available.`
    );
  } else if (transferFallback) {
    score += 4;
    reasons.push(`A transfer fallback via ${transferFallback.transferStop.stopName} is also available.`);
  }

  const originDelay = primary.originDelaySeconds === null ? null : Math.abs(primary.originDelaySeconds);
  const destinationDelay =
    primary.destinationDelaySeconds === null ? null : Math.abs(primary.destinationDelaySeconds);

  if (originDelay === null) {
    reasons.push("Departure timing is available from the realtime trip update feed.");
  } else if (originDelay <= 120) {
    score += 12;
    reasons.push("The primary departure is staying close to schedule.");
  } else if (originDelay <= 300) {
    score += 4;
    reasons.push(`The primary departure is drifting by about ${Math.round(originDelay / 60)} min.`);
  } else {
    score -= 10;
    reasons.push(`The primary departure is delayed by about ${Math.round(originDelay / 60)} min.`);
  }

  if (destinationDelay !== null) {
    if (destinationDelay <= 180) {
      score += 8;
    } else if (destinationDelay > 420) {
      score -= 8;
    }
  }

  if (primary.minutesUntilDeparture <= 2) {
    score -= 4;
    reasons.push("The departure window is tight, so this recommendation can change quickly.");
  }

  const boundedScore = Math.max(18, Math.min(96, score));
  const level = boundedScore >= 76 ? "high" : boundedScore >= 52 ? "moderate" : "low";

  return {
    level,
    score: boundedScore,
    summary: `${level.charAt(0).toUpperCase() + level.slice(1)} confidence`,
    reasons: reasons.slice(0, 4)
  };
}

function buildTransferCommuteConfidence(
  primary: TransferCommuteOption | null,
  backup: TransferCommuteOption | null,
  totalOptions: number
): CommuteConfidence {
  if (!primary) {
    return {
      level: "low",
      score: 20,
      summary: "Low confidence",
      reasons: [
        "No direct TTC trip is currently visible in the live feed for this stop pair.",
        "No one-transfer TTC fallback is visible in the current feed either."
      ]
    };
  }

  let score = 38;
  const reasons: string[] = [];

  if (totalOptions >= 2) {
    score += 10;
    reasons.push(`${totalOptions} live transfer paths are visible right now.`);
  } else {
    reasons.push("Only one transfer path is visible right now.");
  }

  if (backup) {
    score += 6;
    reasons.push(`A backup transfer through ${backup.transferStop.stopName} is also available.`);
  }

  if (primary.transferWaitMinutes >= 3 && primary.transferWaitMinutes <= 8) {
    score += 16;
    reasons.push("The transfer window looks healthy for a normal connection.");
  } else if (primary.transferWaitMinutes <= 2) {
    score -= 10;
    reasons.push("The transfer window is tight and could shift with live delays.");
  } else if (primary.transferWaitMinutes >= 15) {
    score -= 6;
    reasons.push("The transfer wait is longer than ideal.");
  }

  if (primary.transferWalkMeters <= 40) {
    score += 10;
    reasons.push("The transfer stays within the same stop or station area.");
  } else if (primary.transferWalkMeters >= 180) {
    score -= 6;
    reasons.push(`The transfer requires a longer walk of about ${primary.transferWalkMeters} m.`);
  }

  const departureDelay = primary.firstLeg.departureDelaySeconds === null ? null : Math.abs(primary.firstLeg.departureDelaySeconds);
  const arrivalDelay = primary.secondLeg.arrivalDelaySeconds === null ? null : Math.abs(primary.secondLeg.arrivalDelaySeconds);

  if ((departureDelay ?? 0) <= 180 && (arrivalDelay ?? 0) <= 180) {
    score += 10;
    reasons.push("Both legs are staying reasonably close to schedule.");
  } else {
    reasons.push("At least one leg is drifting from schedule.");
  }

  const boundedScore = Math.max(18, Math.min(90, score));
  const level = boundedScore >= 72 ? "high" : boundedScore >= 48 ? "moderate" : "low";

  return {
    level,
    score: boundedScore,
    summary: `${level.charAt(0).toUpperCase() + level.slice(1)} confidence`,
    reasons: reasons.slice(0, 4)
  };
}

export async function getTtcAlertSummaries() {
  const feed = await decodeFeed(ttcAlertSource.url);

  const alerts = (feed.entity ?? [])
    .map((entity) => {
      const alert = entity.alert;

      if (!alert) {
        return null;
      }

      const routes = Array.from(
        new Set(
          (alert.informedEntity ?? [])
            .map((item) => item.routeId)
            .filter((routeId): routeId is string => Boolean(routeId))
        )
      );

      const routeTypes = Array.from(
        new Set(
          (alert.informedEntity ?? [])
            .map((item) => item.routeType)
            .filter((routeType): routeType is number => typeof routeType === "number")
            .map((routeType) => routeTypeLabels[routeType] ?? `type-${routeType}`)
        )
      );

      const firstPeriod = alert.activePeriod?.[0];

      return {
        id: entity.id,
        headerText: translationToText(alert.headerText) ?? "Unnamed TTC alert",
        descriptionText: translationToText(alert.descriptionText),
        effect: effectLabels[alert.effect ?? 0] ?? "Service advisory",
        routes,
        routeTypes,
        activePeriodStart: formatIsoFromUnixSeconds(firstPeriod?.start),
        activePeriodEnd: formatIsoFromUnixSeconds(firstPeriod?.end)
      };
    })
    .filter((alert): alert is NonNullable<typeof alert> => Boolean(alert))
    .sort((left, right) => left.headerText.localeCompare(right.headerText));

  return {
    generatedAt: formatIsoFromUnixSeconds(feed.header?.timestamp) ?? new Date().toISOString(),
    totalAlerts: alerts.length,
    alerts
  };
}

export async function getTtcVehicleSummary() {
  const feed = await decodeFeed(ttcVehicleSource.url);
  const entities = feed.entity ?? [];
  const vehicles = entities
    .map((entity) => entity.vehicle)
    .filter((vehicle): vehicle is NonNullable<typeof vehicle> => Boolean(vehicle));

  const routeCounts = new Map<string, number>();

  for (const vehicle of vehicles) {
    const routeId = vehicle.trip?.routeId ?? "unknown";
    routeCounts.set(routeId, (routeCounts.get(routeId) ?? 0) + 1);
  }

  const busiestRoutes = Array.from(routeCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([routeId, count]) => ({
      routeId,
      activeVehicles: count
    }));

  const sampleVehicles = vehicles.slice(0, 8).map((vehicle) => ({
    vehicleId: vehicle.vehicle?.id ?? null,
    label: vehicle.vehicle?.label ?? null,
    routeId: vehicle.trip?.routeId ?? null,
    tripId: vehicle.trip?.tripId ?? null,
    latitude: vehicle.position?.latitude ?? null,
    longitude: vehicle.position?.longitude ?? null
  }));

  return {
    generatedAt: formatIsoFromUnixSeconds(feed.header?.timestamp) ?? new Date().toISOString(),
    totalVehicles: vehicles.length,
    busiestRoutes,
    sampleVehicles
  };
}

export async function getTtcVehiclePositions() {
  const [vehicleFeed, staticDataset] = await Promise.all([
    decodeFeed(ttcVehicleSource.url),
    getTtcStaticDataset()
  ]);

  const entities = vehicleFeed.entity ?? [];
  const vehicles = entities
    .map((entity) => entity.vehicle)
    .filter((vehicle): vehicle is NonNullable<typeof vehicle> => Boolean(vehicle))
    .filter((vehicle) => vehicle.position?.latitude && vehicle.position?.longitude)
    .map((vehicle) => {
      const routeId = vehicle.trip?.routeId ?? null;
      const route = routeId ? staticDataset.routesById.get(routeId) : null;
      const routeTypeLabel = route?.routeTypeLabel ?? "bus";
      const bearingRaw = vehicle.position?.bearing;
      const bearing =
        bearingRaw !== null && bearingRaw !== undefined
          ? typeof bearingRaw === "number"
            ? bearingRaw
            : typeof (bearingRaw as { toNumber?: () => number }).toNumber === "function"
              ? (bearingRaw as { toNumber: () => number }).toNumber()
              : null
          : null;
      return {
        vehicleId: vehicle.vehicle?.id ?? null,
        label: vehicle.vehicle?.label ?? null,
        routeId,
        routeShortName: route?.routeShortName ?? routeId,
        routeTypeLabel,
        tripId: vehicle.trip?.tripId ?? null,
        latitude: vehicle.position!.latitude as number,
        longitude: vehicle.position!.longitude as number,
        bearing,
        currentStatus: vehicle.currentStatus ?? null
      };
    });

  return {
    generatedAt: formatIsoFromUnixSeconds(vehicleFeed.header?.timestamp) ?? new Date().toISOString(),
    totalVehicles: vehicles.length,
    vehicles
  };
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLon / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(a));
}

export async function searchTtcStops(query: string, limit = 8) {
  const dataset = await getTtcStaticDataset();
  const normalizedQuery = query.trim().toLowerCase();

  const scoredStops = dataset.stops
    .map((stop) => {
      const exactCodeMatch = stop.stopCode?.toLowerCase() === normalizedQuery ? 120 : 0;
      const prefixMatch = stop.stopName.toLowerCase().startsWith(normalizedQuery) ? 80 : 0;
      const containsName = stop.stopName.toLowerCase().includes(normalizedQuery) ? 50 : 0;
      const containsText = stop.searchText.includes(normalizedQuery) ? 25 : 0;
      const score = exactCodeMatch + prefixMatch + containsName + containsText;

      return {
        stop,
        score
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.stop.stopName.localeCompare(right.stop.stopName);
    });

  const stops = scoredStops.slice(0, limit).map((item) => toPublicStop(item.stop));

  return {
    generatedAt: dataset.fetchedAt,
    query,
    totalMatches: scoredStops.length,
    stops
  };
}

export async function getNearbyTtcStops(latitude: number, longitude: number, radiusMeters: number, limit: number) {
  const dataset = await getTtcStaticDataset();

  const byDistance = dataset.stops
    .map((stop) => ({
      stop,
      distanceMeters: Math.round(haversineMeters(latitude, longitude, stop.latitude, stop.longitude))
    }))
    .sort((left, right) => left.distanceMeters - right.distanceMeters);

  const withinRadius = byDistance.filter((item) => item.distanceMeters <= radiusMeters).slice(0, limit);
  const fallbackToNearest = withinRadius.length === 0;
  const selected = fallbackToNearest ? byDistance.slice(0, limit) : withinRadius;

  return {
    generatedAt: dataset.fetchedAt,
    referencePoint: {
      latitude,
      longitude
    },
    radiusMeters,
    fallbackToNearest,
    stops: selected.map((item) => ({
      ...toPublicStop(item.stop),
      distanceMeters: item.distanceMeters
    }))
  };
}

export async function getTtcStopArrivals(stopId: string) {
  const dataset = await getTtcStaticDataset();
  const stop = dataset.stopsById.get(stopId);

  if (!stop) {
    throw new Error("TTC stop not found");
  }

  const targetStopIds = new Set(getBoardableStopIds(stopId, dataset));
  const feed = await decodeFeed(ttcTripUpdateSource.url);
  const nowMs = Date.now();
  const arrivals = (feed.entity ?? [])
    .flatMap((entity) => {
      const tripUpdate = entity.tripUpdate;

      if (!tripUpdate) {
        return [];
      }

      const tripId = tripUpdate.trip?.tripId ?? null;
      const trip = tripId ? dataset.tripsById.get(tripId) : null;
      const routeId = tripUpdate.trip?.routeId ?? trip?.routeId ?? null;
      const route = routeId ? dataset.routesById.get(routeId) : null;

      return (tripUpdate.stopTimeUpdate ?? [])
        .filter((update) => targetStopIds.has(update.stopId ?? ""))
        .map((update) => {
          const predictedUnix = toNumericValue(update.departure?.time ?? update.arrival?.time);

          if (predictedUnix === null) {
            return null;
          }

          const predictedMs = predictedUnix * 1000;

          if (predictedMs < nowMs - 60_000) {
            return null;
          }

          const delaySeconds = update.departure?.delay ?? update.arrival?.delay ?? null;
          const scheduleRelationship = update.scheduleRelationship ?? null;
          const scheduledUnix =
            typeof delaySeconds === "number" ? predictedUnix - delaySeconds : null;

          return {
            tripId,
            routeId,
            routeShortName: route?.routeShortName ?? routeId,
            routeLongName: route?.routeLongName ?? null,
            routeTypeLabel: route?.routeTypeLabel ?? "transit",
            headsign: trip?.tripHeadsign ?? null,
            directionId: trip?.directionId ?? null,
            predictedDepartureTime: formatIsoFromUnixSeconds(predictedUnix),
            scheduledDepartureTime: formatIsoFromUnixSeconds(scheduledUnix),
            minutesAway: Math.max(0, Math.round((predictedMs - nowMs) / 60_000)),
            delaySeconds,
            stopSequence: toNumericValue(update.stopSequence),
            scheduleRelationship
          };
        })
        .filter((arrival): arrival is NonNullable<typeof arrival> => Boolean(arrival));
    })
    .sort((left, right) => {
      const leftTime = left.predictedDepartureTime ? Date.parse(left.predictedDepartureTime) : Number.MAX_SAFE_INTEGER;
      const rightTime = right.predictedDepartureTime
        ? Date.parse(right.predictedDepartureTime)
        : Number.MAX_SAFE_INTEGER;

      return leftTime - rightTime;
    })
    .slice(0, 12);

  return {
    generatedAt: formatIsoFromUnixSeconds(feed.header?.timestamp) ?? new Date().toISOString(),
    stop: toPublicStop(stop),
    totalArrivals: arrivals.length,
    arrivals
  };
}

function buildDirectOptions(
  snapshots: TripSnapshot[],
  fromStopId: string,
  toStopId: string,
  dataset: Awaited<ReturnType<typeof getTtcStaticDataset>>,
  nowMs: number
) {
  return snapshots
    .map((snapshot) => {
      let originEvent: TripStopEvent | null = null;
      let destinationEvent: TripStopEvent | null = null;

      for (const event of snapshot.events) {
        if (!originEvent && event.stopId === fromStopId) {
          originEvent = event;
          continue;
        }

        if (originEvent && event.stopId === toStopId && sameStopSequence(originEvent, event)) {
          destinationEvent = event;
          break;
        }
      }

      if (!originEvent || !destinationEvent) {
        return null;
      }

      const leg = buildCommuteLeg(snapshot, originEvent, destinationEvent, dataset, nowMs);

      return leg ? toDirectOption(leg) : null;
    })
    .filter((option): option is DirectCommuteOption => Boolean(option))
    .sort((left, right) => {
      const leftDeparture = left.departureTime ? Date.parse(left.departureTime) : Number.MAX_SAFE_INTEGER;
      const rightDeparture = right.departureTime ? Date.parse(right.departureTime) : Number.MAX_SAFE_INTEGER;
      return leftDeparture - rightDeparture;
    })
    .slice(0, 6);
}

function buildTransferOptions(
  snapshots: TripSnapshot[],
  fromStopId: string,
  toStopId: string,
  dataset: Awaited<ReturnType<typeof getTtcStaticDataset>>,
  nowMs: number
) {
  const secondLegsByKey = new Map<
    string,
    Array<{
      boardingEvent: TripStopEvent;
      destinationEvent: TripStopEvent;
      leg: CommuteLeg;
    }>
  >();

  for (const snapshot of snapshots) {
    const destinationIndex = snapshot.events.findIndex((event) => event.stopId === toStopId);

    if (destinationIndex < 1) {
      continue;
    }

    const destinationEvent = snapshot.events[destinationIndex];
    let collected = 0;

    for (let index = destinationIndex - 1; index >= 0 && collected < MAX_TRANSFER_EVENTS_PER_TRIP; index -= 1) {
      const boardingEvent = snapshot.events[index];

      if (!sameStopSequence(boardingEvent, destinationEvent)) {
        continue;
      }

      if (destinationEvent.predictedMs - boardingEvent.predictedMs > MAX_SECOND_LEG_MINUTES * 60_000) {
        break;
      }

      const leg = buildCommuteLeg(snapshot, boardingEvent, destinationEvent, dataset, nowMs);

      if (!leg) {
        continue;
      }

      const candidate = {
        boardingEvent,
        destinationEvent,
        leg
      };

      for (const key of stopMatchKeys(boardingEvent.stopId, dataset)) {
        const current = secondLegsByKey.get(key) ?? [];
        current.push(candidate);
        secondLegsByKey.set(key, current);
      }

      collected += 1;
    }
  }

  for (const candidates of secondLegsByKey.values()) {
    candidates.sort((left, right) => {
      const leftDeparture = left.leg.departureTime ? Date.parse(left.leg.departureTime) : Number.MAX_SAFE_INTEGER;
      const rightDeparture = right.leg.departureTime ? Date.parse(right.leg.departureTime) : Number.MAX_SAFE_INTEGER;
      return leftDeparture - rightDeparture;
    });
  }

  const options: TransferCommuteOption[] = [];
  const seen = new Set<string>();

  for (const snapshot of snapshots) {
    const originIndex = snapshot.events.findIndex((event) => event.stopId === fromStopId);

    if (originIndex < 0) {
      continue;
    }

    const originEvent = snapshot.events[originIndex];
    let collected = 0;

    for (let index = originIndex + 1; index < snapshot.events.length && collected < MAX_TRANSFER_EVENTS_PER_TRIP; index += 1) {
      const transferArrivalEvent = snapshot.events[index];

      if (!sameStopSequence(originEvent, transferArrivalEvent)) {
        continue;
      }

      if (transferArrivalEvent.predictedMs - originEvent.predictedMs > MAX_FIRST_LEG_MINUTES * 60_000) {
        break;
      }

      const firstLeg = buildCommuteLeg(snapshot, originEvent, transferArrivalEvent, dataset, nowMs);

      if (!firstLeg) {
        continue;
      }

      const secondLegCandidates = stopMatchKeys(transferArrivalEvent.stopId, dataset).flatMap(
        (key) => secondLegsByKey.get(key) ?? []
      );

      for (const secondLegCandidate of secondLegCandidates) {
        if (secondLegCandidate.leg.tripId === firstLeg.tripId && secondLegCandidate.leg.routeId === firstLeg.routeId) {
          continue;
        }

        const transferWalkMeters = calculateTransferWalkMeters(
          transferArrivalEvent.stopId,
          secondLegCandidate.boardingEvent.stopId,
          dataset
        );
        const walkMinutes = transferWalkMeters > 0 ? Math.max(1, Math.ceil(transferWalkMeters / 80)) : 0;
        const earliestConnectionMs =
          transferArrivalEvent.predictedMs + (MIN_TRANSFER_WAIT_MINUTES + walkMinutes) * 60_000;

        if (secondLegCandidate.boardingEvent.predictedMs < earliestConnectionMs) {
          continue;
        }

        const transferWaitMinutes = Math.max(
          0,
          Math.round((secondLegCandidate.boardingEvent.predictedMs - transferArrivalEvent.predictedMs) / 60_000)
        );

        if (transferWaitMinutes > MAX_TRANSFER_WAIT_MINUTES) {
          continue;
        }

        const totalTravelMinutes = Math.max(
          1,
          Math.round((secondLegCandidate.destinationEvent.predictedMs - originEvent.predictedMs) / 60_000)
        );
        const transferStop = resolveTransferStop(transferArrivalEvent.stopId, secondLegCandidate.boardingEvent.stopId, dataset);
        const optionKey = [
          firstLeg.tripId ?? firstLeg.routeId ?? "first",
          secondLegCandidate.leg.tripId ?? secondLegCandidate.leg.routeId ?? "second",
          transferStop.stopId,
          secondLegCandidate.boardingEvent.stopId
        ].join(":");

        if (seen.has(optionKey)) {
          continue;
        }

        seen.add(optionKey);
        options.push({
          minutesUntilDeparture: firstLeg.minutesUntilDeparture,
          transferWaitMinutes,
          transferWalkMeters,
          totalTravelMinutes,
          arrivalTime: secondLegCandidate.leg.arrivalTime,
          transferStop,
          firstLeg,
          secondLeg: secondLegCandidate.leg
        });
      }

      collected += 1;
    }
  }

  return options
    .sort((left, right) => {
      const leftDeparture = left.firstLeg.departureTime ? Date.parse(left.firstLeg.departureTime) : Number.MAX_SAFE_INTEGER;
      const rightDeparture = right.firstLeg.departureTime ? Date.parse(right.firstLeg.departureTime) : Number.MAX_SAFE_INTEGER;

      if (leftDeparture !== rightDeparture) {
        return leftDeparture - rightDeparture;
      }

      const leftArrival = left.arrivalTime ? Date.parse(left.arrivalTime) : Number.MAX_SAFE_INTEGER;
      const rightArrival = right.arrivalTime ? Date.parse(right.arrivalTime) : Number.MAX_SAFE_INTEGER;

      return leftArrival - rightArrival;
    })
    .slice(0, 6);
}

export async function evaluateTtcCommute(fromStopId: string, toStopId: string) {
  if (fromStopId === toStopId) {
    throw new Error("Origin and destination must be different");
  }

  const dataset = await getTtcStaticDataset();
  const fromStop = dataset.stopsById.get(fromStopId);
  const toStop = dataset.stopsById.get(toStopId);

  if (!fromStop || !toStop) {
    throw new Error(`One or both TTC stops were not found (from: ${fromStopId}, to: ${toStopId})`);
  }

  const feed = await decodeFeed(ttcTripUpdateSource.url);
  const nowMs = Date.now();
  const snapshots = buildTripSnapshots(feed, dataset, nowMs);
  
  if (snapshots.length === 0) {
    console.warn(`[evaluateTtcCommute] No trip snapshots found in realtime feed (${feed.entity?.length ?? 0} entities)`);
  }
  
  const fromCandidateStopIds = Array.from(
    new Set([
      ...getBoardableStopIds(fromStopId, dataset),
      ...expandToNearbyBoardableStops(fromStopId, dataset, 250)
    ])
  ).slice(0, 25);
  const toCandidateStopIds = Array.from(
    new Set([
      ...getBoardableStopIds(toStopId, dataset),
      ...expandToNearbyBoardableStops(toStopId, dataset, 250)
    ])
  ).slice(0, 25);
  
  if (fromCandidateStopIds.length === 0) {
    throw new Error(`No boardable stops found for origin ${fromStopId} (${fromStop.stopName})`);
  }
  if (toCandidateStopIds.length === 0) {
    throw new Error(`No boardable stops found for destination ${toStopId} (${toStop.stopName})`);
  }
  
  console.log(`[evaluateTtcCommute] Searching: from [${fromCandidateStopIds.join(',')}] to [${toCandidateStopIds.join(',')}] (${snapshots.length} snapshots)`);
  const options = dedupeDirectCommuteOptions(
    fromCandidateStopIds.flatMap((fromCandidateStopId) =>
      toCandidateStopIds.flatMap((toCandidateStopId) => {
        if (fromCandidateStopId === toCandidateStopId) {
          return [];
        }

        const directOptions = buildDirectOptions(snapshots, fromCandidateStopId, toCandidateStopId, dataset, nowMs);
        if (directOptions.length > 0) {
          console.log(`[evaluateTtcCommute] Found ${directOptions.length} direct options: ${fromCandidateStopId} -> ${toCandidateStopId}`);
        }
        return directOptions;
      })
    )
  );
  
  if (options.length === 0) {
    console.warn(`[evaluateTtcCommute] No direct options found for trip: ${fromStopId} -> ${toStopId}`);
  }
  const transferOptions = dedupeTransferCommuteOptions(
    fromCandidateStopIds.flatMap((fromCandidateStopId) =>
      toCandidateStopIds.flatMap((toCandidateStopId) => {
        if (fromCandidateStopId === toCandidateStopId) {
          return [];
        }

        const transfers = buildTransferOptions(snapshots, fromCandidateStopId, toCandidateStopId, dataset, nowMs);
        if (transfers.length > 0) {
          console.log(`[evaluateTtcCommute] Found ${transfers.length} transfer options: ${fromCandidateStopId} -> ${toCandidateStopId}`);
        }
        return transfers;
      })
    )
  );
  
  if (transferOptions.length === 0) {
    console.warn(`[evaluateTtcCommute] No transfer options found for trip: ${fromStopId} -> ${toStopId}`);
  }

  const primaryOption = options[0] ?? null;
  const backupOption =
    options.find(
      (option) =>
        primaryOption !== null &&
        option.tripId !== primaryOption.tripId &&
        (option.routeId !== primaryOption.routeId || option.departureTime !== primaryOption.departureTime)
    ) ??
    options[1] ??
    null;
  const bestTransferOption = transferOptions[0] ?? null;
  const backupTransferOption =
    transferOptions.find(
      (option) =>
        bestTransferOption !== null &&
        (option.firstLeg.tripId !== bestTransferOption.firstLeg.tripId ||
          option.secondLeg.tripId !== bestTransferOption.secondLeg.tripId ||
          option.transferStop.stopId !== bestTransferOption.transferStop.stopId)
    ) ??
    transferOptions[1] ??
    null;
  const recommendation = buildCommuteRecommendation(
    primaryOption,
    backupOption,
    bestTransferOption,
    backupTransferOption
  );
  const confidence = primaryOption
    ? buildDirectCommuteConfidence(primaryOption, backupOption, options.length, bestTransferOption)
    : buildTransferCommuteConfidence(bestTransferOption, backupTransferOption, transferOptions.length);

  return {
    generatedAt: formatIsoFromUnixSeconds(feed.header?.timestamp) ?? new Date().toISOString(),
    originStop: toPublicStop(fromStop),
    destinationStop: toPublicStop(toStop),
    recommendation,
    confidence,
    primaryOption,
    backupOption,
    totalOptions: options.length,
    options,
    bestTransferOption,
    backupTransferOption,
    totalTransferOptions: transferOptions.length,
    transferOptions
  };
}
