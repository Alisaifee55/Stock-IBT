// =============================================================
// ModelDetailModal.jsx — v2.2 — 12-09-2026
// Redesigned as the "IBT · Stock Transfer Console". Changes from v2.1:
//  - Photo is clickable: opens a large (600x800) lightbox, closes on
//    backdrop click or Escape.
//  - "All shops grid" reworked to match the reviewed prototype: every
//    shop starts collapsed to just its Stock number; clicking anywhere
//    in a shop's column expands it to Purchase/Sale/Stock/Last for
//    that shop only (one shop open at a time). Once a column is open,
//    its Stock cell is still the "add to cart" control from v2.1 —
//    clicking Purchase/Sale/Last, or the header again, just opens/
//    closes the column rather than queuing anything, so reading the
//    detail can't accidentally start a transfer.
//  - Country colouring now reuses the app's own palette (teal/orange/
//    green for UAE/Oman/Kuwait) instead of the prototype's colours.
// =============================================================

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useModelGridAcrossShops, formatIsoDate, sortShopsForViewer } from '../lib/stockQueries';
import StockGridAllShops from './StockGridAllShops';
import StockByShopView from './StockByShopView';
import TransferCartPanel from './TransferCartPanel';

// Central POS image host. One place to change if the path ever moves.
const IMAGE_BASE = 'https://pos.saraplaza.net/modelimages';
export const modelImageUrl = (modelNo) => `${IMAGE_BASE}/${encodeURIComponent(modelNo)}.jpg`;

function ModelPhoto({ modelNo }) {
  const [state, setState] = useState('loading'); // loading | loaded | missing
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setState('loading');
  }, [modelNo]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setExpanded(false);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [expanded]);

  return (
    <>
      <button
        type="button"
        className="model-photo-thumb"
        onClick={() => state === 'loaded' && setExpanded(true)}
        title={state === 'loaded' ? 'Click to enlarge' : undefined}
        aria-label={`Model ${modelNo} photo${state === 'loaded' ? ', click to enlarge' : ''}`}
      >
        {state !== 'loaded' && (
          <div className="model-photo-thumb-placeholder">
            {state === 'loading' ? (
              <span className="refresh-spinner" aria-hidden="true" />
            ) : (
              <span className="model-photo-missing-mark" aria-hidden="true">
                &#9633;
              </span>
            )}
          </div>
        )}
        <img
          src={modelImageUrl(modelNo)}
          alt={`Model ${modelNo}`}
          className={`model-photo-thumb-img${state === 'loaded' ? ' is-visible' : ''}`}
          loading="lazy"
          onLoad={() => setState('loaded')}
          onError={() => setState('missing')}
        />
      </button>

      {expanded && (
        <div className="photo-lightbox is-open" onClick={() => setExpanded(false)} role="presentation">
          <div className="photo-lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <img src={modelImageUrl(modelNo)} alt={`Model ${modelNo}, enlarged`} />
          </div>
          <div className="photo-lightbox-hint">Click anywhere, or press Esc, to close</div>
        </div>
      )}
    </>
  );
}

const INITIAL_CART = {
  supplyingShopId: null,
  supplyingShopCode: '',
  supplyingShopCountry: '',
  lines: new Map(),
  pendingSwitch: null,
};

function cartReducer(state, action) {
  switch (action.type) {
    case 'pick': {
      const { shop, color, size, available } = action;
      const key = `${color || ''}|${size || ''}`;

      // Cart empty, or same supplying shop already in progress: upsert.
      if (!state.supplyingShopId || state.supplyingShopId === shop.id) {
        const lines = new Map(state.lines);
        const existing = lines.get(key);
        const nextQty = Math.min(available, (existing?.qty || 0) + 1);
        lines.set(key, { color, size, qty: nextQty, available });
        return {
          ...state,
          supplyingShopId: shop.id,
          supplyingShopCode: shop.code,
          supplyingShopCountry: shop.country,
          lines,
          pendingSwitch: null,
        };
      }

      // Different shop: a transfer can only have one supplying shop, so
      // ask before wiping out what's already queued.
      return { ...state, pendingSwitch: { shop, color, size, available } };
    }
    case 'confirmSwitch': {
      if (!state.pendingSwitch) return state;
      const { shop, color, size, available } = state.pendingSwitch;
      const key = `${color || ''}|${size || ''}`;
      const lines = new Map();
      lines.set(key, { color, size, qty: 1, available });
      return {
        supplyingShopId: shop.id,
        supplyingShopCode: shop.code,
        supplyingShopCountry: shop.country,
        lines,
        pendingSwitch: null,
      };
    }
    case 'cancelSwitch':
      return { ...state, pendingSwitch: null };
    case 'setQty': {
      const lines = new Map(state.lines);
      const line = lines.get(action.key);
      if (!line) return state;
      let n = action.qty === '' ? 0 : Math.floor(Number(action.qty));
      if (!Number.isFinite(n) || n < 0) n = 0;
      if (n > line.available) n = line.available;
      if (n <= 0) {
        lines.delete(action.key);
      } else {
        lines.set(action.key, { ...line, qty: n });
      }
      if (lines.size === 0) return { ...INITIAL_CART };
      return { ...state, lines };
    }
    case 'removeLine': {
      const lines = new Map(state.lines);
      lines.delete(action.key);
      if (lines.size === 0) return { ...INITIAL_CART };
      return { ...state, lines };
    }
    case 'clear':
      return { ...INITIAL_CART };
    default:
      return state;
  }
}

