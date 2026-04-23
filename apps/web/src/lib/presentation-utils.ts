export function recommendationPresentation(status: "leave_now" | "leave_soon" | "plan_ahead" | "no_direct_trip") {
  const presentations: Record<"leave_now" | "leave_soon" | "plan_ahead" | "no_direct_trip", { className: string; icon: string }> = {
    leave_now: {
      className: "signalto-recommendation-banner leave-now",
      icon: "bi bi-play-circle-fill"
    },
    leave_soon: {
      className: "signalto-recommendation-banner leave-soon",
      icon: "bi bi-hourglass-split"
    },
    plan_ahead: {
      className: "signalto-recommendation-banner plan-ahead",
      icon: "bi bi-calendar-check"
    },
    no_direct_trip: {
      className: "signalto-recommendation-banner no-direct",
      icon: "bi bi-exclamation-triangle"
    }
  };

  return presentations[status] ?? presentations.no_direct_trip;
}

export function confidencePresentation(level: "high" | "moderate" | "low") {
  const presentations: Record<"high" | "moderate" | "low", { className: string; icon: string }> = {
    high: {
      className: "signalto-pill text-bg-success",
      icon: "bi bi-check-circle-fill"
    },
    moderate: {
      className: "signalto-pill text-bg-warning",
      icon: "bi bi-info-circle-fill"
    },
    low: {
      className: "signalto-pill text-bg-danger",
      icon: "bi bi-exclamation-circle-fill"
    }
  };

  return presentations[level] ?? presentations.moderate;
}
