// =============================================================
// presence.js — v1.0 — 14-09-2026
// New in v2.6. "Which shop is online, and if not, when were they
// last seen."
//
// Online is never stored as a flag — it is derived from a heartbeat
// timestamp (last_seen_at inside 90s, decided in SQL by
// get_shop_presence). A laptop that loses power or a phone that
// force-quits can't say goodbye, so a stored boolean would leave
// that shop showing "online" forever. A decaying timestamp fixes
// itself.
//
// Heartbeat cadence is 45s against a 90s window, so one missed beat
// is survivable and a shop only ever reads as offline after two.
// The beat pauses while the tab is hidden and fires immediately on
// return, which is also what makes a backgrounded phone read as
// offline — correct, since it isn't watching.
// =============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { withTimeout } from './summaryRefresh';

const BEAT_MS = 45000;
const ROSTER_MS = 60000;

/** Postgres returns microsecond precision; older Safari builds reject
 *  6 fractional digits. Trim to milliseconds before parsing. */
export function parseTs(value) {
  if (!value) return null;
  const d = new Date(String(value).replace(/(\.\d{3})\d+/, '$1'));
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n) => String(n).padStart(2, '0');

/** Always HH:MM, never a locale string. */
export function timeHHMM(value) {
  const d = parseTs(value);
  return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '';
}

/** Always DD-MM-YYYY, never a locale string or a GMT tail. */
export function dateDDMMYYYY(value) {
  const d = parseTs(value);
  return d ? `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}` : '';
}

function isToday(d) {
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

/** "Online" / "Last seen 14:32" / "Last seen 12-09-2026 14:32". */
export function presenceLabel(entry) {
  if (!entry) return 'Never seen';
  if (entry.online) return 'Online';
  const d = parseTs(entry.last_seen_at);
  if (!d) return 'Never seen';
  return isToday(d)
    ? `Last seen ${timeHHMM(entry.last_seen_at)}`
    : `Last seen ${dateDDMMYYYY(entry.last_seen_at)} ${timeHHMM(entry.last_seen_at)}`;
}

/** Announces this shop as online for as long as the tab is visible. */
export function useHeartbeat(enabled) {
  useEffect(() => {
    if (!enabled) return undefined;
    let stopped = false;
    let timer = null;

    const beat = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      try {
        await withTimeout(supabase.rpc('touch_presence'), 15000, 'Updating your status');
      } catch {
        // A missed heartbeat is self-correcting on the next beat.
      }
    };

    const schedule = () => {
      clearInterval(timer);
      timer = setInterval(beat, BEAT_MS);
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        beat();
        schedule();
      } else {
        clearInterval(timer);
      }
    };

    beat();
    schedule();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);
}

/** Every shop plus Head Office, keyed by member_key. */
export function usePresenceRoster(enabled) {
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const { data, error: err } = await withTimeout(
        supabase.rpc('get_shop_presence'),
        20000,
        'Loading who is online'
      );
      if (!mounted.current) return;
      if (err) setError(err.message);
      else {
        setError('');
        setRoster(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      if (mounted.current) setError(e.message);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    mounted.current = true;
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, ROSTER_MS);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [load]);

  const byKey = {};
  roster.forEach((r) => {
    byKey[r.member_key] = r;
  });

  return { roster, byKey, loading, error, reload: load };
}
