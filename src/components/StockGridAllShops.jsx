// =============================================================
// StockGridAllShops.jsx — v2.1 — 12-09-2026
// New in v2.1: the "All shops grid" view of the Stock Transfer
// Console. One row per Color/Size, one grouped column per shop
// (Purchase / Sale / Balance / Last sale). Replaces the old
// "Also in stock at" pill list — this shows every shop's numbers
// side by side instead of just who has stock.
//
// Clicking a non-zero Balance cell for a shop that isn't yours adds
// that colour/size to the transfer cart, sourced from that shop.
// =============================================================

import { Fragment } from 'react';
import { formatIsoDate } from '../lib/stockQueries';

export default function StockGridAllShops({ shops, grid, myShopId, canRequest, cart, dispatch }) {
  if (!grid || shops.length === 0) {
    return <div className="model-modal-empty">No stock data found for this model.</div>;
  }

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
            {shops.map((s) => (
              <th key={s.id} className={`ibt-grid-shop-head${s.country === 'OMAN' ? ' is-oman' : ''}`} colSpan={4}>
                {s.code}
                {s.id === myShopId && <span className="ibt-grid-you-tag">You</span>}
                <div className="ibt-grid-shop-country">{s.country}</div>
              </th>
            ))}
          </tr>
          <tr>
            {shops.map((s) => (
              <Fragment key={s.id}>
                <th className="ibt-grid-sub">PUR</th>
                <th className="ibt-grid-sub">SALE</th>
                <th className="ibt-grid-sub">BAL</th>
                <th className="ibt-grid-sub ibt-grid-shop-end">LAST</th>
              </Fragment>
            ))}
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
                const clickable = !!cell && bal > 0 && !isMine && canRequest;
                return (
                  <Fragment key={s.id}>
                    <td className="ibt-grid-num">{cell ? cell.total_purchase : '—'}</td>
                    <td className="ibt-grid-num">{cell ? cell.total_sales : '—'}</td>
                    <td className="ibt-grid-num">
                      {cell ? (
                        <button
                          type="button"
                          className={`ibt-bal-pill${bal > 0 ? ' has-stock' : ''}${clickable ? ' is-clickable' : ''}${
                            queuedHere ? ' is-queued' : ''
                          }`}
                          disabled={!clickable}
                          onClick={() =>
                            clickable &&
                            dispatch({
                              type: 'pick',
                              shop: s,
                              color: row.color,
                              size: row.size,
                              available: bal,
                            })
                          }
                          title={
                            isMine
                              ? 'This is your own shop'
                              : clickable
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
                    <td className="ibt-grid-num ibt-grid-shop-end">
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
