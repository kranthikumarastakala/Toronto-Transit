export function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatDistance(distanceMeters: number) {
  if (distanceMeters < 1_000) {
    return `${distanceMeters} m`;
  }

  return `${(distanceMeters / 1_000).toFixed(1)} km`;
}

export function formatWheelchair(value: "yes" | "no" | "unknown") {
  switch (value) {
    case "yes":
      return "Wheelchair accessible";
    case "no":
      return "Accessibility unknown or limited";
    default:
      return "Accessibility not specified";
  }
}

export function formatDelay(delaySeconds: number | null) {
  if (delaySeconds === null) {
    return "Realtime only";
  }

  if (delaySeconds === 0) {
    return "On time";
  }

  const minutes = Math.round(Math.abs(delaySeconds) / 60);
  return `${minutes} min ${delaySeconds > 0 ? "late" : "early"}`;
}

export function titleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}
