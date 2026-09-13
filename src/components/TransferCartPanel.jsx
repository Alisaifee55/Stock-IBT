// =============================================================
// TransferCartPanel.jsx — v2.1 — 12-09-2026
// New in v2.1: replaces CreateTransferModal.jsx (now unused — delete
// it from the repo) as the way an IBT request gets built. Instead of
// a separate modal per shop, this is a persistent side panel inside
// the Stock Transfer Console: pick cells from the grid or the by-shop
// view, adjust quantities here, submit once.
//
// A transfer is always ONE requesting shop -> ONE supplying shop
// (enforced server-side by create_ibt_transfer / the different_shops
// constraint), so the cart can only ever hold lines from a single
// supplying shop at a time. Picking a cell from a different shop
// while the cart isn't empty asks first, rather than silently
// swapping or silently merging two shops into one request.
// =============================================================

import { useState } from 'react';
import { createTransfer } from '../lib/ibtQueries';

export default function TransferCartPanel({ modelNo, cart, dispatch, onCreated }) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [created, setCreated] = useState(null);

  const lines = cart.supplyingShopId ? [...cart.lines.values()] : [];
  const totalQty = lines.reduce((sum, l) => sum + Number(l.qty || 0), 0);

  const handleSubmit = async () => {
    if (lines.length === 0 || submitting) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const payload = lines.map((l) => ({
        model_no: modelNo,
        color: l.color || null,
        size: l.size || null,
        qty_requested: Number(l.qty),
      }));
      const transfer = await createTransfer(cart.supplyingShopId, payload);
      setCreated({ transfer, shopCode: cart.supplyingShopCode, lineCount: lines.length, totalQty });
      dispatch({ type: 'clear' });
      onCreated?.();
    } catch (err) {
      setSubmitError(err.message || 'Could not create the transfer.');
    } finally {
      setSubmitting(false);
    }
  };

  if (created) {
    return (
      <div className="transfer-cart-panel">
        <h4 className="transfer-cart-title">Transfer cart</h4>
        <div className="transfer-created transfer-created-compact">
          <div className="transfer-created-code">{created.transfer.transfer_code}</div>
          <p>
            Sent to {created.shopCode} — {created.lineCount} line{created.lineCount === 1 ? '' : 's'} (
            {created.totalQty} pieces).
          </p>
          <p className="zero-stock-hint">Track it under Transfers &rarr; Sent.</p>
          <button type="button" className="btn btn-reset transfer-cart-again" onClick={() => setCreated(null)}>
            Start another request
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="transfer-cart-panel">
      <h4 className="transfer-cart-title">Transfer cart</h4>

      {cart.pendingSwitch && (
        <div className="cart-switch-confirm">
          <div>
            Start a new request from <strong>{cart.pendingSwitch.shopCode}</strong> instead of{' '}
            <strong>{cart.supplyingShopCode}</strong>? This clears {lines.length} queued line
            {lines.length === 1 ? '' : 's'} — one transfer can only come from one shop.
          </div>
          <div className="cart-switch-actions">
            <button type="button" className="btn btn-reset" onClick={() => dispatch({ type: 'cancelSwitch' })}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'confirmSwitch' })}>
              Switch shop
            </button>
          </div>
        </div>
      )}

      {!cart.supplyingShopId ? (
        <div className="transfer-cart-empty">
          No transfers queued yet. Click a Balance cell to start.
        </div>
      ) : (
        <>
          <div className="transfer-cart-source">
            Requesting from <strong>{cart.supplyingShopCode}</strong>
            <span className="zero-stock-hint"> · {cart.supplyingShopCountry}</span>
            <button
              type="button"
              className="cart-clear-link"
              onClick={() => dispatch({ type: 'clear' })}
              title="Clear the cart"
            >
              Clear
            </button>
          </div>

          <div className="transfer-cart-lines">
            {lines.map((l) => {
              const key = `${l.color || ''}|${l.size || ''}`;
              return (
                <div className="cart-line" key={key}>
                  <div className="cart-line-info">
                    <div className="cart-line-cs">
                      {l.color || '—'} / {l.size || '—'}
                    </div>
                    <div className="cart-line-avail">{l.available.toLocaleString()} available</div>
                  </div>
                  <div className="cart-line-qty">
                    <button
                      type="button"
                      className="qty-step"
                      onClick={() => dispatch({ type: 'setQty', key, qty: Number(l.qty) - 1 })}
                      aria-label={`Decrease quantity for ${l.color || 'no colour'} ${l.size || 'no size'}`}
                    >
                      &minus;
                    </button>
                    <input
                      type="number"
                      className="qty-input cart-qty-input"
                      min="0"
                      max={l.available}
                      value={l.qty}
                      onChange={(e) => dispatch({ type: 'setQty', key, qty: e.target.value })}
                      aria-label={`Quantity for ${l.color || 'no colour'} ${l.size || 'no size'}`}
                    />
                    <button
                      type="button"
                      className="qty-step"
                      onClick={() => dispatch({ type: 'setQty', key, qty: Number(l.qty) + 1 })}
                      aria-label={`Increase quantity for ${l.color || 'no colour'} ${l.size || 'no size'}`}
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    className="cart-line-remove"
                    onClick={() => dispatch({ type: 'removeLine', key })}
                    aria-label={`Remove ${l.color || 'no colour'} ${l.size || 'no size'} from the cart`}
                  >
                    &times;
                  </button>
                </div>
              );
            })}
          </div>

          {submitError && <div className="error-box small">{submitError}</div>}
        </>
      )}

      <div className="transfer-cart-footer">
        <span className="transfer-cart-count">{totalQty} unit{totalQty === 1 ? '' : 's'} queued</span>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={lines.length === 0 || submitting}
        >
          {submitting ? (
            <>
              <span className="refresh-spinner" aria-hidden="true" /> Sending…
            </>
          ) : (
            'Create IBT'
          )}
        </button>
      </div>
    </div>
  );
}
