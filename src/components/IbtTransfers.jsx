// =============================================================
// IbtTransfers.jsx — v2.0 — 12-09-2026
// The Transfers tab: two lists, Received (we supply) and Sent (we
// requested). Click any row for the line-by-line detail where the
// supplying shop accepts or rejects each line.
// =============================================================

import { useEffect, useState } from 'react';
import { useMyTransfers, TRANSFER_STATUS_LABELS, TRANSFER_STATUS_TONE } from '../lib/ibtQueries';
import { formatStamp } from '../lib/summaryRefresh';
import TransferDetailModal from './TransferDetailModal';

function TransferList({ direction, refreshToken, onOpen }) {
  const { transfers, loading, error } = useMyTransfers(direction, refreshToken);

  if (loading) {
    return (
      <div className="model-modal-loading ibt-loading">
        <span className="refresh-spinner" aria-hidden="true" />
        Loading transfers…
      </div>
    );
  }
  if (error) return <div className="error-box small">{error}</div>;
  if (transfers.length === 0) {
    return (
      <div className="table-empty">
        <div className="table-empty-title">
          {direction === 'incoming' ? 'No transfer requests received' : 'No transfers sent yet'}
        </div>
        <div className="table-empty-hint">
          {direction === 'incoming'
            ? 'When another shop requests stock from you, it appears here.'
            : 'Find a model in the report, open it, then request it from a shop that has stock.'}
        </div>
      </div>
    );
  }

  return (
    <div className="table-scroll">
      <table className="ibt-table">
        <thead>
          <tr>
            <th>Transfer</th>
            <th>{direction === 'incoming' ? 'Requested by' : 'Requested from'}</th>
            <th>Lines</th>
            <th>Pieces</th>
            <th>Status</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {transfers.map((t) => (
            <tr key={t.id} className="expandable-row" onClick={() => onOpen(t.id)}>
              <td className="ibt-code">{t.transfer_code}</td>
              <td>
                <strong>{t.other_shop_code}</strong>{' '}
                <span className="other-shop-country">{t.other_shop_country}</span>
              </td>
              <td>
                {t.line_count}
                {t.pending_count > 0 && <span className="ibt-pending-dot" title={`${t.pending_count} pending`} />}
              </td>
              <td>{Number(t.total_qty || 0).toLocaleString()}</td>
              <td>
                <span className={`pill pill-${TRANSFER_STATUS_TONE[t.status] || 'warning'}`}>
                  {TRANSFER_STATUS_LABELS[t.status] || t.status}
                </span>
              </td>
              <td>{formatStamp(t.updated_at || t.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function IbtTransfers({ incomingPending, onChanged, openTransferId, onOpenHandled }) {
  const [tab, setTab] = useState('incoming');
  const [refreshToken, setRefreshToken] = useState(0);
  const [openId, setOpenId] = useState(null);

  // A notification click lands here with a transfer to open.
  useEffect(() => {
    if (openTransferId) {
      setOpenId(openTransferId);
      onOpenHandled?.();
    }
  }, [openTransferId, onOpenHandled]);

  const bumpAll = () => {
    setRefreshToken((t) => t + 1);
    onChanged?.();
  };

  return (
    <div className="panel">
      <h3>
        Transfers
        <div className="ibt-tabs">
          <button
            type="button"
            className={`ibt-tab${tab === 'incoming' ? ' is-active' : ''}`}
            onClick={() => setTab('incoming')}
          >
            Received
            {incomingPending > 0 && <span className="ibt-tab-badge">{incomingPending}</span>}
          </button>
          <button
            type="button"
            className={`ibt-tab${tab === 'outgoing' ? ' is-active' : ''}`}
            onClick={() => setTab('outgoing')}
          >
            Sent
          </button>
        </div>
        <button type="button" className="refresh-pill-btn" onClick={bumpAll} title="Reload transfers" aria-label="Reload transfers">
          <svg viewBox="0 0 24 24">
            <path d="M4 4v6h6M20 20v-6h-6M4 10a8 8 0 0114-4.9M20 14a8 8 0 01-14 4.9" />
          </svg>
        </button>
      </h3>

      <TransferList key={tab} direction={tab} refreshToken={refreshToken} onOpen={setOpenId} />

      {openId && (
        <TransferDetailModal transferId={openId} onClose={() => setOpenId(null)} onChanged={bumpAll} />
      )}
    </div>
  );
}
