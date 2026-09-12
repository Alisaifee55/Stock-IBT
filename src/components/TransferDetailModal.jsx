// =============================================================
// TransferDetailModal.jsx — v2.0 — 12-09-2026
// One transfer in full: every colour/size line with its quantity and
// status. The supplying shop gets Accept / Reject per line; the
// requesting shop sees the same list read-only.
// Each line is decided independently, and the transfer's own status
// rolls up from them server-side.
// The requesting shop can withdraw a transfer, but only while no line
// has been decided — a decided line is a commitment on both sides.
// =============================================================

import { useEffect, useRef, useState } from 'react';
import {
  useTransferDetail,
  decideLineItem,
  cancelTransfer,
  TRANSFER_STATUS_LABELS,
  TRANSFER_STATUS_TONE,
} from '../lib/ibtQueries';
import { formatStamp } from '../lib/summaryRefresh';

const LINE_TONE = { pending: 'warning', accepted: 'success', rejected: 'error' };

export default function TransferDetailModal({ transferId, onClose, onChanged }) {
  const [refreshToken, setRefreshToken] = useState(0);
  const { detail, loading, error } = useTransferDetail(transferId, refreshToken);
  const [busyLine, setBusyLine] = useState('');
  const [actionError, setActionError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
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

  const handleDecide = async (lineId, decision) => {
    setBusyLine(lineId);
    setActionError('');
    try {
      await decideLineItem(lineId, decision);
      setRefreshToken((t) => t + 1);
      onChanged?.();
    } catch (err) {
      setActionError(err.message || 'Could not save that decision.');
    } finally {
      setBusyLine('');
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    setActionError('');
    try {
      await cancelTransfer(transferId);
      setConfirmCancel(false);
      setRefreshToken((n) => n + 1);
      onChanged?.();
    } catch (err) {
      setActionError(err.message || 'Could not cancel this transfer.');
      setConfirmCancel(false);
    } finally {
      setCancelling(false);
    }
  };

  const canDecide = detail?.can_decide;
  const lines = detail?.lines || [];
  const canCancel = detail?.can_cancel;

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-card transfer-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transfer-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h4 id="transfer-modal-title">{detail?.transfer_code || 'Transfer'}</h4>
            {detail && (
              <div className="model-modal-sub">
                {detail.direction === 'incoming'
                  ? `Requested by ${detail.other_shop_code} (${detail.other_shop_country})`
                  : `Requested from ${detail.other_shop_code} (${detail.other_shop_country})`}
                {detail.created_at ? ` · ${formatStamp(detail.created_at)}` : ''}
              </div>
            )}
          </div>
          <button ref={closeBtnRef} type="button" className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="modal-body">
          {loading && (
            <div className="model-modal-loading">
              <span className="refresh-spinner" aria-hidden="true" />
              Loading transfer…
            </div>
          )}
          {error && <div className="error-box small">{error}</div>}

          {detail && (
            <>
              <div className="transfer-status-row">
                <span className={`pill pill-${TRANSFER_STATUS_TONE[detail.status] || 'warning'}`}>
                  {TRANSFER_STATUS_LABELS[detail.status] || detail.status}
                </span>
                <span className="transfer-status-counts">
                  {lines.length} line{lines.length === 1 ? '' : 's'} · {detail.accepted_count} accepted ·{' '}
                  {detail.rejected_count} rejected · {detail.pending_count} pending
                </span>
              </div>

              {canDecide && detail.pending_count > 0 && (
                <div className="transfer-hint">
                  You're the supplying shop — accept or reject each line. Decisions are final.
                </div>
              )}

              {actionError && <div className="error-box small">{actionError}</div>}

              <div className="model-modal-table-wrap">
                <table className="model-modal-table transfer-lines">
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th>Color</th>
                      <th>Size</th>
                      <th>Qty</th>
                      <th>Status</th>
                      {canDecide && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.id}>
                        <td className="transfer-line-model">{l.model_no}</td>
                        <td>{l.color || '—'}</td>
                        <td>{l.size || '—'}</td>
                        <td>{l.qty_requested}</td>
                        <td>
                          <span className={`pill pill-${LINE_TONE[l.status] || 'warning'}`}>{l.status}</span>
                        </td>
                        {canDecide && (
                          <td className="transfer-line-actions">
                            {l.status === 'pending' ? (
                              busyLine === l.id ? (
                                <span className="storage-working">
                                  <span className="refresh-spinner" aria-hidden="true" />
                                  Saving…
                                </span>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="btn btn-accept"
                                    onClick={() => handleDecide(l.id, 'accepted')}
                                    disabled={!!busyLine}
                                  >
                                    Accept
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-danger"
                                    onClick={() => handleDecide(l.id, 'rejected')}
                                    disabled={!!busyLine}
                                  >
                                    Reject
                                  </button>
                                </>
                              )
                            ) : (
                              <span className="transfer-decided">
                                {l.decided_at ? formatStamp(l.decided_at) : 'Decided'}
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="modal-actions">
          {canCancel && !confirmCancel && (
            <button
              type="button"
              className="btn btn-danger transfer-cancel-btn"
              onClick={() => setConfirmCancel(true)}
              disabled={cancelling}
            >
              Withdraw request
            </button>
          )}
          {canCancel && confirmCancel && (
            <div className="transfer-cancel-confirm">
              <span>Withdraw {detail.transfer_code}? This can't be undone.</span>
              <button type="button" className="btn btn-reset" onClick={() => setConfirmCancel(false)}>
                Keep it
              </button>
              <button type="button" className="btn btn-danger" onClick={handleCancel} disabled={cancelling}>
                {cancelling ? 'Withdrawing…' : 'Yes, withdraw'}
              </button>
            </div>
          )}
          <button type="button" className="btn btn-reset" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
