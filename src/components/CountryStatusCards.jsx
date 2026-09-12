// =============================================================
// CountryStatusCards.jsx — v2.1 — 12-09-2026
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
import CountryUploadZone from './CountryUploadZone';

export default function CountryStatusCards({ refreshToken, isAdmin, onUploaded, trailingCard }) {
  const status = useCountryStatus(refreshToken);

  return (
    <div className="country-cards">
      {COUNTRIES.map((country) => {
        const s = status[country];
        const upload = s?.upload;
        return (
          <div className="country-card" key={country}>
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
      })}
      {trailingCard}
    </div>
  );
}
