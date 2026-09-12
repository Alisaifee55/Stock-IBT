import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { SearchIcon } from './icons';

const MAX_RESULTS = 10;
const DEBOUNCE_MS = 200;
export const MODEL_SEARCH_INPUT_ID = 'model-number-search-input';

export default function ModelSearchLive({ onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [highlighted, setHighlighted] = useState(0);
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('stock_summary')
        .select('model_no, category')
        .ilike('model_no', `%${query.trim()}%`)
        .limit(500); // then dedupe client-side; a model can appear once per shop
      const seen = new Map();
      for (const r of data || []) {
        if (!seen.has(r.model_no)) seen.set(r.model_no, r.category);
      }
      setResults(Array.from(seen.entries()).slice(0, MAX_RESULTS));
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
      commitSelection(pick?.[0]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

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
          {results.map(([modelNo, category], i) => (
            <div
              key={modelNo}
              className={`model-search-result${i === highlighted ? ' highlighted' : ''}`}
              onMouseDown={() => commitSelection(modelNo)}
              onMouseEnter={() => setHighlighted(i)}
            >
              <span className="model-search-result-model">{modelNo}</span>
              {category && <span className="model-search-result-category">{category}</span>}
            </div>
          ))}
        </div>
      )}
      {open && query.trim() && results.length === 0 && (
        <div className="model-search-results">
          <div className="model-search-empty">No matching model numbers</div>
        </div>
      )}
    </div>
  );
}
