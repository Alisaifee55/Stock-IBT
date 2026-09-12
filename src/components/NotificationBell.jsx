// =============================================================
// NotificationBell.jsx — v2.0 — 12-09-2026
// Header bell with unread count. Realtime INSERT subscription for
// instant delivery, plus a 60s poll as the safety net for a dropped
// socket. Clicking a transfer notification jumps straight to it.
// =============================================================

import { useEffect, useRef, useState } from 'react';
import { useNotifications } from '../lib/ibtQueries';
import { formatStamp } from '../lib/summaryRefresh';

function relativeTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return '';
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return formatStamp(iso);
}

export default function NotificationBell({ userId, onOpenTransfer }) {
  const { items, unread, loading, markRead } = useNotifications(userId);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const handleClick = (n) => {
    if (!n.is_read) markRead([n.id]);
    if (n.transfer_id) {
      onOpenTransfer?.(n.transfer_id);
      setOpen(false);
    }
  };

  return (
    <div className="bell-wrap" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className={`bell-btn${unread > 0 ? ' has-unread' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24">
          <path d="M18 8a6 6 0 00-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 01-3.4 0" />
        </svg>
        {unread > 0 && <span className="bell-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <div className="bell-panel-head">
            <span>Notifications</span>
            {unread > 0 && (
              <button type="button" className="bell-mark-all" onClick={() => markRead()}>
                Mark all read
              </button>
            )}
          </div>
          <div className="bell-list">
            {loading && <div className="bell-empty">Loading…</div>}
            {!loading && items.length === 0 && (
              <div className="bell-empty">Nothing yet. Transfer activity shows up here.</div>
            )}
            {items.map((n) => (
              <button
                type="button"
                key={n.id}
                className={`bell-item${n.is_read ? '' : ' is-unread'}${n.transfer_id ? ' is-clickable' : ''}`}
                onClick={() => handleClick(n)}
              >
                <span className="bell-item-msg">{n.message}</span>
                <span className="bell-item-time">{relativeTime(n.created_at)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
