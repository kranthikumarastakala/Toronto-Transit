import type { TtcCommuteEvaluationResponse } from "../lib/api";

function formatClockTime(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-CA", {
        timeStyle: "short"
      }).format(new Date(value))
    : "—";
}

function formatDelay(delaySeconds: number | null) {
  if (delaySeconds === null) {
    return "On time";
  }

  if (delaySeconds === 0) {
    return "On time";
  }

  const minutes = Math.round(Math.abs(delaySeconds) / 60);
  return `${delaySeconds > 0 ? "+" : "-"}${minutes}m`;
}

interface RecommendationCardProps {
  data: TtcCommuteEvaluationResponse | null;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
}

export function RecommendationCard({
  data,
  isLoading,
  isError,
  errorMessage
}: RecommendationCardProps) {
  if (!data) {
    return null;
  }

  const primary = data.primaryOption;
  const confidence = data.confidence;

  const statusColors = {
    leave_now: "bg-gradient-to-br from-coral to-coral-soft text-white",
    leave_soon: "bg-gradient-to-br from-teal to-teal-deep text-white",
    plan_ahead: "bg-gradient-to-br from-ink to-navy text-white",
    no_direct_trip: "bg-gradient-to-br from-sand to-sand/80 text-ink"
  };

  const confidenceColors = {
    high: "text-emerald-600 bg-emerald-50",
    moderate: "text-amber-600 bg-amber-50",
    low: "text-rose-600 bg-rose-50"
  };

  return (
    <div className="space-y-4 animate-in">
      {/* Main Status Card */}
      <div className={`${statusColors[data.recommendation.status]} rounded-3xl p-6 shadow-lg`}>
        <div className="mb-3 font-mono text-xs uppercase tracking-widest opacity-75">
          {data.recommendation.status.replace(/_/g, " ")}
        </div>
        <h2 className="text-2xl font-bold mb-2">{data.recommendation.headline}</h2>
        <p className="text-sm opacity-90 mb-4">{data.recommendation.detail}</p>

        {primary && (
          <div className="bg-white/20 rounded-2xl p-4 backdrop-blur-sm">
            <div className="flex justify-between items-baseline">
              <span className="text-sm opacity-75">Next departure</span>
              <span className="text-3xl font-bold">{formatClockTime(primary.departureTime)}</span>
            </div>
            <div className="flex justify-between items-center mt-3 text-xs opacity-75">
              <span>Arrival {formatClockTime(primary.arrivalTime)}</span>
              <span>{primary.rideDurationMinutes} min ride</span>
            </div>
          </div>
        )}
      </div>

      {/* Confidence & Trip Info */}
      <div className="grid grid-cols-2 gap-3">
        <div className={`rounded-2xl p-4 ${confidenceColors[confidence.level]}`}>
          <div className="font-mono text-xs uppercase tracking-widest opacity-60 mb-2">Confidence</div>
          <div className="text-2xl font-bold">{confidence.score}</div>
          <div className="text-xs mt-1">{confidence.level}</div>
        </div>

        <div className="rounded-2xl bg-white border border-ink/10 p-4">
          <div className="font-mono text-xs uppercase tracking-widest opacity-50 mb-2">Options</div>
          <div className="text-2xl font-bold text-teal">{data.totalOptions}</div>
          <div className="text-xs text-ink/60 mt-1">
            {data.totalTransferOptions > 0 && `+${data.totalTransferOptions} transfer`}
          </div>
        </div>
      </div>

      {/* Route Details */}
      {primary && (
        <div className="space-y-2">
          <div className="px-4 py-3 bg-ink/5 rounded-2xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono text-xs uppercase opacity-60 mb-1">Route</div>
                <div className="font-semibold text-ink">{primary.routeLongName || primary.headsign || "TTC Service"}</div>
              </div>
              <div className="text-right">
                <div className="px-3 py-1 bg-teal text-white rounded-full text-xs font-semibold">
                  {primary.routeShortName || "—"}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="px-3 py-2 bg-white border border-ink/10 rounded-xl">
              <span className="opacity-50">Scheduled</span>
              <div className="font-semibold">{formatClockTime(primary.scheduledDepartureTime)}</div>
            </div>
            <div className="px-3 py-2 bg-white border border-ink/10 rounded-xl">
              <span className="opacity-50">Status</span>
              <div className="font-semibold text-teal">{formatDelay(primary.originDelaySeconds)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Key Reasons */}
      {confidence.reasons.length > 0 && (
        <div className="space-y-2">
          <div className="font-mono text-xs uppercase tracking-widest opacity-50">Why this recommendation</div>
          <ul className="space-y-1 text-sm text-ink/70">
            {confidence.reasons.map((reason, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-teal flex-shrink-0">•</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
