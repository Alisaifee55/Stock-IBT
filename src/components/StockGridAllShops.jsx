// =============================================================
// StockGridAllShops.jsx — v2.4 — 13-09-2026
// Changes from v2.3:
//  - Color/Size rows now group under one big filled Color cell per
//    colour (Option B, approved) — the cell fills with the actual
//    colour ("Dark Green" fills dark green), spanning that colour's
//    Size rows, instead of repeating the colour name on every row.
//    One adaptation from the literal Option B mock: sizes stay as
//    real per-row data here rather than becoming fixed S1..S4
//    columns aggregated across shops — an IBT request needs an exact
//    size, and aggregating sizes away would make the Stock numbers
//    un-clickable for a specific size. Flagging this since it's a
//    deliberate deviation from the reviewed mock, not an oversight.
//  - Collapsed shop header now shows just the number (no "in stock"
//    text), bigger.
//  - Expanded shop header's Purchase/Sale/Stock totals now show as
//    plain numbers (no P/S/ST prefixes), bigger, laid out in a 4-
//    column grid so they land under the PUR/SALE/STOCK/LAST labels
//    in the row below.
// =============================================================

import { Fragment, useMemo, useState } from 'react';
import { daysSince } from '../lib/stockQueries';
import { resolveColorFill } from '../lib/colorFill';

const COUNTRY_CLASS = { UAE: 'is-uae', OMAN: 'is-oman', KUWAIT: 'is-kuwait' };

export default function StockGridAllShops({ shops, grid, myShopId, canRequest, cart, dispatch }) {
  const [expandedShopId, setExpandedShopId] = useState(null);

  // Per-shop totals (Purchase / Sale / Stock) across every Color/Size
  // row of this model — drives both the collapsed "total stock"
  // header number and the expanded 3-number header.
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

  // Group consecutive rows (already sorted by colour, then size) so
  // each colour renders as ONE big filled cell spanning its sizes.
  const rowGroups = useMemo(() => {
    if (!grid) return [];
    const groups = [];
    grid.rows.forEach((row) => {
      const last = groups[groups.length - 1];
      if (last && last.color === row.color) last.sizeRows.push(row);
      else groups.push({ color: row.color, sizeRows: [row] });
    });
    return groups;
  }, [grid]);

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
                        <span title="Total purchased">{t.pur}</span>
                        <span title="Total sold">{t.sale}</span>
                        <span title="Total stock" className="is-stock">{t.stock}</span>
                        <span aria-hidden="true" />
                      </span>
                    ) : (
                      <span className="ibt-grid-shop-total">{t.stock.toLocaleString()}</span>
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
          {rowGroups.map((group, gi) =>
            group.sizeRows.map((row, ri) => {
              const fill = ri === 0 ? resolveColorFill(row.color) : null;
              return (
                <tr key={`${group.color || ''}|${row.size || ''}|${gi}-${ri}`}>
                  {ri === 0 && (
                    <td
                      className="ibt-grid-sticky ibt-grid-col-color ibt-grid-color-fill"
                      rowSpan={group.sizeRows.length}
                      style={{ background: fill.bg, color: fill.text }}
                    >
                      {group.color || 'No colour'}
                    </td>
                  )}
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
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
