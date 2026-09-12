// =============================================================
// ModelDetailModal.jsx — v2.0 — 12-09-2026
// Click a Model No in the report to open this: the model's photo
// alongside its Color/Size breakdown for that shop, plus which other
// shops are holding it (the question that leads into an IBT request).
//
// The inline caret expand is unchanged — this is the richer view.
// Each "also in stock at" shop is a Request button, so an IBT always
// starts from a shop you can see is actually holding stock.
// =============================================================

import { useEffect, useRef, useState } from 'react';
import { useStockDetail, useModelAcrossShops, formatIsoDate } from '../lib/stockQueries';
import CreateTransferModal from './CreateTransferModal';

// Central POS image host. One place to change if the path ever moves.
const IMAGE_BASE = 'https://pos.saraplaza.net/modelimages';
export const modelImageUrl = (modelNo) => `${IMAGE_BASE}/${encodeURIComponent(modelNo)}.jpg`;

function ModelPhoto({ modelNo }) {
  const [state, setState] = useState('loading'); // loading | loaded | missing

  // Reset when the modal is reused for a different model.
  useEffect(() => {
    setState('loading');
  }, [modelNo]);

  return (
    <div className="model-photo-frame">
      {state === 'loading' && (
        <div className="model-photo-placeholder">
          <span className="refresh-spinner" aria-hidden="true" />
          <span>Loading photo…</span>
        </div>
      )}
      {state === 'missing' && (
        <div className="model-photo-placeholder">
          <span className="model-photo-missing-mark" aria-hidden="true">
            &#9633;
          </span>
          <span>No image available</span>
          <span className="model-photo-missing-code">{modelNo}</span>
        </div>
      )}
      <img
        src={modelImageUrl(modelNo)}
        alt={`Model ${modelNo}`}
        className={`model-photo-img${state === 'loaded' ? ' is-visible' : ''}`}
        loading="lazy"
        onLoad={() => setState('loaded')}
        onError={() => setState('missing')}
      />
    </div>
  );
}

export default function ModelDetailModal({ model, onClose, canRequest = false, onTransferCreated }) {
  const { modelNo, shopId, shopCode, shopCountry, category, salesPrice, lastSalesDate } = model;
  const { detail, loading, error } = useStockDetail(modelNo, shopId, true);
  const { shops: otherShops, loading: shopsLoading } = useModelAcrossShops(modelNo, shopId);
  const [requestShop, setRequestShop] = useState(null);
  const closeBtnRef = useRef(null);

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

  const totals = (detail || []).reduce(
    (acc, d) => ({
      stock: acc.stock + Number(d.closing_stock || 0),
      sales: acc.sales + Number(d.total_sales || 0),
      purchase: acc.purchase + Number(d.total_purchase || 0),
    }),
    { stock: 0, sales: 0, purchase: 0 }
  );

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-card model-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="model-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h4 id="model-modal-title">{modelNo}</h4>
            <div className="model-modal-sub">
              {[category, `${shopCode} · ${shopCountry}`].filter(Boolean).join('  —  ')}
            </div>
          </div>
          <button ref={closeBtnRef} type="button" className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="model-modal-body">
          <div className="model-modal-photo">
            <ModelPhoto modelNo={modelNo} />
          </div>

          <div className="model-modal-info">
            <div className="model-modal-facts">
              <div className="model-fact">
                <span className="model-fact-label">Sales price</span>
                <span className="model-fact-value">{salesPrice ?? '—'}</span>
              </div>
              <div className="model-fact">
                <span className="model-fact-label">Last sale</span>
                <span className="model-fact-value">{formatIsoDate(lastSalesDate) || '—'}</span>
              </div>
              <div className="model-fact">
                <span className="model-fact-label">In stock here</span>
                <span className="model-fact-value">{totals.stock.toLocaleString()}</span>
              </div>
            </div>

            <div className="model-modal-section">
              <div className="model-modal-section-title">Color / Size breakdown — {shopCode}</div>
              {loading && (
                <div className="model-modal-loading">
                  <span className="refresh-spinner" aria-hidden="true" />
                  Loading breakdown…
                </div>
              )}
              {error && <div className="error-box small">Couldn't load the breakdown: {error}</div>}
              {!loading && !error && (!detail || detail.length === 0) && (
                <div className="model-modal-empty">No Color/Size breakdown found.</div>
              )}
              {!loading && !error && detail && detail.length > 0 && (
                <div className="model-modal-table-wrap">
                  <table className="model-modal-table">
                    <thead>
                      <tr>
                        <th>Color</th>
                        <th>Size</th>
                        <th>Stock</th>
                        <th>Sales</th>
                        <th>Purch.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.map((d, i) => (
                        <tr key={`${d.color || ''}|${d.size || ''}|${i}`}>
                          <td>{d.color || '—'}</td>
                          <td>{d.size || '—'}</td>
                          <td className={Number(d.closing_stock) > 0 ? 'has-stock' : ''}>{d.closing_stock}</td>
                          <td>{d.total_sales}</td>
                          <td>{d.total_purchase}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={2}>Total</td>
                        <td>{totals.stock.toLocaleString()}</td>
                        <td>{totals.sales.toLocaleString()}</td>
                        <td>{totals.purchase.toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            <div className="model-modal-section">
              <div className="model-modal-section-title">Also in stock at</div>
              {shopsLoading && <div className="model-modal-loading">Checking other shops…</div>}
              {!shopsLoading && otherShops.length === 0 && (
                <div className="model-modal-empty">No other shop is holding this model.</div>
              )}
              {!shopsLoading && otherShops.length > 0 && (
                <div className="other-shops">
                  {otherShops.map((s) =>
                    canRequest ? (
                      <button
                        type="button"
                        className="other-shop-pill is-actionable"
                        key={s.shop_id}
                        onClick={() => setRequestShop(s)}
                        title={`Request ${modelNo} from ${s.shop_code}`}
                      >
                        <strong>{s.shop_code}</strong>
                        <span className="other-shop-country">{s.shop_country}</span>
                        <span className="other-shop-qty">{Number(s.closing_stock).toLocaleString()}</span>
                        <span className="other-shop-request">Request</span>
                      </button>
                    ) : (
                      <span className="other-shop-pill" key={s.shop_id}>
                        <strong>{s.shop_code}</strong>
                        <span className="other-shop-country">{s.shop_country}</span>
                        <span className="other-shop-qty">{Number(s.closing_stock).toLocaleString()}</span>
                      </span>
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-reset" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      {requestShop && (
        <CreateTransferModal
          modelNo={modelNo}
          shop={requestShop}
          onClose={() => setRequestShop(null)}
          onCreated={onTransferCreated}
        />
      )}
    </div>
  );
}
