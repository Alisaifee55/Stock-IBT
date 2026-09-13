// =============================================================
// StorageSummaryCard.jsx — v2.3 — 12-09-2026
// Changes from v2.1: auto-collapses to a one-line summary 5s after
// being shown, and expands again on click — see useAutoCollapse.js.
// Once expanded, clicking the card still opens the full StorageOverview
// panel (per-country sizes + "Delete old data") in a modal, same as
// before — see StorageDetailsModal.jsx.
// =============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { withTimeout } from '../lib/summaryRefresh';
import { useAutoCollapse } from '../lib/useAutoCollapse';
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
  const { expanded, expand } = useAutoCollapse([dbBytes]);

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

  if (!expanded) {
    return (
      <button type="button" className="country-card is-collapsed" onClick={expand} title="Expand storage usage">
        <span className="country-card-collapsed-name">Storage</span>
        <span className="country-card-collapsed-stat">
          {usedPct === null ? '—' : `${usedPct.toFixed(1)}% used`}
        </span>
      </button>
    );
  }

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
