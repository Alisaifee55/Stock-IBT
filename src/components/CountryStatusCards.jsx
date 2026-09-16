// =============================================================
// CountryStatusCards.jsx — v2.7 — 15-09-2026
// Changes from v2.3: passes the auto-collapse hold/release handles
// down to CountryUploadZone, so a card cannot collapse while a file
// dialog is open or an upload is running. That collapse was what made
// Excel upload appear to do nothing — see useAutoCollapse.js v2.7.
// Changes from v2.1:
//  - Each card auto-collapses to a one-line summary 5s after being
//    shown, and expands again on click.
// Unchanged from v2.0:
//  - Admin accounts get an inline stock-upload drop-zone on each
//    country card (replaced the old "Central stock upload" panel).
//  - Accepts a `trailingCard` element so the caller can append one
//    more card (Storage summary) to the same row.
//  - "Models (in stock)" vs "Models tracked" distinction.
//  - Dates render DD-MM-YYYY HH:MM, never the browser locale default.
// =============================================================

import { COUNTRIES, useCountryStatus } from '../lib/stockQueries';
import { formatStamp } from '../lib/summaryRefresh';
import { useAutoCollapse } from '../lib/useAutoCollapse';
import CountryUploadZone from './CountryUploadZone';

function CountryCard({ country, s, isAdmin, onUploaded }) {
  const upload = s?.upload;
  const { expanded, expand, hold, release } = useAutoCollapse([upload?.uploaded_at, upload?.row_count]);

  if (!expanded) {
    return (
      <button type="button" className="country-card is-collapsed" onClick={expand} title={`Expand ${country}`}>
        <span className="country-card-collapsed-name">{country}</span>
        <span className="country-card-collapsed-stat">
          {upload ? `${(s.inStockCount ?? 0).toLocaleString()} in stock` : 'No data'}
        </span>
      </button>
    );
  }

  return (
    <div className="country-card">
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
      {isAdmin && (
        <CountryUploadZone
          country={country}
          onUploaded={onUploaded}
          onHold={hold}
          onRelease={release}
        />
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
