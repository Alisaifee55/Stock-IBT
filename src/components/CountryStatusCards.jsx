// =============================================================
// CountryStatusCards.jsx — v2.8 — 15-09-2026
// Changes from v2.7 — THIS IS THE REAL EXCEL UPLOAD FIX.
//
// The bug: CountryCard returned a <button> when collapsed and a <div>
// when expanded. A different element type in the same position makes
// React destroy and rebuild the whole subtree — so every auto-collapse
// UNMOUNTED CountryUploadZone, and useCountryUpload's state (status,
// progress, the file itself) was wiped back to 'idle'. Mid-upload that
// looked exactly like what was reported: the file is picked, the
// process starts, then the card snaps back to the Upload button as if
// nothing happened. It also set the hook's unmountedRef, which
// cancelled the summary-refresh poll.
//
// v2.7 tried to prevent the ill-timed collapse. That was the wrong
// layer: any missed hold still destroyed a live upload. Now:
//
//  1. useCountryUpload lives HERE, in CountryCard, which is keyed by
//     country and never unmounts. Upload state cannot be lost to a
//     collapse, whatever the timing.
//  2. The card always renders the SAME root <div>. Collapsed is a
//     class and a different set of children, never a different
//     element type, so React reuses the node instead of rebuilding it.
//  3. The card cannot auto-collapse while busy or while a file dialog
//     is open (lockOpen), and a collapsed card still reports upload
//     progress instead of hiding it.
//
// CountryUploadZone is now presentational — it renders the state it is
// given. Unchanged: admin-only upload zone, the `trailingCard` slot,
// "Models (in stock)" vs "Models tracked", DD-MM-YYYY HH:MM stamps.
// =============================================================

import { useState } from 'react';
import { COUNTRIES, useCountryStatus } from '../lib/stockQueries';
import { useCountryUpload } from '../lib/countryUpload';
import { formatStamp } from '../lib/summaryRefresh';
import { useAutoCollapse } from '../lib/useAutoCollapse';
import CountryUploadZone from './CountryUploadZone';

function CountryCard({ country, s, isAdmin, onUploaded }) {
  const upload = s?.upload;

  // The upload pipeline is owned by the card, not by the zone inside
  // it, precisely so that collapsing cannot reset it.
  const up = useCountryUpload({ country, onUploaded });

  // True while the OS file picker is open. Nothing else can tell us —
  // there is no reliable cross-browser event for "dialog closed".
  const [dialogOpen, setDialogOpen] = useState(false);

  const lockOpen = isAdmin && (up.busy || dialogOpen);
  const { expanded, expand } = useAutoCollapse(
    [upload?.uploaded_at, upload?.row_count],
    lockOpen
  );

  // One line describing an upload in flight, so a collapsed card never
  // hides the fact that work is running.
  const workingLine = (() => {
    if (up.status === 'reading') return 'Reading workbook…';
    if (up.status === 'uploading') {
      return `Uploading ${up.progress.done.toLocaleString()}${
        up.progress.total ? ` / ${up.progress.total.toLocaleString()}` : ''
      } rows…`;
    }
    if (up.status === 'refreshing') return 'Refreshing report…';
    if (up.status === 'error') return 'Upload failed';
    return null;
  })();

  return (
    <div className={`country-card${expanded ? '' : ' is-collapsed'}`}>
      {expanded ? (
        <>
          <div className="country-card-name">{country}</div>
          {upload ? (
            <>
              <div className="country-card-stat">
                <span className="value">{upload.row_count?.toLocaleString() ?? '—'}</span>
                <span className="label">Rows stored</span>
              </div>
              <div className="country-card-stat">
                <span className="value">{(s.inStockCount ?? 0).toLocaleString()}</span>
                <span className="label">Models in stock</span>
              </div>
              <div className="country-card-stat sub-stat">
                <span className="value">{(s.modelCount ?? 0).toLocaleString()}</span>
                <span className="label">Models tracked</span>
              </div>
              <div className="country-card-updated">Updated {formatStamp(upload.uploaded_at)}</div>
              <div className="country-card-file" title={upload.source_filename}>
                {upload.source_filename}
              </div>
            </>
          ) : (
            <div className="country-card-empty">No data uploaded yet</div>
          )}
        </>
      ) : (
        // Collapsed: same <div>, different children. Clicking anywhere
        // on it expands. Kept as a real button for keyboard users.
        <button
          type="button"
          className="country-card-collapsed-hit"
          onClick={expand}
          title={`Expand ${country}`}
        >
          <span className="country-card-collapsed-name">{country}</span>
          <span className="country-card-collapsed-stat">
            {workingLine || (upload ? `${(s.inStockCount ?? 0).toLocaleString()} in stock` : 'No data')}
          </span>
        </button>
      )}

      {/* Always mounted for admins — hidden, never unmounted, when the
          card is collapsed. This is what keeps an upload alive. */}
      {isAdmin && (
        <div style={expanded ? undefined : { display: 'none' }}>
          <CountryUploadZone
            country={country}
            upload={up}
            onDialogOpen={() => setDialogOpen(true)}
            onDialogClose={() => setDialogOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

export default function CountryStatusCards({ refreshToken, isAdmin, onUploaded, trailingCard }) {
  const status = useCountryStatus(refreshToken);

  return (
    <div className="country-cards">
      {COUNTRIES.map((country) => (
        <CountryCard key={country} country={country} s={status[country]} isAdmin={isAdmin} onUploaded={onUploaded} />
      ))}
      {trailingCard}
    </div>
  );
}
