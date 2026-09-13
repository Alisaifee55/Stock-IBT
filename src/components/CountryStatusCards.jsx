// =============================================================
// CountryStatusCards.jsx — v2.3 — 12-09-2026
// Changes from v2.1:
//  - Each card now auto-collapses to a one-line summary 5s after
//    being shown, and expands again on click — see useAutoCollapse.js.
// Changes from v2.0:
//  - Admin accounts now get an inline stock-upload drop-zone built
//    directly into each country's card (replaces the old separate
//    "Central stock upload" panel below the cards).
//  - Accepts a `trailingCard` element so the caller can append one
//    more card (Storage summary) to the same row without this
//    component needing to know anything about storage.
// Unchanged from v1.0/v2.0:
//  - "Models (in stock)" vs "Models tracked" distinction.
//  - Dates render as DD-MM-YYYY HH:MM, never the browser locale default.
// =============================================================

import { COUNTRIES, useCountryStatus } from '../lib/stockQueries';
import { formatStamp } from '../lib/summaryRefresh';
import { useAutoCollapse } from '../lib/useAutoCollapse';
import CountryUploadZone from './CountryUploadZone';

function CountryCard({ country, s, isAdmin, onUploaded }) {
  const upload = s?.upload;
  const { expanded, expand } = useAutoCollapse([upload?.uploaded_at, upload?.row_count]);

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
      {isAdmin && <CountryUploadZone country={country} onUploaded={onUploaded} />}
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
