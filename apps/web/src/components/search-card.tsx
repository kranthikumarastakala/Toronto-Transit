import type { TtcStop } from "../lib/api";

interface SearchCardProps {
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
}

export function SearchCard({
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
  onClear
}: SearchCardProps) {
  const searching = value.trim().length >= 2;

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-xs font-mono uppercase tracking-widest text-ink/50">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-3 bg-white border border-ink/10 rounded-2xl text-ink placeholder-ink/40 focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition-all"
      />

      {selectedStop && (
        <div className="flex items-center justify-between px-3 py-2 bg-teal/5 rounded-xl">
          <div className="text-sm text-ink">
            <div className="font-semibold">{selectedStop.stopName}</div>
            {selectedStop.stopCode && <div className="text-xs text-ink/60">Stop {selectedStop.stopCode}</div>}
          </div>
          <button
            onClick={onClear}
            type="button"
            className="text-ink/40 hover:text-ink/70 transition-colors"
          >
            <i className="bi bi-x-lg" />
          </button>
        </div>
      )}

      {searching && (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {isLoading && (
            <div className="text-center py-4 text-ink/50 text-sm">
              <i className="bi bi-search mr-2" />
              Searching stops...
            </div>
          )}

          {isError && (
            <div className="text-center py-4 text-coral text-sm">
              <i className="bi bi-exclamation-circle mr-2" />
              Search error
            </div>
          )}

          {results.length > 0 && !isLoading && (
            results.map((stop) => (
              <button
                key={stop.stopId}
                onClick={() => onChooseStop(stop)}
                className="w-full text-left px-3 py-3 bg-white border border-ink/5 rounded-xl hover:bg-mist hover:border-teal/20 transition-all animate-in"
              >
                <div className="font-semibold text-sm text-ink">{stop.stopName}</div>
                <div className="text-xs text-ink/60 mt-1">
                  {stop.stopCode ? `Stop ${stop.stopCode}` : stop.stopId}
                </div>
              </button>
            ))
          )}

          {!isLoading && results.length === 0 && (
            <div className="text-center py-4 text-ink/50 text-sm">
              <i className="bi bi-inbox mr-2" />
              No stops found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
