// =============================================================
// CountryUploadZone.jsx — v2.1 — 12-09-2026
// New in v2.1: replaces the old standalone "Central stock upload"
// panel (AdminUpload.jsx, now unused — delete it from the repo).
// This is the same upload pipeline, but mounted inline on each
// country's card as a compact drop-zone instead of a separate
// full-width admin section with a country <select>. Admin-only;
// the parent (CountryStatusCards) decides whether to render it.
// =============================================================

import { useCountryUpload } from '../lib/countryUpload';
import { SLOW_AFTER_MS } from '../lib/summaryRefresh';
import { UploadIcon } from './icons';

export default function CountryUploadZone({ country, onUploaded }) {
  const {
    fileName,
    status,
    busy,
    progress,
    error,
    skippedRows,
    deadRows,
    refreshElapsed,
    refreshMs,
    handleFile,
    reset,
  } = useCountryUpload({ country, onUploaded });

  return (
    <div className="country-upload-zone">
      {status === 'idle' || status === 'error' ? (
        <label className="upload-drop upload-drop-compact">
          <UploadIcon />
          <span>{fileName ? `Retry ${country} file` : `Upload ${country} file`}</span>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>
      ) : (
        <div className="upload-status upload-status-compact">
          <div className="upload-status-file" title={fileName}>
            {fileName}
          </div>
          {status === 'reading' && <div className="upload-status-line">Reading workbook…</div>}
          {status === 'uploading' && (
            <div className="upload-status-line">
              {progress.done.toLocaleString()}
              {progress.total ? ` / ${progress.total.toLocaleString()}` : ''} rows…
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}
          {status === 'refreshing' && (
            <div className="upload-status-line">
              Refreshing… {Math.round(refreshElapsed / 1000)}s
              {refreshElapsed > SLOW_AFTER_MS && (
                <div className="upload-refresh-note upload-refresh-note-compact">Still working, safe to wait.</div>
              )}
            </div>
          )}
          {status === 'done' && (
            <div className="upload-done upload-done-compact">
              Done — {progress.done.toLocaleString()} rows stored
              {deadRows > 0 && (
                <div className="upload-refresh-note upload-refresh-note-compact">
                  {deadRows.toLocaleString()} skipped (no stock/sales/purchases)
                </div>
              )}
              {skippedRows > 0 && (
                <div className="upload-skipped upload-skipped-compact">
                  {skippedRows.toLocaleString()} skipped — unknown shop code
                </div>
              )}
              {refreshMs !== null && <div>Refreshed in {(refreshMs / 1000).toFixed(1)}s</div>}
              <button type="button" className="upload-again-link" onClick={reset}>
                Upload another file
              </button>
            </div>
          )}
        </div>
      )}
      {error && (
        <div className="error-box small">
          {error}
          <button type="button" className="upload-again-link" onClick={reset}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
