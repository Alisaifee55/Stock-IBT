// =============================================================
// ModelDetailModal.jsx — v2.5 — 13-09-2026
// Changes from v2.3: the Transfer cart is app-level now (see
// cartContext.jsx) — it no longer lives inside this modal, so it isn't
// mounted here any more. It's rendered once in App.jsx so it persists
// as you close this console and open another model. StockGridAllShops
// now reads the cart itself via useCart() and needs modelNo + isAdmin
// passed to it directly.
// Carried over from v2.3/v2.2:
//  - Photo is clickable: opens a large (600x800) lightbox, closes on
//    backdrop click or Escape.
//  - Country colouring reuses the app's own palette (teal/orange/
//    green for UAE/Oman/Kuwait).
//  - Scrolling the console expands it toward full-screen and collapses
//    the summary block, so the grid gets more room.
// =============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useModelGridAcrossShops, sortShopsForViewer } from '../lib/stockQueries';
import StockGridAllShops from './StockGridAllShops';

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

export default function ModelDetailModal({
  model,
  onClose,
  canRequest = false,
  isAdmin = false,
  myShopId = null,
  myCountry = null,
}) {
  const { modelNo } = model;
  const { shops: shopsRaw, grid, loading, error } = useModelGridAcrossShops(modelNo);
  const shops = useMemo(() => sortShopsForViewer(shopsRaw, myCountry), [shopsRaw, myCountry]);
  const closeBtnRef = useRef(null);
  const scrollRef = useRef(null);
  const [scrolled, setScrolled] = useState(false); // drives both the collapsed summary and the bigger-page expansion

  const handleScroll = useCallback((e) => {
    const top = e.target.scrollTop;
    setScrolled((prev) => {
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

  const canTransact = canRequest || isAdmin;

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className={`modal-card ibt-console${scrolled ? ' is-fullscreen' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ibt-console-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ibt-console-topbar">
          <div className="ibt-console-brand">IBT &middot; Stock Transfer Console</div>
          {scrolled && (
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
          <div className={`ibt-console-summary${scrolled ? ' is-collapsed' : ''}`}>
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

          <div className="ibt-console-body ibt-console-body-full">
            {loading && (
              <div className="model-modal-loading">
                <span className="refresh-spinner" aria-hidden="true" />
                Loading stock across shops…
              </div>
            )}
            {error && <div className="error-box small">Couldn't load stock data: {error}</div>}
            {!loading && !error && (
              <StockGridAllShops
                modelNo={modelNo}
                shops={shops}
                grid={grid}
                myShopId={myShopId}
                canRequest={canRequest}
                isAdmin={isAdmin}
              />
            )}
            {!loading && !error && grid && (
              <div className="ibt-console-hint">
                {canTransact
                  ? 'Click a shop\u2019s code to see its Purchase/Sale/Stock/Last. Click a Stock number to request it (or send your own) — it queues in the cart above.'
                  : 'Click a shop\u2019s code to see its Purchase/Sale/Stock/Last.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
