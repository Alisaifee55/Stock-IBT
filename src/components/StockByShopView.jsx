// =============================================================
// StockByShopView.jsx — v2.1 — 12-09-2026
// New in v2.1: the "By shop" view of the Stock Transfer Console —
// one shop's Color/Size/Stock/Sales/Purchase/Last table at a time,
// selected via shop pills, sourced from the same grid data as
// StockGridAllShops. Simpler to scan than the full grid when you
// already know which shop you care about.
// =============================================================

import { useEffect, useState } from 'react';
import { formatIsoDate } from '../lib/stockQueries';

export default function StockByShopView({ shops, grid, myShopId, canRequest, cart, dispatch, defaultShopId }) {
  const [activeShopId, setActiveShopId] = useState(defaultShopId || shops[0]?.id || null);

  useEffect(() => {
    if (!activeShopId && shops.length > 0) setActiveShopId(shops[0].id);
  }, [shops, activeShopId]);

  if (!grid || shops.length === 0) {
    return <div className="model-modal-empty">No stock data found for this model.</div>;
  }

  const activeShop = shops.find((s) => s.id === activeShopId) || shops[0];
  const isMine = activeShop?.id === myShopId;

  const shopRows = grid.rows
    .map((row) => ({ row, cell: grid.cellFor(activeShop.id, row.color, row.size) }))
    .filter((r) => r.cell);

  return (
    <div className="by-shop-view">
      <div className="by-shop-tabs">
        {shops.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`by-shop-tab${s.id === activeShop.id ? ' is-active' : ''}${
              s.id === myShopId ? ' is-mine' : ''
            }`}
            onClick={() => setActiveShopId(s.id)}
          >
            {s.code}
            {s.id === myShopId && <span className="ibt-grid-you-tag">You</span>}
          </button>
        ))}
      </div>

      <div className="model-modal-table-wrap by-shop-table-wrap">
        <table className="model-modal-table">
          <thead>
            <tr>
              <th>Color</th>
              <th>Size</th>
              <th>Purch.</th>
              <th>Sales</th>
              <th>Balance</th>
              <th>Last sale</th>
              {!isMine && canRequest && <th />}
            </tr>
          </thead>
          <tbody>
            {shopRows.length === 0 && (
              <tr>
                <td colSpan={isMine || !canRequest ? 6 : 7} className="model-modal-empty">
                  No Color/Size rows for {activeShop.code}.
                </td>
              </tr>
            )}
            {shopRows.map(({ row, cell }) => {
              const bal = Number(cell.closing_stock);
              const cartKey = `${row.color || ''}|${row.size || ''}`;
              const queuedHere = cart.supplyingShopId === activeShop.id && cart.lines.has(cartKey);
              const clickable = bal > 0 && !isMine && canRequest;
              return (
                <tr key={cartKey}>
                  <td>{row.color || '—'}</td>
                  <td>{row.size || '—'}</td>
                  <td>{cell.total_purchase}</td>
                  <td>{cell.total_sales}</td>
                  <td className={bal > 0 ? 'has-stock' : ''}>{bal}</td>
                  <td>{formatIsoDate(cell.last_sales_date) || '—'}</td>
                  {!isMine && canRequest && (
                    <td>
                      <button
                        type="button"
                        className={`by-shop-request-btn${queuedHere ? ' is-queued' : ''}`}
                        disabled={!clickable}
                        onClick={() =>
                          dispatch({ type: 'pick', shop: activeShop, color: row.color, size: row.size, available: bal })
                        }
                      >
                        {queuedHere ? 'In cart' : 'Request'}
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
