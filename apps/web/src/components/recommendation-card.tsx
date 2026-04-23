import { TtcCommuteEvaluationResponse } from "../lib/api";
import { formatTimestamp, formatDelay, titleCase } from "../lib/format-utils";

type RecommendationCardProps = {
  data: TtcCommuteEvaluationResponse | null;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string;
};

export function RecommendationCard({ data, isLoading, isError, errorMessage }: RecommendationCardProps) {
  if (!data) {
    return (
      <div className="signalto-note p-4 signalto-subtle">
        Search a trip to see recommendations.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="signalto-note p-4 signalto-subtle">
        Finding your best option...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="alert alert-danger rounded-4 border-0 mb-0">
        {errorMessage}
      </div>
    );
  }

  // Determine recommendation status styling
  const statusClasses: Record<string, string> = {
    leave_now: "signalto-recommendation-banner leave-now",
    leave_soon: "signalto-recommendation-banner leave-soon",
    plan_ahead: "signalto-recommendation-banner plan-ahead",
    no_direct_trip: "signalto-recommendation-banner no-direct"
  };

  const statusIcons: Record<string, string> = {
    leave_now: "bi bi-lightning-charge-fill",
    leave_soon: "bi bi-alarm-fill",
    plan_ahead: "bi bi-calendar2-check-fill",
    no_direct_trip: "bi bi-signpost-split-fill"
  };

  const status = data.recommendation.status;
  const bannerClass = statusClasses[status] || statusClasses.no_direct_trip;
  const icon = statusIcons[status] || statusIcons.no_direct_trip;

  return (
    <div className={`${bannerClass} p-4 p-lg-4 mb-4`}>
      <div className="d-flex flex-column flex-lg-row align-items-lg-start justify-content-between gap-3">
        <div>
          <div className="signalto-kicker text-white-50">Search result</div>
          <h3 className="h2 fw-bold mt-2 mb-2">{data.recommendation.headline}</h3>
          <p className="mb-2 text-white-50">{data.recommendation.detail}</p>
          {data.recommendation.backupDetail ? (
            <p className="mb-0 text-white-50">{data.recommendation.backupDetail}</p>
          ) : null}
        </div>
        <div className="display-6 flex-shrink-0">
          <i className={icon} aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
