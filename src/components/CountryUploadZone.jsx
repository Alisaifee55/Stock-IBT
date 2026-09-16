// =============================================================
// CountryUploadZone.jsx — v2.7 — 15-09-2026
// Changes from v2.1: holds the parent card open for the whole
// upload journey, which is what fixes Excel upload doing nothing.
//
// The card used to auto-collapse 5s after appearing, including while
// the OS file dialog was open — unmounting this component's file
// input mid-pick, so onChange never fired. Now:
//   input clicked      -> hold (dialog is open, could be minutes)
//   file chosen        -> stay held through reading/uploading/refresh
//   dialog cancelled   -> release
//   upload done/failed -> release
// Cancelling is detected two ways because the native 'cancel' event
// is only in newer browsers: the event if present, and a window-focus
// check as the fallback for older Safari. Unmounting releases too, so
// a hold can never leak and freeze a card open forever.
// The upload pipeline itself is untouched.
// =============================================================

import { useCallback, useEffect, useRef } from 'react';
import { useCountryUpload } from '../lib/countryUpload';
import { SLOW_AFTER_MS } from '../lib/summaryRefresh';
import { UploadIcon } from './icons';

export default function CountryUploadZone({ country, onUploaded, onHold, onRelease }) {
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

  // 'dialog' = file picker open, 'working' = upload in flight.
  const phaseRef = useRef(null);
  const inputRef = useRef(null);

  const beginHold = useCallback(
    (phase) => {
      if (phaseRef.current === null) onHold?.();
      phaseRef.current = phase;
    },
    [onHold]
  );

  const endHold = useCallback(() => {
    if (phaseRef.current !== null) {
      phaseRef.current = null;
      onRelease?.();
    }
  }, [onRelease]);

  // Release once the upload has finished, either way.
  useEffect(() => {
    if (phaseRef.current === 'working' && (status === 'done' || status === 'error')) {
      endHold();
    }
  }, [status, endHold]);

  // Cancelled dialog: the user comes back to the window without
  // having chosen anything. Checked on the next frame so a real
  // selection (which fires change first) wins the race.
  useEffect(() => {
    const onFocus = () => {
      if (phaseRef.current !== 'dialog') return;
      setTimeout(() => {
        if (phaseRef.current === 'dialog') endHold();
      }, 400);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [endHold]);

  // Never leave a hold behind.
  useEffect(() => endHold, [endHold]);

  return (
    <div className="country-upload-zone">
      {status === 'idle' || status === 'error' ? (
        <label className="upload-drop upload-drop-compact">
          <UploadIcon />
          <span>{fileName ? `Retry ${country} file` : `Upload ${country} file`}</span>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            onClick={() => beginHold('dialog')}
            onCancel={endHold}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                beginHold('working');
                handleFile(file);
              } else {
                endHold();
              }
            }}
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
      {busy && <span className="sr-only">Upload in progress</span>}
    </div>
  );
}
