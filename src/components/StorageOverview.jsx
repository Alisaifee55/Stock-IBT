// =============================================================
// StorageOverview.jsx — v2.0 — 12-09-2026
// Admin-only panel: how much storage each country uses, and an
// on-demand "Delete old data" button per country (replaces the
// upload checkbox). Deletion runs through the async job queue, so
// a ~300k cascade isn't bound by the API's 8s statement timeout.
//
// Sizes are estimates: total stock_items bytes apportioned by each
// country's row share. Exact per-country bytes aren't obtainable
// without scanning every row, which isn't worth the cost here.
// =============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { COUNTRIES } from '../lib/stockQueries';
import { runCleanupAndWait, withTimeout, formatStamp, SLOW_AFTER_MS } from '../lib/summaryRefresh';
import { ResetIcon } from './icons';

const FREE_TIER_BYTES = 500 * 1024 * 1024; // Supabase free plan ceiling

function fmtSize(bytes) {
  if (bytes === null || bytes === undefined) return '—';
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '0 MB';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  const mb = n / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

export default function StorageOverview({ refreshToken, onChanged, embedded }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmFor, setConfirmFor] = useState(null); // country row awaiting confirmation
  const [busyCountry, setBusyCountry] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [notice, setNotice] = useState('');
  const unmountedRef = useRef(false);
  const closeBtnRef = useRef(null);

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
      if (!unmountedRef.current) setData(res);
    } catch (e) {
      if (!unmountedRef.current) setError(e.message || 'Could not load storage usage.');
    } finally {
      if (!unmountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshToken]);

  // Modal: Escape closes, focus lands on the close button, body scroll locks.
  useEffect(() => {
    if (!confirmFor) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setConfirmFor(null);
      }
    };
    document.addEventListener('keydown', onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeBtnRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
    };
  }, [confirmFor]);

  const handleDelete = async (row) => {
    setConfirmFor(null);
    setBusyCountry(row.country);
    setElapsed(0);
    setError('');
    setNotice('');
    try {
      const res = await runCleanupAndWait({
        country: row.country,
        keepUploadId: row.current_upload_id,
        onElapsed: setElapsed,
        isCancelled: () => unmountedRef.current,
      });
      if (res?.cancelled) return;
      setNotice(`Old ${row.country} data deleted — about ${fmtSize(row.old_bytes)} freed.`);
      await load();
      onChanged?.();
    } catch (e) {
      setError(e.message || 'Delete failed.');
    } finally {
      if (!unmountedRef.current) setBusyCountry('');
    }
  };

  const rows = (data?.countries || []).reduce((acc, c) => {
    acc[c.country] = c;
    return acc;
  }, {});
  const dbBytes = Number(data?.db_bytes || 0);
  const usedPct = Math.min(100, (dbBytes / FREE_TIER_BYTES) * 100);

  return (
    <div className={embedded ? 'storage-panel-embedded' : 'panel storage-panel'}>
      {!embedded && (
      <h3>
        Storage usage (admin only)
        <button
          type="button"
          className="refresh-pill-btn storage-reload"
          onClick={load}
          disabled={loading || !!busyCountry}
          title="Reload storage figures"
          aria-label="Reload storage figures"
        >
          <ResetIcon />
        </button>
      </h3>
      )}

      <div className="storage-total">
        <div className="storage-total-head">
          <span>
            Database total: <strong>{fmtSize(dbBytes)}</strong> of {fmtSize(FREE_TIER_BYTES)}
          </span>
          <span className="storage-total-pct">{usedPct.toFixed(1)}%</span>
        </div>
        <div className="bar-track">
          <div
            className={`bar-fill${usedPct > 80 ? ' is-warning' : ''}`}
            style={{ width: `${usedPct}%` }}
          />
        </div>
        <div className="zero-stock-hint">
          Stock rows {fmtSize(data?.items_bytes)} &middot; report summary {fmtSize(data?.summary_bytes)}
        </div>
      </div>

      {loading && !data ? (
        <div className="storage-loading">Loading storage figures…</div>
      ) : (
        <div className="table-scroll">
          <table className="storage-table">
            <thead>
              <tr>
                <th>Country</th>
                <th>Current rows</th>
                <th>Size (est.)</th>
                <th>Last upload</th>
                <th>Old snapshots</th>
                <th>Reclaimable</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {COUNTRIES.map((country) => {
                const r = rows[country];
                if (!r) {
                  return (
                    <tr key={country}>
                      <td className="storage-country">{country}</td>
                      <td colSpan={6} className="storage-empty">
                        No data uploaded yet
                      </td>
                    </tr>
                  );
                }
                const oldRows = Number(r.old_rows || 0);
                const isBusy = busyCountry === country;
                return (
                  <tr key={country}>
                    <td className="storage-country">{country}</td>
                    <td>{Number(r.current_rows || 0).toLocaleString()}</td>
                    <td>{fmtSize(r.current_bytes)}</td>
                    <td>{r.uploaded_at ? formatStamp(r.uploaded_at) : '—'}</td>
                    <td>
                      {oldRows > 0 ? (
                        <span className="pill pill-warning">
                          {Number(r.upload_count || 1) - 1} older ({oldRows.toLocaleString()} rows)
                        </span>
                      ) : (
                        <span className="pill pill-success">Clean</span>
                      )}
                    </td>
                    <td>{oldRows > 0 ? fmtSize(r.old_bytes) : '—'}</td>
                    <td className="storage-action">
                      {isBusy ? (
                        <span className="storage-working">
                          <span className="refresh-spinner" aria-hidden="true" />
                          Deleting… {Math.round(elapsed / 1000)}s
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-danger"
                          disabled={oldRows === 0 || !!busyCountry}
                          onClick={() => setConfirmFor(r)}
                          title={
                            oldRows === 0
                              ? `No old ${country} data to delete`
                              : `Permanently delete old ${country} snapshots`
                          }
                        >
                          Delete old data
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {busyCountry && elapsed > SLOW_AFTER_MS && (
        <div className="upload-refresh-note">
          Still deleting — removing a previous snapshot takes up to a minute. Safe to leave this open.
        </div>
      )}
      {notice && <div className="success-box">{notice}</div>}
      {error && <div className="error-box small">{error}</div>}

      {confirmFor && (
        <div
          className="modal-backdrop"
          onClick={() => setConfirmFor(null)}
          role="presentation"
        >
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="storage-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h4 id="storage-confirm-title">Delete old {confirmFor.country} data?</h4>
              <button
                ref={closeBtnRef}
                type="button"
                className="modal-close"
                onClick={() => setConfirmFor(null)}
                aria-label="Close without deleting"
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p>
                This permanently removes {Number(confirmFor.upload_count || 1) - 1} older{' '}
                {confirmFor.country} upload(s) — about{' '}
                <strong>{Number(confirmFor.old_rows || 0).toLocaleString()} rows</strong> and{' '}
                <strong>{fmtSize(confirmFor.old_bytes)}</strong>.
              </p>
              <p>
                The current upload stays, so the report is unaffected. This cannot be undone — the
                source Excel file is the only other copy.
              </p>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-reset" onClick={() => setConfirmFor(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={() => handleDelete(confirmFor)}>
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
