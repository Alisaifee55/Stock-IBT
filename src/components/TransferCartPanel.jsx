// =============================================================
// TransferCartPanel.jsx — v2.3 — 12-09-2026
// Changes from v2.1: moved out of a side column into a compact bar
// docked in the console's header area, so the grid gets the full
// width. Collapsed, it's one line: source shop + item count + Create
// IBT. Click the chevron (or the bar itself) to expand the line-item
// list with quantity steppers, same as before — it just lives below
// the bar now instead of beside the grid.
// =============================================================

import { useState } from 'react';
import { createTransfer } from '../lib/ibtQueries';

export default function TransferCartPanel({ modelNo, cart, dispatch, onCreated }) {
  const [linesOpen, setLinesOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [created, setCreated] = useState(null);

  const lines = cart.supplyingShopId ? [...cart.lines.values()] : [];
  const totalQty = lines.reduce((sum, l) => sum + Number(l.qty || 0), 0);
  const detailsOpen = linesOpen || !!cart.pendingSwitch || !!created;

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

  return (
    <div className={`transfer-cart-bar-wrap${detailsOpen ? ' is-open' : ''}`}>
      <div className="transfer-cart-bar">
        <button
          type="button"
          className="cartbar-toggle"
          onClick={() => setLinesOpen((o) => !o)}
          aria-expanded={detailsOpen}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="cartbar-icon">
            <path d="M4 6h16l-1.5 9h-13z" />
            <path d="M4 6l-1-3" />
            <circle cx="9" cy="19" r="1.4" />
            <circle cx="17" cy="19" r="1.4" />
          </svg>
          {cart.supplyingShopId ? (
            <span className="cartbar-label">
              From <strong>{cart.supplyingShopCode}</strong> &middot; {lines.length} line{lines.length === 1 ? '' : 's'} &middot;{' '}
              {totalQty} unit{totalQty === 1 ? '' : 's'}
            </span>
          ) : (
            <span className="cartbar-label cartbar-label-empty">Transfer cart — click a Stock number to add</span>
          )}
          <svg className={`cartbar-chevron${detailsOpen ? ' is-open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <button
          type="button"
          className="btn btn-primary cartbar-create"
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

      {detailsOpen && (
        <div className="transfer-cart-details">
          {created ? (
            <div className="transfer-created transfer-created-compact">
              <div className="transfer-created-code">{created.transfer.transfer_code}</div>
              <p>
                Sent to {created.shopCode} — {created.lineCount} line{created.lineCount === 1 ? '' : 's'} (
                {created.totalQty} pieces).
              </p>
              <p className="zero-stock-hint">Track it under Transfers &rarr; Sent.</p>
              <button
                type="button"
                className="btn btn-reset transfer-cart-again"
                onClick={() => {
                  setCreated(null);
                  setLinesOpen(false);
                }}
              >
                Start another request
              </button>
            </div>
          ) : (
            <>
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
                <div className="transfer-cart-empty">No transfers queued yet. Click a Stock number to start.</div>
              ) : (
                <>
                  <div className="transfer-cart-source">
                    Requesting from <strong>{cart.supplyingShopCode}</strong>
                    <span className="zero-stock-hint"> · {cart.supplyingShopCountry}</span>
                    <button type="button" className="cart-clear-link" onClick={() => dispatch({ type: 'clear' })}>
                      Clear
                    </button>
                  </div>

                  <div className="transfer-cart-lines transfer-cart-lines-row">
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
