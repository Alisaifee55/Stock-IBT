// =============================================================
// CountryUploadZone.jsx — v2.8 — 15-09-2026
// Changes from v2.7: this is now PRESENTATIONAL. The upload pipeline
// (useCountryUpload) moved up into CountryCard, which never unmounts,
// so an auto-collapse can no longer wipe an upload in progress — the
// actual cause of "picked the file, process started, then back to the
// beginning". See CountryStatusCards.jsx v2.8.
//
// It still reports when the OS file dialog opens and closes, so the
// card can refuse to collapse underneath it. Cancellation is detected
// by the native 'cancel' event where available and by a window-focus
// check for older Safari, but neither is load-bearing any more: if
// both are missed, the worst case is a card that stays open a few
// seconds longer, not a destroyed upload.
// =============================================================

import { useCallback, useEffect, useRef } from 'react';
import { SLOW_AFTER_MS } from '../lib/summaryRefresh';
import { UploadIcon } from './icons';

export default function CountryUploadZone({ country, upload, onDialogOpen, onDialogClose }) {
  const {
    fileName,
    status,
    progress,
    error,
    skippedRows,
    deadRows,
    refreshElapsed,
    refreshMs,
    handleFile,
    reset,
  } = upload;

  const dialogRef = useRef(false);

  const openDialog = useCallback(() => {
    if (!dialogRef.current) {
      dialogRef.current = true;
      onDialogOpen?.();
    }
  }, [onDialogOpen]);

  const closeDialog = useCallback(() => {
    if (dialogRef.current) {
      dialogRef.current = false;
      onDialogClose?.();
    }
  }, [onDialogClose]);

  // Cancelled picker: focus returns with nothing chosen. Checked on a
  // delay so a real selection (change fires around the same time, and
  // in a different order on Windows) wins the race.
  useEffect(() => {
    const onFocus = () => {
      if (!dialogRef.current) return;
      setTimeout(() => {
        if (dialogRef.current) closeDialog();
      }, 500);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [closeDialog]);

  useEffect(() => closeDialog, [closeDialog]);

  return (
    <div className="country-upload-zone">
      {status === 'idle' || status === 'error' ? (
        <label className="upload-drop upload-drop-compact">
          <UploadIcon />
          <span>{fileName ? `Retry ${country} file` : `Upload ${country} file`}</span>
          <input
            type="file"
            accept=".xlsx,.xls"
            onClick={openDialog}
            onCancel={closeDialog}
            onChange={(e) => {
              const file = e.target.files?.[0];
              closeDialog();
              if (file) handleFile(file);
              // Allow re-picking the same file after a failure.
              e.target.value = '';
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
    </div>
  );
}
