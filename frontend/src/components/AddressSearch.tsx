"use client";

import { useEffect, useRef, useState } from "react";
import { geocodeAddress, type GeocodeResult } from "@/lib/api";
import { useLocale } from "@/lib/i18n/LocaleContext";

interface AddressSearchProps {
  placeholder: string;
  onSelect: (result: GeocodeResult) => void;
}

export default function AddressSearch({ placeholder, onSelect }: AddressSearchProps) {
  const { t } = useLocale();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const skipNextSearchRef = useRef(false);

  useEffect(() => {
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }

    const timer = setTimeout(async () => {
      if (query.trim().length < 2) {
        setResults([]);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const found = await geocodeAddress(query);
        setResults(found);
        setOpen(true);
      } catch {
        setError(tRef.current.addressSearch.searchFailed);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="relative">
      <div className="relative">
        <input
          className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 pl-9 text-sm text-[var(--surface-900)]
            placeholder:text-[var(--surface-400)]
            focus:border-[var(--brand-500)] focus:ring-1 focus:ring-[var(--brand-200)]
            transition-colors duration-150"
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--surface-400)]">🔍</span>
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <svg className="h-4 w-4 animate-spin text-[var(--surface-400)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}
      </div>
      {open && (error || results.length > 0) && (
        <div className="absolute z-[1000] mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-[var(--border)] bg-white shadow-[var(--shadow-lg)]">
          {error && <div className="px-4 py-3 text-sm text-red-600">{error}</div>}
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSelect(r);
                skipNextSearchRef.current = true;
                setQuery(r.display_name);
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-[var(--surface-800)] hover:bg-[var(--brand-50)] transition-colors"
              title={r.display_name}
            >
              <span className="shrink-0 text-base">📍</span>
              <span className="truncate">{r.display_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
