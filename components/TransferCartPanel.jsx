// =============================================================
// TransferCartPanel.jsx — v2.7 — 15-09-2026
// Changes from v2.5: the collapsed state is now a COMPACT CARD rather
// than a full-width bar. It sits in the same place under the header,
// takes only the width it needs, and expands to the full panel on
// click — the same pattern as the collapsed country cards.
//
// Results are the one thing that still force it open: a transfer that
// just failed must not be hidden behind a collapsed card, since the
// failure text is the only place the reason appears.
//
// Unchanged from v2.5: this is the APP-LEVEL cart, mounted once in
// App.jsx, reading the shared cart from cartContext.jsx. It can hold
// lines from many shops AND many models at once, grouped by
// (requesting shop, supplying shop) — one IBT transfer is created per
// group on submit, however many models are inside it. A group's
// direction reads "Request from X" / "Send to X" from the viewer's
// own shop, or "Head Office: X -> Y" for an admin-built transfer
// between two shops that aren't the viewer's own.
// =============================================================

import { useState } from 'react';
import { useCart } from '../lib/cartContext';

function groupLabel(group) {
  if (group.direction === 'request') return `Request from ${group.supplyingShopCode}`;
  if (group.direction === 'send') return `Send to ${group.requestingShopCode}`;
  return `Head Office: ${group.supplyingShopCode} \u2192 ${group.requestingShopCode}`;
}

export default function TransferCartPanel() {
  const cart = useCart();
  const [detailsOpen, setDetailsOpen] = useState(false);

  const hasCart = cart.totalLines > 0;
  const hasResults = !!(cart.results && cart.results.length > 0);
  const open = detailsOpen || hasResults;

  if (!hasCart && !hasResults) return null;

  const failed = hasResults ? cart.results.filter((r) => !r.ok).length : 0;

  return (
    <div className={`transfer-cart-bar-wrap cartbar-compact${open ? ' is-open' : ''}`}>
      <div className="transfer-cart-bar">
        <button
          type="button"
          className="cartbar-toggle"
          onClick={() => setDetailsOpen((o) => !o)}
          aria-expanded={open}
          title={open ? 'Collapse the cart' : 'Expand the cart'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="cartbar-icon">
            <path d="M4 6h16l-1.5 9h-13z" />
            <path d="M4 6l-1-3" />
            <circle cx="9" cy="19" r="1.4" />
            <circle cx="17" cy="19" r="1.4" />
          </svg>
          <span className="cartbar-label">
            {hasCart ? (
              <>
                {cart.groups.length} transfer{cart.groups.length === 1 ? '' : 's'} &middot; {cart.totalQty} unit
                {cart.totalQty === 1 ? '' : 's'}
              </>
            ) : failed > 0 ? (
              `${failed} failed`
            ) : (
              'Cart cleared'
            )}
          </span>
          <svg className={`cartbar-chevron${open ? ' is-open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {hasCart && (
          <button type="button" className="btn btn-primary cartbar-create" onClick={cart.submit} disabled={cart.submitting}>
            {cart.submitting ? (
              <>
                <span className="refresh-spinner" aria-hidden="true" /> Sending…
              </>
            ) : (
              `Create IBT${cart.groups.length > 1 ? ` (${cart.groups.length})` : ''}`
            )}
          </button>
        )}
      </div>

      {open && (
        <div className="transfer-cart-details">
          {hasResults && (
            <div className="transfer-cart-results">
              {cart.results.map((r, i) => (
                <div key={i} className={`transfer-result-row${r.ok ? ' is-ok' : ' is-error'}`}>
                  {r.ok ? (
                    <>
                      <strong>{r.transfer.transfer_code}</strong> — {groupLabel(r.group)} ({r.group.lines.length}{' '}
                      line{r.group.lines.length === 1 ? '' : 's'})
                    </>
                  ) : (
                    <>
                      <strong>Failed</strong> — {groupLabel(r.group)}: {r.error}
                    </>
                  )}
                </div>
              ))}
              <button type="button" className="btn btn-reset transfer-cart-again" onClick={cart.dismissResults}>
                Dismiss
              </button>
            </div>
          )}

          {hasCart && (
            <div className="transfer-cart-groups">
              {cart.groups.map((g) => (
                <div className="cart-group" key={g.key}>
                  <div className="cart-group-head">
                    <span>{groupLabel(g)}</span>
                    <span className="zero-stock-hint">
                      {g.lines.length} line{g.lines.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="transfer-cart-lines transfer-cart-lines-row">
                    {g.lines.map((l) => (
                      <div className="cart-line" key={l.key}>
                        <div className="cart-line-info">
                          <div className="cart-line-cs">{l.modelNo}</div>
                          <div className="cart-line-avail">
                            {l.color || '—'} / {l.size || '—'} &middot; {l.available.toLocaleString()} available
                          </div>
                        </div>
                        <div className="cart-line-qty">
                          <button
                            type="button"
                            className="qty-step"
                            onClick={() => cart.setQty(l.key, Number(l.qty) - 1)}
                            aria-label={`Decrease quantity for ${l.modelNo}`}
                          >
                            &minus;
                          </button>
                          <input
                            type="number"
                            className="qty-input cart-qty-input"
                            min="0"
                            max={l.available}
                            value={l.qty}
                            onChange={(e) => cart.setQty(l.key, e.target.value)}
                            aria-label={`Quantity for ${l.modelNo}`}
                          />
                          <button
                            type="button"
                            className="qty-step"
                            onClick={() => cart.setQty(l.key, Number(l.qty) + 1)}
                            aria-label={`Increase quantity for ${l.modelNo}`}
                          >
                            +
                          </button>
                        </div>
                        <button
                          type="button"
                          className="cart-line-remove"
                          onClick={() => cart.removeLine(l.key)}
                          aria-label={`Remove ${l.modelNo} from the cart`}
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <button type="button" className="cart-clear-link cart-clear-all" onClick={cart.clear}>
                Clear entire cart
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
