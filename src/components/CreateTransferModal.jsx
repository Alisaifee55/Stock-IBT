// =============================================================
// CreateTransferModal.jsx — v2.0 — 12-09-2026
// Opened from the model detail modal's "Also in stock at" pills, so
// you're always requesting from a shop you can see holds stock.
// Pick colour/size rows, set quantities, submit as one transfer.
// Quantities are capped at what the supplying shop actually has.
// =============================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTransferCandidates, createTransfer } from '../lib/ibtQueries';

export default function CreateTransferModal({ modelNo, shop, onClose, onCreated }) {
  const { rows, loading, error } = useTransferCandidates(modelNo, shop.shop_id);
  const [qty, setQty] = useState({}); // key -> requested number
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [created, setCreated] = useState(null);
  const closeBtnRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeBtnRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const keyOf = (r) => `${r.color || ''}|${r.size || ''}`;

  const selected = useMemo(
    () => rows.filter((r) => Number(qty[keyOf(r)]) > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, qty]
  );
  const totalQty = selected.reduce((sum, r) => sum + Number(qty[keyOf(r)] || 0), 0);

  const setRowQty = (r, raw) => {
    const max = Number(r.closing_stock);
    let n = raw === '' ? '' : Math.floor(Number(raw));
    if (n !== '' && (!Number.isFinite(n) || n < 0)) n = 0;
    if (n !== '' && n > max) n = max; // can't request more than they hold
    setQty((q) => ({ ...q, [keyOf(r)]: n }));
  };

  const handleSubmit = async () => {
    if (selected.length === 0 || submitting) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const payload = selected.map((r) => ({
        model_no: modelNo,
        color: r.color || null,
        size: r.size || null,
        qty_requested: Number(qty[keyOf(r)]),
      }));
      const transfer = await createTransfer(shop.shop_id, payload);
      setCreated(transfer);
      onCreated?.();
    } catch (err) {
      setSubmitError(err.message || 'Could not create the transfer.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-card transfer-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-transfer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h4 id="create-transfer-title">
              {created ? 'Transfer requested' : `Request ${modelNo} from ${shop.shop_code}`}
            </h4>
            <div className="model-modal-sub">
              {shop.shop_code} · {shop.shop_country} · {Number(shop.closing_stock).toLocaleString()} in stock
            </div>
          </div>
          <button ref={closeBtnRef} type="button" className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="modal-body">
          {created ? (
            <div className="transfer-created">
              <div className="transfer-created-code">{created.transfer_code}</div>
              <p>
                Sent to {shop.shop_code} with {selected.length} line{selected.length === 1 ? '' : 's'} ({totalQty}{' '}
                pieces). They'll see it in their Transfers tab and can accept or reject each line.
              </p>
              <p className="zero-stock-hint">Track it under Transfers &rarr; Sent.</p>
            </div>
          ) : (
            <>
              {loading && (
                <div className="model-modal-loading">
                  <span className="refresh-spinner" aria-hidden="true" />
                  Loading available colours and sizes…
                </div>
              )}
              {error && <div className="error-box small">{error}</div>}
              {!loading && !error && rows.length === 0 && (
                <div className="model-modal-empty">
                  {shop.shop_code} has no colour/size rows in stock for this model any more. Refresh the report.
                </div>
              )}
              {!loading && rows.length > 0 && (
                <>
                  <div className="transfer-hint">Enter how many of each you want. Blank or 0 lines are skipped.</div>
                  <div className="model-modal-table-wrap">
                    <table className="model-modal-table">
                      <thead>
                        <tr>
                          <th>Color</th>
                          <th>Size</th>
                          <th>They have</th>
                          <th>Request</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={keyOf(r)}>
                            <td>{r.color || '—'}</td>
                            <td>{r.size || '—'}</td>
                            <td className="has-stock">{r.closing_stock}</td>
                            <td>
                              <input
                                type="number"
                                className="qty-input"
                                min="0"
                                max={r.closing_stock}
                                value={qty[keyOf(r)] ?? ''}
                                placeholder="0"
                                onChange={(e) => setRowQty(r, e.target.value)}
                                aria-label={`Quantity for ${r.color || 'no colour'} ${r.size || 'no size'}`}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {submitError && <div className="error-box small">{submitError}</div>}
                </>
              )}
            </>
          )}
        </div>

        <div className="modal-actions">
          {created ? (
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Done
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-reset" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={selected.length === 0 || submitting}
              >
                {submitting ? (
                  <>
                    <span className="refresh-spinner" aria-hidden="true" /> Sending…
                  </>
                ) : (
                  `Request ${totalQty || ''} ${totalQty ? 'pieces' : ''}`.trim() || 'Request'
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
