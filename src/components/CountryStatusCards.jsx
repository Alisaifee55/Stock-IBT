import { COUNTRIES, useCountryStatus } from '../lib/stockQueries';

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
                  <span className="label">Rows uploaded</span>
                </div>
                <div className="country-card-stat">
                  <span className="value">{(s.modelCount ?? 0).toLocaleString()}</span>
                  <span className="label">Models (in stock)</span>
                </div>
                <div className="country-card-updated">
                  Updated {new Date(upload.uploaded_at).toLocaleDateString()}{' '}
                  {new Date(upload.uploaded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
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
