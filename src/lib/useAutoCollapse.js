// =============================================================
// useAutoCollapse.js — v2.8 — 15-09-2026
// Changes from v2.7: hold()/release() counters replaced with a single
// `lockOpen` boolean argument.
//
// WHY THE REWRITE: v2.7's counters tried to stop the card collapsing
// at the wrong moment. That was the wrong layer to fix it at — the
// real bug was that collapsing UNMOUNTED the upload, so any missed
// hold (a browser that doesn't fire 'cancel', an unexpected
// re-render, focus events arriving in a different order on Windows)
// destroyed an upload already in flight. The upload state now lives
// in the card itself and survives collapse regardless — see
// CountryStatusCards.jsx v2.8 — so this hook only has to answer one
// question: may it auto-collapse right now?
//
// lockOpen = true means the caller is busy (file dialog open, upload
// running). No timer is armed at all while it is true, and the card
// reads as expanded. When it goes false, the 5s window starts fresh.
// =============================================================

import { useCallback, useEffect, useState } from 'react';

const AUTO_COLLAPSE_MS = 5000;

export function useAutoCollapse(deps = [], lockOpen = false) {
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (lockOpen) {
      setExpanded(true);
      return undefined;
    }
    if (!expanded) return undefined;
    const t = setTimeout(() => setExpanded(false), AUTO_COLLAPSE_MS);
    return () => clearTimeout(t);
  }, [expanded, lockOpen]);

  // Restart the 5s window when the card's own data changes — new
  // information is worth showing again, unlike a plain re-render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setExpanded(true), deps);

  const expand = useCallback(() => setExpanded(true), []);
  const collapse = useCallback(() => setExpanded(false), []);

  return { expanded: expanded || lockOpen, expand, collapse };
}
