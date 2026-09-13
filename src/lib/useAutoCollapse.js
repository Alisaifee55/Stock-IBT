// =============================================================
// useAutoCollapse.js — v2.3 — 12-09-2026
// New in v2.3: shared by the 3 country cards and the Storage summary
// card. A card starts expanded, auto-collapses to a compact one-line
// form 5 seconds later, and expands again — restarting the 5s timer —
// whenever the person clicks it while collapsed.
// =============================================================

import { useEffect, useRef, useState } from 'react';

const AUTO_COLLAPSE_MS = 5000;

export function useAutoCollapse(deps = []) {
  const [expanded, setExpanded] = useState(true);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!expanded) return undefined;
    timerRef.current = setTimeout(() => setExpanded(false), AUTO_COLLAPSE_MS);
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  // Restart the 5s window whenever the card's own data changes (a
  // fresh upload, a refreshed total) — that's new information worth
  // showing again, not just a re-render of the same numbers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setExpanded(true), deps);

  const expand = () => setExpanded(true);

  return { expanded, expand };
}
