// =============================================================
// CountryStatusCards.jsx — v2.0 — 12-09-2026
// Changes from v1.0:
//  - "Models (in stock)" counted every summary row for the country,
//    including zero-stock models that still have sales history. Now
//    shows both figures, each labelled for what it actually is.
//  - Dates render as DD-MM-YYYY HH:MM instead of the browser's locale
//    default (it was showing 9/12/2026 07:21 PM).
// =============================================================

import { COUNTRIES, useCountryStatus } from '../lib/stockQueries';
import { formatStamp } from '../lib/summaryRefresh';

export default function CountryStatusCards({ refreshToken }) {
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
          </div>
        );
      })}
    </div>
  );
}
