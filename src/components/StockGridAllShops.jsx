// =============================================================
// StockGridAllShops.jsx — v2.5 — 13-09-2026
// Changes from v2.4:
//  - Two-way now: clicking a Stock number on ANOTHER shop still
//    straight-adds a "request from them" line (unchanged). Clicking
//    YOUR OWN shop's Stock number now opens a shop picker to choose
//    where to SEND it — previously your own column wasn't clickable.
//  - Head Office (admin) accounts have no shop of their own, so every
//    Stock click opens the picker: the clicked shop supplies, the
//    picked shop requests.
//  - Reads/writes the app-level cart via useCart() instead of local
//    props — the cart now spans every model and shop you visit, not
//    just this one console session.
//  - A slightly heavier bottom border now separates each colour's
//    group of Size rows from the next, so adjacent colours don't run
//    together.
// Carried over from v2.4:
//  - Big filled Color cell per colour (Option B), real per-row Size
//    data (not aggregated), fixed shop order + country colour tint,
//    collapsed/expanded header number formatting, "Nd ago" last sale.
// =============================================================

import { Fragment, useMemo, useState } from 'react';
import { daysSince } from '../lib/stockQueries';
import { resolveColorFill } from '../lib/colorFill';
import { useCart } from '../lib/cartContext';
import ShopPickerPopover from './ShopPickerPopover';

const COUNTRY_CLASS = { UAE: 'is-uae', OMAN: 'is-oman', KUWAIT: 'is-kuwait' };

export default function StockGridAllShops({ modelNo, shops, grid, myShopId, canRequest, isAdmin }) {
  const [expandedShopId, setExpandedShopId] = useState(null);
  const [picker, setPicker] = useState(null); // { supplyingShop, color, size, available } | null
  const cart = useCart();
  const canTransact = canRequest || isAdmin;
  const myShop = useMemo(() => shops.find((s) => s.id === myShopId) || null, [shops, myShopId]);

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

  const addLine = (requestingShop, supplyingShop, color, size, available) => {
    cart.addLine({
      requestingShopId: requestingShop.id,
      requestingShopCode: requestingShop.code,
      supplyingShopId: supplyingShop.id,
      supplyingShopCode: supplyingShop.code,
      modelNo,
      color,
      size,
      available,
    });
  };

  const handleStockClick = (shop, color, size, available) => {
    if (isAdmin) {
      setPicker({ supplyingShop: shop, color, size, available });
      return;
    }
    if (!canRequest || !myShop) return;
    if (shop.id === myShopId) {
      setPicker({ supplyingShop: shop, color, size, available }); // send: pick the destination
    } else {
      addLine(myShop, shop, color, size, available); // request: straight add, no picker needed
    }
  };

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
              const isGroupEnd = ri === group.sizeRows.length - 1;
              return (
                <tr key={`${group.color || ''}|${row.size || ''}|${gi}-${ri}`} className={isGroupEnd ? 'ibt-grid-color-group-end' : ''}>
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
                    const bal = cell ? Number(cell.closing_stock) : null;
                    const queuedHere = cell && cart.isQueued(modelNo, row.color, row.size, s.id);
                    const isOpen = s.id === expandedShopId;
                    const countryClass = COUNTRY_CLASS[s.country] || '';
                    const clickable = !!cell && bal > 0 && canTransact;

                    const stockBtn = cell ? (
                      <button
                        type="button"
                        className={`ibt-bal-pill${bal > 0 ? ' has-stock' : ''}${clickable ? ' is-clickable' : ''}${
                          queuedHere ? ' is-queued' : ''
                        }`}
                        disabled={!clickable}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (clickable) handleStockClick(s, row.color, row.size, bal);
                        }}
                        title={
                          !canTransact
                            ? undefined
                            : bal <= 0
                            ? 'Nothing to move here'
                            : s.id === myShopId || isAdmin
                            ? `Send from ${s.code}…`
                            : `Request from ${s.code}`
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

      {picker && (
        <ShopPickerPopover
          title={
            isAdmin
              ? `Requesting shop — supplying from ${picker.supplyingShop.code}`
              : `Send ${picker.color || ''} ${picker.size || ''} to…`
          }
          shops={shops}
          excludeShopId={picker.supplyingShop.id}
          onClose={() => setPicker(null)}
          onPick={(destShop) => {
            addLine(destShop, picker.supplyingShop, picker.color, picker.size, picker.available);
            setPicker(null);
          }}
        />
      )}
    </div>
  );
}
