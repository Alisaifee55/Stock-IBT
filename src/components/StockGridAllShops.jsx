// =============================================================
// StockGridAllShops.jsx — v2.2 — 12-09-2026
// Reworked to match the reviewed prototype: every shop's column
// starts collapsed to just its Stock number. Click anywhere in a
// shop's column (header or its Stock cell) to expand it to
// Purchase/Sale/Stock/Last for that shop only — only one shop is
// expanded at a time. Once expanded, the Stock cell is still the
// same "add to cart" control as before; Purchase/Sale/Last cells and
// the header just open/close the column, so reading detail can't
// accidentally queue a transfer.
// =============================================================

import { Fragment, useState } from 'react';
import { formatIsoDate } from '../lib/stockQueries';

const COUNTRY_CLASS = { UAE: 'is-uae', OMAN: 'is-oman', KUWAIT: 'is-kuwait' };

export default function StockGridAllShops({ shops, grid, myShopId, canRequest, cart, dispatch }) {
  const [expandedShopId, setExpandedShopId] = useState(null);

  if (!grid || shops.length === 0) {
    return <div className="model-modal-empty">No stock data found for this model.</div>;
  }

  const toggle = (shopId) => setExpandedShopId((cur) => (cur === shopId ? null : shopId));

  return (
    <div className="ibt-grid-scroll">
      <table className="ibt-grid-table">
        <thead>
          <tr>
            <th className="ibt-grid-sticky ibt-grid-col-color" rowSpan={2}>
              Color
            </th>
            <th className="ibt-grid-sticky ibt-grid-col-size" rowSpan={2}>
              Size
            </th>
            {shops.map((s) => {
              const isOpen = s.id === expandedShopId;
              const countryClass = COUNTRY_CLASS[s.country] || '';
              return (
                <th
                  key={s.id}
                  className={`ibt-grid-shop-head ${countryClass}${isOpen ? ' is-open' : ''}`}
                  colSpan={isOpen ? 4 : 1}
                  onClick={() => toggle(s.id)}
                >
                  <div className="ibt-grid-shop-head-inner">
                    <span className="ibt-grid-shop-code">
                      {s.code}
                      {s.id === myShopId && <span className="ibt-grid-you-tag">You</span>}
                      <svg className="ibt-grid-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </span>
                    <span className="ibt-grid-shop-country">{s.country}</span>
                  </div>
                </th>
              );
            })}
          </tr>
          <tr>
            {shops.map((s) => {
              const isOpen = s.id === expandedShopId;
              const countryClass = COUNTRY_CLASS[s.country] || '';
              if (isOpen) {
                return (
                  <Fragment key={s.id}>
                    <th className={`ibt-grid-sub col-divider-left ${countryClass}`}>PUR</th>
                    <th className={`ibt-grid-sub ${countryClass}`}>SALE</th>
                    <th className={`ibt-grid-sub ${countryClass}`}>STOCK</th>
                    <th className={`ibt-grid-sub ibt-grid-shop-end ${countryClass}`}>LAST</th>
                  </Fragment>
                );
              }
              return (
                <th key={s.id} className={`ibt-grid-sub ${countryClass}`}>
                  STOCK
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((row, i) => (
            <tr key={`${row.color || ''}|${row.size || ''}|${i}`}>
              <td className="ibt-grid-sticky ibt-grid-col-color">
                <span className="ibt-grid-swatch" aria-hidden="true" />
                {row.color || '—'}
              </td>
              <td className="ibt-grid-sticky ibt-grid-col-size">{row.size || '—'}</td>
              {shops.map((s) => {
                const cell = grid.cellFor(s.id, row.color, row.size);
                const isMine = s.id === myShopId;
                const bal = cell ? Number(cell.closing_stock) : null;
                const cartKey = `${row.color || ''}|${row.size || ''}`;
                const queuedHere = cart.supplyingShopId === s.id && cart.lines.has(cartKey);
                const isOpen = s.id === expandedShopId;
                const countryClass = COUNTRY_CLASS[s.country] || '';
                const clickableToRequest = !!cell && bal > 0 && !isMine && canRequest;

                if (!isOpen) {
                  return (
                    <td
                      key={s.id}
                      className={`ibt-grid-num ibt-grid-collapsed-cell ${countryClass}`}
                      onClick={() => toggle(s.id)}
                    >
                      {cell ? (
                        <span className={`ibt-bal-pill${bal > 0 ? ' has-stock' : ''}`}>{bal}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                  );
                }

                return (
                  <Fragment key={s.id}>
                    <td className={`ibt-grid-num col-divider-left ${countryClass}`}>{cell ? cell.total_purchase : '—'}</td>
                    <td className={`ibt-grid-num ${countryClass}`}>{cell ? cell.total_sales : '—'}</td>
                    <td className={`ibt-grid-num ${countryClass}`}>
                      {cell ? (
                        <button
                          type="button"
                          className={`ibt-bal-pill${bal > 0 ? ' has-stock' : ''}${
                            clickableToRequest ? ' is-clickable' : ''
                          }${queuedHere ? ' is-queued' : ''}`}
                          disabled={!clickableToRequest}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (clickableToRequest) {
                              dispatch({ type: 'pick', shop: s, color: row.color, size: row.size, available: bal });
                            }
                          }}
                          title={
                            isMine
                              ? 'This is your own shop'
                              : clickableToRequest
                              ? `Request from ${s.code}`
                              : bal <= 0
                              ? 'Nothing to request here'
                              : undefined
                          }
                        >
                          {bal}
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className={`ibt-grid-num ibt-grid-shop-end ${countryClass}`}>
                      {cell ? formatIsoDate(cell.last_sales_date) || '—' : '—'}
                    </td>
                  </Fragment>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
