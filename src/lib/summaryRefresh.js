// =============================================================
// summaryRefresh.js — v2.0 — 12-09-2026
// Client for the async stock_summary refresh (migration 18/18a).
//
// The old path called rpc('refresh_stock_summary') synchronously and
// always failed at scale: SET LOCAL statement_timeout cannot re-arm the
// timer for an already-running statement, so the real ceiling was the
// authenticated role's 8s — against a refresh measured at 8.24s.
//
// v2.0 also routes the "delete old data" cleanup through the same
// queue: cascade-deleting ~300k rows takes far longer than 8s, so the
// old direct RPC call could never succeed either.
//
// Now: request_summary_refresh() enqueues and returns instantly, a
// pg_cron worker (every 15s, running as postgres with no timeout) does
// the work, and we poll the job row. Worst case wait is the cron gap
// plus the refresh itself, roughly 10-30s.
// =============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';

const POLL_MS = 2000; // job row poll interval
const CALL_TIMEOUT_MS = 20000; // per-network-call guard
const MAX_WAIT_MS = 5 * 60 * 1000; // give up waiting after 5 minutes
export const SLOW_AFTER_MS = 2500; // switch to "still working" copy

/** Wraps any thenable in a hard timeout so no call can hang forever. */
export function withTimeout(thenable, ms = CALL_TIMEOUT_MS, label = 'Request') {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s. Check your connection and try again.`)),
      ms
    );
  });
  return Promise.race([Promise.resolve(thenable), guard]).finally(() => clearTimeout(timer));
}

/** DD-MM-YYYY HH:MM in the viewer's local time, no GMT string. */
export function formatStamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Most recent successful refresh — drives the header "last updated" pill. */
export async function fetchLastRefresh() {
  const { data, error } = await withTimeout(
    supabase
      .from('summary_refresh_jobs')
      .select('finished_at, duration_ms')
      .eq('status', 'done')
      .order('finished_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    CALL_TIMEOUT_MS,
    'Loading report status'
  );
  if (error) throw new Error(error.message);
  return data || null;
}

/**
 * Enqueues a refresh and waits for the worker to finish it.
 * onElapsed(ms) fires about once a second for loader copy.
 * isCancelled() lets a caller abandon the wait (e.g. unmount).
 * Resolves { durationMs, finishedAt }; throws with a user-facing message.
 */
async function enqueueAndWait({ rpcName, rpcArgs, label, onElapsed, isCancelled }) {
  const startedAt = Date.now();

  const { data: jobId, error: rpcErr } = await withTimeout(
    supabase.rpc(rpcName, rpcArgs),
    CALL_TIMEOUT_MS,
    `Requesting ${label}`
  );
  if (rpcErr) throw new Error(rpcErr.message);
  if (!jobId) throw new Error(`The server did not return a job id for the ${label}.`);

  for (;;) {
    if (isCancelled?.()) return { cancelled: true };

    const waited = Date.now() - startedAt;
    onElapsed?.(waited);

    if (waited > MAX_WAIT_MS) {
      throw new Error(
        `The ${label} is taking longer than 5 minutes. It may still finish in the background — reload the page in a few minutes to check.`
      );
    }

    await new Promise((r) => setTimeout(r, POLL_MS));
    if (isCancelled?.()) return { cancelled: true };

    const { data: job, error } = await withTimeout(
      supabase
        .from('summary_refresh_jobs')
        .select('status, duration_ms, error_message, finished_at')
        .eq('id', jobId)
        .maybeSingle(),
      CALL_TIMEOUT_MS,
      'Checking refresh status'
    );

    // A single failed poll shouldn't abort a refresh that's running fine.
    if (error) continue;
    if (!job) continue;

    if (job.status === 'done') {
      onElapsed?.(Date.now() - startedAt);
      return { durationMs: job.duration_ms, finishedAt: job.finished_at };
    }
    if (job.status === 'error') {
      throw new Error(job.error_message || `The ${label} failed on the server.`);
    }
    // 'pending' (waiting for the 15s cron tick) or 'running' — keep waiting.
  }
}

/**
 * Queues a stock_summary refresh and waits for the worker to finish it.
 * onElapsed(ms) fires about once a second for loader copy.
 * isCancelled() lets a caller abandon the wait (e.g. unmount).
 * Resolves { durationMs, finishedAt }; throws with a user-facing message.
 */
export function runRefreshAndWait({ onElapsed, isCancelled } = {}) {
  return enqueueAndWait({
    rpcName: 'request_summary_refresh',
    label: 'report refresh',
    onElapsed,
    isCancelled,
  });
}

/**
 * Queues deletion of every older snapshot for one country, keeping the
 * upload just completed, and waits for it. The superseded rows aren't on
 * the report anyway, so no follow-up refresh is needed.
 */
export function runCleanupAndWait({ country, keepUploadId, onElapsed, isCancelled } = {}) {
  return enqueueAndWait({
    rpcName: 'request_old_data_cleanup',
    rpcArgs: { p_country: country, p_keep_upload_id: keepUploadId },
    label: `old ${country} data cleanup`,
    onElapsed,
    isCancelled,
  });
}

/**
 * Header pill state. state: idle | working | error
 * Only admins can actually trigger a refresh; everyone sees the timestamp.
 */
export function useSummaryRefresh({ onComplete } = {}) {
  const [lastRefreshAt, setLastRefreshAt] = useState(null);
  const [state, setState] = useState('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const cancelledRef = useRef(false);
  const runningRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    fetchLastRefresh()
      .then((row) => {
        if (!cancelledRef.current && row?.finished_at) setLastRefreshAt(row.finished_at);
      })
      .catch(() => {
        /* pill just stays blank — never block the app on this */
      });
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  // Lets the app refresh the pill's timestamp after an upload did the
  // refresh itself — otherwise the header stayed stale until reload.
  const reload = useCallback(() => {
    fetchLastRefresh()
      .then((row) => {
        if (row?.finished_at) setLastRefreshAt(row.finished_at);
      })
      .catch(() => {});
  }, []);

  const start = useCallback(async () => {
    if (runningRef.current) return; // guard double-clicks
    runningRef.current = true;
    setState('working');
    setElapsed(0);
    setError('');
    try {
      const res = await runRefreshAndWait({
        onElapsed: setElapsed,
        isCancelled: () => cancelledRef.current,
      });
      if (res?.cancelled) return;
      setLastRefreshAt(res.finishedAt || new Date().toISOString());
      setState('idle');
      onComplete?.();
    } catch (err) {
      setError(err.message || 'Refresh failed.');
      setState('error');
    } finally {
      runningRef.current = false;
    }
  }, [onComplete]);

  const dismissError = useCallback(() => {
    setError('');
    setState('idle');
  }, []);

  return { lastRefreshAt, state, elapsed, error, start, reload, dismissError };
}
