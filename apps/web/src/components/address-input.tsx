import { useRef, useState } from "react";
import type { PhotonFeature } from "../lib/api";

function formatPrimary(place: PhotonFeature): string {
  const parts: string[] = [];
  if (place.housenumber) parts.push(place.housenumber);
  if (place.street) parts.push(place.street);
  return parts.join(" ") || place.name;
}

function formatSecondary(place: PhotonFeature): string {
  return [place.city, place.state].filter(Boolean).join(", ");
}

function placeIcon(type: string): string {
  const map: Record<string, string> = {
    house: "bi-house",
    street: "bi-signpost",
    city: "bi-building",
    district: "bi-map",
    station: "bi-train-front",
    amenity: "bi-shop"
  };
  return map[type] ?? "bi-geo-alt";
}

type AddressInputProps = {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  selectedPlace: PhotonFeature | null;
  suggestions: PhotonFeature[];
  isLoading: boolean;
  onChange: (value: string) => void;
  onSelect: (place: PhotonFeature) => void;
  onClear: () => void;
  nearbyStopHint?: string | null;
};

export function AddressInput({
  id,
  label,
  placeholder,
  value,
  selectedPlace,
  suggestions,
  isLoading,
  onChange,
  onSelect,
  onClear,
  nearbyStopHint
}: AddressInputProps) {
  const [focused, setFocused] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searching = value.trim().length >= 2;
  const showDropdown = focused && searching && !selectedPlace;

  function handleBlur(e: React.FocusEvent) {
    if (wrapperRef.current?.contains(e.relatedTarget as Node)) return;
    setFocused(false);
  }

  return (
    <div ref={wrapperRef} className="signalto-search-field" onBlur={handleBlur}>
      <label htmlFor={id} className="signalto-list-label mb-2 d-block">
        {label}
      </label>

      <div className="signalto-search-input-wrap">
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && suggestions.length > 0 && !selectedPlace) {
              e.preventDefault();
              onSelect(suggestions[0]);
              setFocused(false);
            }
          }}
          placeholder={placeholder}
          className="form-control signalto-input"
          autoComplete="off"
        />

        {selectedPlace && !focused && (
          <div className="d-flex align-items-center justify-content-between gap-2 mt-2 px-1">
            <div style={{ minWidth: 0 }}>
              <div className="small fw-semibold text-truncate" style={{ color: "var(--signalto-ink)" }}>
                <i className="bi bi-check-circle-fill text-success me-1" aria-hidden="true" />
                {formatPrimary(selectedPlace)}
              </div>
              {nearbyStopHint && (
                <div className="small signalto-subtle mt-1" style={{ paddingLeft: "1.2rem" }}>
                  <i className="bi bi-signpost me-1" aria-hidden="true" style={{ color: "#0f5b52" }} />
                  Nearest TTC: {nearbyStopHint}
                </div>
              )}
            </div>
            <button
              type="button"
              className="btn btn-link p-0 text-decoration-none flex-shrink-0 small"
              onClick={onClear}
            >
              Clear
            </button>
          </div>
        )}

        {showDropdown && (
          <div className="signalto-dropdown">
            {isLoading ? (
              <div className="signalto-dropdown-hint">
                <i className="bi bi-arrow-repeat me-2" aria-hidden="true" />
                Searching addresses…
              </div>
            ) : suggestions.length ? (
              suggestions.map((place, i) => (
                <button
                  key={i}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onSelect(place);
                    setFocused(false);
                  }}
                  className="signalto-stop-button"
                >
                  <div className="d-flex align-items-start gap-2">
                    <i
                      className={`bi ${placeIcon(place.type)} mt-1`}
                      style={{ color: "#0f5b52", flexShrink: 0, fontSize: "0.9rem" }}
                      aria-hidden="true"
                    />
                    <div style={{ minWidth: 0 }}>
                      <div className="fw-semibold" style={{ fontSize: "0.87rem" }}>
                        {formatPrimary(place)}
                      </div>
                      <div className="small signalto-stop-meta mt-1">{formatSecondary(place)}</div>
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="signalto-dropdown-hint">No results — try a different address</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
