// =============================================================
// StorageSummaryCard.jsx — v2.1 — 12-09-2026
// New in v2.1: compact card for the top row (alongside the country
// cards) showing just the database total and % of the free-tier
// ceiling used. Click opens the full StorageOverview panel (per-
// country sizes + "Delete old data") in a modal — see
// StorageDetailsModal.jsx. Replaces the old full-width Storage
// usage panel that sat below the cards.
// =============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { withTimeout } from '../lib/summaryRefresh';
import StorageDetailsModal from './StorageDetailsModal';

const FREE_TIER_BYTES = 500 * 1024 * 1024; // Supabase free plan ceiling

function fmtSize(bytes) {
  if (bytes === null || bytes === undefined) return '—';
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '0 MB';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  const mb = n / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

export default function StorageSummaryCard({ refreshToken, onChanged }) {
  const [dbBytes, setDbBytes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const unmountedRef = useRef(false);

  useEffect(
    () => () => {
      unmountedRef.current = true;
    },
    []
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: res, error: err } = await withTimeout(
        supabase.rpc('get_storage_overview'),
        20000,
        'Loading storage usage'
      );
      if (err) throw new Error(err.message);
      if (!unmountedRef.current) setDbBytes(Number(res?.db_bytes || 0));
    } catch (e) {
      if (!unmountedRef.current) setError(e.message || 'Could not load storage usage.');
    } finally {
      if (!unmountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshToken]);

  const usedPct = dbBytes === null ? null : Math.min(100, (dbBytes / FREE_TIER_BYTES) * 100);

  return (
    <>
      <button
        type="button"
        className="country-card storage-summary-card"
        onClick={() => setShowDetails(true)}
        title="View storage details"
      >
        <div className="country-card-name">Storage usage (admin only)</div>
        {loading && dbBytes === null ? (
          <div className="country-card-empty">Loading…</div>
        ) : error ? (
          <div className="country-card-empty">Couldn't load</div>
        ) : (
          <>
            <div className="country-card-stat">
              <span className="value">{usedPct.toFixed(1)}%</span>
              <span className="label">of {fmtSize(FREE_TIER_BYTES)}</span>
            </div>
            <div className="bar-track">
              <div
                className={`bar-fill${usedPct > 80 ? ' is-warning' : ''}`}
                style={{ width: `${usedPct}%` }}
              />
            </div>
            <div className="country-card-updated">{fmtSize(dbBytes)} used</div>
          </>
        )}
        <div className="storage-summary-cta">View details &amp; cleanup &rsaquo;</div>
      </button>

      {showDetails && (
        <StorageDetailsModal
          refreshToken={refreshToken}
          onClose={() => setShowDetails(false)}
          onChanged={() => {
            onChanged?.();
            load();
          }}
        />
      )}
    </>
  );
}
