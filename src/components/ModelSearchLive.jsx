// =============================================================
// ModelSearchLive.jsx — v2.0 — 12-09-2026
// Changes from v1.0:
//  - Searches via the search_models() RPC, which does DISTINCT + ORDER
//    in Postgres against the trigram index. v1.0 pulled an unordered
//    .limit(500) and deduped client-side, so a common substring
//    returned an arbitrary slice of matches.
//  - Prefix matches now rank first.
//  - A request-id guard stops a slow earlier response overwriting a
//    newer one.
//  - Search text is sanitised before it reaches the query.
// =============================================================

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { sanitizeSearch } from '../lib/stockQueries';
import { SearchIcon } from './icons';

const MAX_RESULTS = 10;
const DEBOUNCE_MS = 200;
export const MODEL_SEARCH_INPUT_ID = 'model-number-search-input';

export default function ModelSearchLive({ onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [highlighted, setHighlighted] = useState(0);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const term = sanitizeSearch(query);
    if (!term) {
      setResults([]);
      setSearching(false);
      return;
    }
    clearTimeout(debounceRef.current);
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const reqId = ++requestIdRef.current;
      const { data, error } = await supabase.rpc('search_models', {
        p_query: term,
        p_limit: MAX_RESULTS,
      });
      // Ignore anything but the newest request.
      if (reqId !== requestIdRef.current) return;
      setSearching(false);
      setResults(error ? [] : data || []);
      setHighlighted(0);
    }, DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const commitSelection = (modelNo) => {
    if (!modelNo) return;
    onSelect(modelNo);
    setQuery('');
    setResults([]);
    setOpen(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = results[highlighted] ?? results[0];
      commitSelection(pick?.model_no);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const term = sanitizeSearch(query);

  return (
    <div className="model-search">
      <div className="model-search-box">
        <SearchIcon />
        <input
          ref={inputRef}
          id={MODEL_SEARCH_INPUT_ID}
          type="text"
          placeholder="Search Model Number across all data... (F2)"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => query && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
        />
      </div>
      {open && results.length > 0 && (
        <div className="model-search-results">
          {results.map((r, i) => (
            <div
              key={r.model_no}
              className={`model-search-result${i === highlighted ? ' highlighted' : ''}`}
              onMouseDown={() => commitSelection(r.model_no)}
              onMouseEnter={() => setHighlighted(i)}
            >
              <span className="model-search-result-model">{r.model_no}</span>
              {r.category && <span className="model-search-result-category">{r.category}</span>}
            </div>
          ))}
        </div>
      )}
      {open && term && results.length === 0 && (
        <div className="model-search-results">
          <div className="model-search-empty">{searching ? 'Searching…' : 'No matching model numbers'}</div>
        </div>
      )}
    </div>
  );
}
