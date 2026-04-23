import { useRef, useState } from "react";
import { TtcStop } from "../lib/api";
import { formatDistance, formatWheelchair } from "../lib/format-utils";

type SearchInputProps = {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  selectedStop: TtcStop | null;
  results: TtcStop[];
  isLoading: boolean;
  isError: boolean;
  onChange: (value: string) => void;
  onChooseStop: (stop: TtcStop) => void;
  onClear: () => void;
  // Suggestions shown before the user types (e.g. nearby stops)
  suggestions?: (TtcStop & { distanceMeters?: number })[];
  suggestionsLabel?: string;
  // One-tap location shortcut shown under the label
  locationShortcut?: { label: string; stop: TtcStop } | null;
};

export function SearchInput({
  id,
  label,
  placeholder,
  value,
  selectedStop,
  results,
  isLoading,
  isError,
  onChange,
  onChooseStop,
  onClear,
  suggestions = [],
  suggestionsLabel = "Nearby stops",
  locationShortcut
}: SearchInputProps) {
  const searching = value.trim().length >= 2;
  const [focused, setFocused] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Show search results when typing; show suggestions when focused but empty
  const showResults = focused && searching;
  const showSuggestions = focused && !searching && !selectedStop && suggestions.length > 0;
  const showDropdown = showResults || showSuggestions;
  // Cache outside JSX so TypeScript doesn't narrow selectedStop to null inside showSuggestions block
  const selectedStopId = selectedStop != null ? selectedStop.stopId : null;

  function handleChoose(stop: TtcStop) {
    onChooseStop(stop);
    setFocused(false);
  }

  function handleBlur(e: React.FocusEvent) {
    if (wrapperRef.current?.contains(e.relatedTarget as Node)) return;
    setFocused(false);
  }

  return (
    <div ref={wrapperRef} className="signalto-search-field" onBlur={handleBlur}>
      <div className="d-flex align-items-center justify-content-between mb-2">
        <label htmlFor={id} className="signalto-list-label">
          {label}
        </label>
        {/* One-tap location shortcut */}
        {locationShortcut && !selectedStop && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleChoose(locationShortcut.stop)}
            style={{
              all: "unset",
              fontSize: "0.7rem",
              fontWeight: 600,
              color: "#0f5b52",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              background: "rgba(15,91,82,0.08)",
              borderRadius: "99px",
              padding: "2px 9px",
              whiteSpace: "nowrap"
            }}
          >
            <i className="bi bi-crosshair" aria-hidden="true" />
            {locationShortcut.label}
          </button>
        )}
      </div>

      <div className="signalto-search-input-wrap">
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setFocused(true)}
          placeholder={placeholder}
          className="form-control signalto-input"
          autoComplete="off"
        />

        {selectedStop && !focused && (
          <div className="d-flex align-items-center justify-content-between gap-2 mt-2 px-1 small signalto-subtle">
            <span className="text-truncate">
              <i className="bi bi-check-circle-fill text-success me-1" aria-hidden="true" />
              {selectedStop.stopName}
              {selectedStop.stopCode ? ` — Stop ${selectedStop.stopCode}` : ""}
            </span>
            <button
              type="button"
              className="btn btn-link p-0 text-decoration-none flex-shrink-0"
              onClick={onClear}
              tabIndex={0}
            >
              Clear
            </button>
          </div>
        )}

        {showDropdown && (
          <div className="signalto-dropdown">
            {showSuggestions ? (
              /* ── Empty-state: nearby / suggested stops ── */
              <>
                <div style={{
                  fontSize: "0.67rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#aaa",
                  padding: "8px 14px 4px"
                }}>
                  <i className="bi bi-geo-alt-fill me-1" aria-hidden="true" style={{ color: "#0f5b52" }} />
                  {suggestionsLabel}
                </div>
                {suggestions.map((stop) => (
                  <button
                    key={stop.stopId}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleChoose(stop)}
                    className={`signalto-stop-button ${selectedStopId === stop.stopId ? "is-selected" : ""}`}
                  >
                    <div className="d-flex align-items-center justify-content-between gap-3">
                      <div style={{ minWidth: 0 }}>
                        <div className="fw-semibold" style={{ fontSize: "0.87rem" }}>{stop.stopName}</div>
                        <div className="small signalto-stop-meta mt-1">
                          {stop.stopCode ? `Stop ${stop.stopCode}` : stop.stopId}
                          {stop.distanceMeters != null ? ` · ${formatDistance(stop.distanceMeters)}` : ""}
                        </div>
                      </div>
                      <span className="signalto-stop-distance flex-shrink-0">
                        {stop.locationType === 1 ? "Station" : "Stop"}
                      </span>
                    </div>
                  </button>
                ))}
                <div style={{
                  fontSize: "0.73rem",
                  color: "#bbb",
                  padding: "6px 14px 10px",
                  borderTop: "1px solid rgba(0,0,0,0.05)",
                  marginTop: "4px"
                }}>
                  Or start typing any stop name, street, or route number
                </div>
              </>
            ) : isLoading ? (
              <div className="signalto-dropdown-hint">Searching TTC stops…</div>
            ) : isError ? (
              <div className="signalto-dropdown-hint text-danger">Unable to search TTC stops right now.</div>
            ) : results.length ? (
              results.map((stop) => (
                <button
                  key={stop.stopId}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleChoose(stop)}
                  className={`signalto-stop-button ${selectedStop?.stopId === stop.stopId ? "is-selected" : ""}`}
                >
                  <div className="d-flex align-items-start justify-content-between gap-3">
                    <div>
                      <div className="fw-semibold fs-6">{stop.stopName}</div>
                      <div className="small signalto-stop-meta mt-1">
                        {stop.stopCode ? `Stop ${stop.stopCode}` : stop.stopId}
                      </div>
                    </div>
                    <span className="signalto-stop-distance">{stop.locationType === 1 ? "Station" : "Stop"}</span>
                  </div>
                  <div className="small signalto-stop-meta mt-2">
                    <i className="bi bi-universal-access me-2" aria-hidden="true" />
                    {formatWheelchair(stop.wheelchairBoarding)}
                  </div>
                </button>
              ))
            ) : (
              <div className="signalto-dropdown-hint">No TTC stops matched that search.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
