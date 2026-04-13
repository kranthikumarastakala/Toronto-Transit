import { transitSources } from "./transit-sources";

export const ttcCompleteGtfsSource = transitSources.find((source) => source.id === "ttc-complete-gtfs")!;
