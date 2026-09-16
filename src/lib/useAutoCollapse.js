// =============================================================
// useAutoCollapse.js — v2.7 — 15-09-2026
// Changes from v2.3: added hold() / release().
//
// WHY — this is the Excel upload bug. The 5s auto-collapse timer kept
// running while the operating system's file dialog was open. Browsing
// for a file takes longer than 5 seconds, so the card collapsed
// BEHIND the dialog, which unmounted the <input type="file"> inside
// it. Its onChange therefore never fired: picking a file appeared to
// do nothing except collapse the card. Nothing was broken in the
// upload pipeline itself.
//
// hold() suspends the timer and forces the card open; release() lets
// it resume. It is a COUNTER, not a boolean, so two overlapping holds
// can't cancel each other out — the card stays open until the last
// one is released.
// =============================================================

import { useCallback, useEffect, useRef, useState } from 'react';

const AUTO_COLLAPSE_MS = 5000;

export function useAutoCollapse(deps = []) {
  const [expanded, setExpanded] = useState(true);
  const [holds, setHolds] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    // A held card never auto-collapses.
    if (!expanded || holds > 0) return undefined;
    timerRef.current = setTimeout(() => setExpanded(false), AUTO_COLLAPSE_MS);
    return () => clearTimeout(timerRef.current);
  }, [expanded, holds]);

  // Restart the 5s window whenever the card's own data changes (a
  // fresh upload, a refreshed total) — that's new information worth
  // showing again, not just a re-render of the same numbers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setExpanded(true), deps);

  const expand = useCallback(() => setExpanded(true), []);

  /** Keep this card open — a file dialog is open, or work is running. */
  const hold = useCallback(() => {
    setExpanded(true);
    setHolds((n) => n + 1);
  }, []);

  const release = useCallback(() => {
    setHolds((n) => (n > 0 ? n - 1 : 0));
  }, []);

  return { expanded, expand, hold, release, held: holds > 0 };
}
