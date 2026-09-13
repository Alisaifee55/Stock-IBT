// =============================================================
// StockGridAllShops.jsx — v2.3 — 12-09-2026
// Changes from v2.2:
//  - Collapsed header now shows that shop's TOTAL stock for this
//    model instead of the country name (country is still shown by
//    the column's colour, and in the "You" tag's tooltip).
//  - Clicking the shop CODE/header is now the only way to expand a
//    column. Clicking a Stock number — collapsed or expanded — adds
//    it to the cart directly; it no longer expands the column first.
//    That's a deliberate split: the header is "look", the Stock
//    number is "act".
//  - When a column is expanded, the header's single total-stock
//    number is replaced by three compact stats (Purchase / Sale /
//    Stock totals for that shop), styled differently from the
//    collapsed state so it's obvious the header itself changed.
//  - Last sale now shows "Nd ago" instead of a date.
// =============================================================

import { Fragment, useMemo, useState } from 'react';
import { daysSince } from '../lib/stockQueries';

const COUNTRY_CLASS = { UAE: 'is-uae', OMAN: 'is-oman', KUWAIT: 'is-kuwait' };

export default function StockGridAllShops({ shops, grid, myShopId, canRequest, cart, dispatch }) {
  const [expandedShopId, setExpandedShopId] = useState(null);

  // Per-shop totals (Purchase / Sale / Stock) across every Color/Size
  // row of this model — drives both the collapsed "total stock"
  // header number and the expanded 3-stat header.
  const shopTotals = useMemo(() => {
    const totals = new Map();
    if (!grid) return totals;
    shops.forEach((s) => {
      let pur = 0;
      let sale = 0;
      let stock = 0;
      grid.rows.forEach((row) => {
        const cell = grid.cellFor(s.id, row.color, row.size);
        if (!cell) return;
        pur += Number(cell.total_purchase) || 0;
        sale += Number(cell.total_sales) || 0;
        stock += Number(cell.closing_stock) || 0;
      });
      totals.set(s.id, { pur, sale, stock });
    });
    return totals;
  }, [shops, grid]);

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
              const t = shopTotals.get(s.id) || { pur: 0, sale: 0, stock: 0 };
              return (
                <th
                  key={s.id}
                  className={`ibt-grid-shop-head ${countryClass}${isOpen ? ' is-open' : ''}`}
                  colSpan={isOpen ? 4 : 1}
                  onClick={() => toggle(s.id)}
                  title={`${s.country} — click to ${isOpen ? 'collapse' : 'expand'} ${s.code}`}
                >
                  <div className="ibt-grid-shop-head-inner">
                    <span className="ibt-grid-shop-code">
                      {s.code}
                      {s.id === myShopId && <span className="ibt-grid-you-tag">You</span>}
                      <svg className="ibt-grid-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </span>
                    {isOpen ? (
                      <span className="ibt-grid-shop-mini-stats">
                        <span title="Total purchased">P {t.pur}</span>
                        <span title="Total sold">S {t.sale}</span>
                        <span title="Total stock" className="is-stock">ST {t.stock}</span>
                      </span>
                    ) : (
                      <span className="ibt-grid-shop-total">{t.stock.toLocaleString()} in stock</span>
                    )}
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

                const stockBtn = cell ? (
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
                        ? `Add to cart from ${s.code}`
                        : bal <= 0
                        ? 'Nothing to request here'
                        : undefined
                    }
                  >
                    {bal}
                  </button>
                ) : (
                  '—'
                );

                if (!isOpen) {
                  return (
                    <td key={s.id} className={`ibt-grid-num ${countryClass}`}>
                      {stockBtn}
                    </td>
                  );
                }

                return (
                  <Fragment key={s.id}>
                    <td className={`ibt-grid-num col-divider-left ${countryClass}`}>{cell ? cell.total_purchase : '—'}</td>
                    <td className={`ibt-grid-num ${countryClass}`}>{cell ? cell.total_sales : '—'}</td>
                    <td className={`ibt-grid-num ${countryClass}`}>{stockBtn}</td>
                    <td className={`ibt-grid-num ibt-grid-shop-end ${countryClass}`}>
                      {cell ? (cell.last_sales_date ? `${daysSince(cell.last_sales_date)}d` : '—') : '—'}
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