export default function ModelDetailModal({
  model,
  onClose,
  canRequest = false,
  onTransferCreated,
  myShopId = null,
  myCountry = null,
}) {
  const { modelNo, shopId, shopCode, lastSalesDate } = model;
  const { shops: shopsRaw, grid, loading, error } = useModelGridAcrossShops(modelNo);
  const shops = useMemo(() => sortShopsForViewer(shopsRaw, myCountry), [shopsRaw, myCountry]);
  const [view, setView] = useState('grid'); // grid | byshop
  const [cart, dispatch] = useReducer(cartReducer, INITIAL_CART);
  const closeBtnRef = useRef(null);
  const scrollRef = useRef(null);
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);

  const handleScroll = useCallback((e) => {
    const top = e.target.scrollTop;
    setSummaryCollapsed((prev) => {
      if (!prev && top > 36) return true;
      if (prev && top < 10) return false;
      return prev;
    });
  }, []);

  // Escape closes, focus starts on the close button, body scroll locks.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeBtnRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const priceLabel = useMemo(() => {
    const p = grid?.salesPrice ?? model.salesPrice;
    return p !== null && p !== undefined ? `AED ${Number(p).toLocaleString()}` : null;
  }, [grid, model.salesPrice]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-card ibt-console"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ibt-console-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ibt-console-topbar">
          <div className="ibt-console-brand">IBT &middot; Stock Transfer Console</div>
          {summaryCollapsed && (
            <div className="ibt-console-condensed">
              <strong>{modelNo}</strong>
              {priceLabel && <span> &middot; {priceLabel}</span>}
            </div>
          )}
          <button ref={closeBtnRef} type="button" className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="ibt-console-scroll" ref={scrollRef} onScroll={handleScroll}>
          <div className={`ibt-console-summary${summaryCollapsed ? ' is-collapsed' : ''}`}>
            <ModelPhoto modelNo={modelNo} />
            <div className="ibt-console-heading">
              <h4 id="ibt-console-title">{modelNo}</h4>
              <div className="ibt-console-chips">
                {priceLabel && <span className="pill pill-neutral">{priceLabel}</span>}
                <span className="pill pill-neutral">{shops.length} shop{shops.length === 1 ? '' : 's'}</span>
                {grid && (
                  <span className="pill pill-neutral">
                  {grid.colorCount} color{grid.colorCount === 1 ? '' : 's'} &times; {grid.sizeCount} size
                  {grid.sizeCount === 1 ? '' : 's'}
                </span>
              )}
              {grid?.category && <span className="pill pill-neutral">{grid.category}</span>}
            </div>
          </div>
          {grid && (
            <div className="ibt-console-totals">
              <div className="ibt-console-stat">
                <span className="value">{grid.totals.stock.toLocaleString()}</span>
                <span className="label">total stock</span>
              </div>
              <div className="ibt-console-stat">
                <span className="value">{grid.totals.sales.toLocaleString()}</span>
                <span className="label">units sold</span>
              </div>
              <div className="ibt-console-stat">
                <span className="value">{grid.totals.purchase.toLocaleString()}</span>
                <span className="label">units purchased</span>
              </div>
            </div>
          )}
          </div>

          <div className="ibt-console-toolbar">
            <div className="segmented-control" role="tablist" aria-label="Stock view">
              <button
                type="button"
                role="tab"
                aria-selected={view === 'byshop'}
                className={`segmented-btn${view === 'byshop' ? ' is-active' : ''}`}
                onClick={() => setView('byshop')}
              >
                By shop
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === 'grid'}
                className={`segmented-btn${view === 'grid' ? ' is-active' : ''}`}
                onClick={() => setView('grid')}
              >
                All shops grid
              </button>
            </div>
          </div>

          <div className="ibt-console-body">
          <div className="ibt-console-main">
            {loading && (
              <div className="model-modal-loading">
                <span className="refresh-spinner" aria-hidden="true" />
                Loading stock across shops…
              </div>
            )}
            {error && <div className="error-box small">Couldn't load stock data: {error}</div>}
            {!loading && !error && view === 'grid' && (
              <StockGridAllShops
                shops={shops}
                grid={grid}
                myShopId={myShopId}
                canRequest={canRequest}
                cart={cart}
                dispatch={dispatch}
              />
            )}
            {!loading && !error && view === 'byshop' && (
              <StockByShopView
                shops={shops}
                grid={grid}
                myShopId={myShopId}
                canRequest={canRequest}
                cart={cart}
                dispatch={dispatch}
                defaultShopId={myShopId || shopId}
              />
            )}
            {!loading && !error && grid && (
              <div className="ibt-console-hint">
                {canRequest
                  ? 'Tap a Balance cell to queue it in the Transfer cart.'
                  : `Last sale here: ${formatIsoDate(lastSalesDate) || '—'} (${shopCode})`}
              </div>
            )}
          </div>

          <div className="ibt-console-side">
            <TransferCartPanel modelNo={modelNo} cart={cart} dispatch={dispatch} onCreated={onTransferCreated} />
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
