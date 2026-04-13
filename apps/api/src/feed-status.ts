import { transitSources } from "./transit-sources";

export type FeedStatus = {
  id: string;
  label: string;
  provider: string;
  status: "ok" | "error" | "needs_setup";
  checkedAt: string;
  responseMs: number | null;
  contentType: string | null;
  contentLength: number | null;
  detail: string;
};

async function inspectSource(url: string, preferHead = false) {
  const start = Date.now();
  const init = preferHead ? { method: "HEAD" as const } : undefined;

  let response = await fetch(url, init);

  if (!response.ok && preferHead) {
    response = await fetch(url);
  }

  const responseMs = Date.now() - start;
  const contentLengthHeader = response.headers.get("content-length");

  return {
    ok: response.ok,
    status: response.status,
    responseMs,
    contentType: response.headers.get("content-type"),
    contentLength: contentLengthHeader ? Number(contentLengthHeader) : null
  };
}

export async function getFeedStatuses(goApiKey?: string | null): Promise<FeedStatus[]> {
  const checkedAt = new Date().toISOString();

  const results = await Promise.all(
    transitSources.map(async (source) => {
      if (source.requiresAuth && !goApiKey) {
        return {
          id: source.id,
          label: source.label,
          provider: source.provider,
          status: "needs_setup" as const,
          checkedAt,
          responseMs: null,
          contentType: null,
          contentLength: null,
          detail: "Registration or API credentials are required before this source can be queried."
        };
      }

      try {
        const inspection = await inspectSource(source.url, source.category === "static_gtfs");

        return {
          id: source.id,
          label: source.label,
          provider: source.provider,
          status: inspection.ok ? ("ok" as const) : ("error" as const),
          checkedAt,
          responseMs: inspection.responseMs,
          contentType: inspection.contentType,
          contentLength: Number.isFinite(inspection.contentLength) ? inspection.contentLength : null,
          detail: inspection.ok
            ? "Feed responded successfully."
            : `Source returned HTTP ${inspection.status}.`
        };
      } catch (error) {
        return {
          id: source.id,
          label: source.label,
          provider: source.provider,
          status: "error" as const,
          checkedAt,
          responseMs: null,
          contentType: null,
          contentLength: null,
          detail: error instanceof Error ? error.message : "Unexpected feed inspection error."
        };
      }
    })
  );

  return results;
}

