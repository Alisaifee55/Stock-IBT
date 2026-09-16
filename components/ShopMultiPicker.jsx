// =============================================================
// ShopMultiPicker.jsx — v1.0 — 15-09-2026
// New in v2.7. Multi-select sibling of ShopPickerPopover, for sending
// one message to several shops at once.
//
// Deliberately SEPARATE from ShopPickerPopover rather than adding a
// mode to it: that component is used by the transfer flows, where
// picking exactly one destination is a hard requirement, and bolting
// an optional multi-mode onto it would put the riskiest screen in the
// app (creating transfers) one bad prop away from a wrong behaviour.
//
// Head Office appears as a pseudo-shop keyed 'HO' — it is a real
// conversation participant without a shops row.
// =============================================================

import { useMemo, useState } from 'react';

const COUNTRY_CLASS = { UAE: 'is-uae', OMAN: 'is-oman', KUWAIT: 'is-kuwait' };

export default function ShopMultiPicker({
  title = 'Send a message to…',
  shops,
  excludeShopId,
  onConfirm,
  onClose,
  busy = false,
}) {
  const [picked, setPicked] = useState([]);
  const [query, setQuery] = useState('');

  const options = useMemo(
    () => shops.filter((s) => s.id !== excludeShopId),
    [shops, excludeShopId]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (s) =>
        String(s.code || '').toLowerCase().includes(q) ||
        String(s.name || '').toLowerCase().includes(q) ||
        String(s.country || '').toLowerCase().includes(q)
    );
  }, [options, query]);

  const toggle = (id) =>
    setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  // Select-all applies to what is currently visible, so it behaves
  // predictably while a search filter is active.
  const allVisiblePicked = visible.length > 0 && visible.every((s) => picked.includes(s.id));
  const toggleAll = () =>
    setPicked((list) =>
      allVisiblePicked
        ? list.filter((id) => !visible.some((s) => s.id === id))
        : Array.from(new Set([...list, ...visible.map((s) => s.id)]))
    );

  return (
    <div className="shop-picker-backdrop" onClick={busy ? undefined : onClose} role="presentation">
      <div
        className="shop-picker-card shop-multi-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shop-picker-head">
          <span>{title}</span>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Cancel"
            disabled={busy}
          >
            &times;
          </button>
        </div>

        <div className="shop-multi-tools">
          <input
            type="search"
            className="shop-multi-search"
            placeholder="Search shop or country…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search shops"
            disabled={busy}
          />
          <button
            type="button"
            className="btn btn-reset shop-multi-all"
            onClick={toggleAll}
            disabled={busy || visible.length === 0}
          >
            {allVisiblePicked ? 'Clear these' : `Select all${query.trim() ? ' shown' : ''}`}
          </button>
        </div>

        <div className="shop-picker-list shop-multi-list">
          {visible.map((s) => {
            const on = picked.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                className={`shop-picker-option shop-multi-option ${COUNTRY_CLASS[s.country] || ''}${
                  on ? ' is-picked' : ''
                }`}
                onClick={() => toggle(s.id)}
                disabled={busy}
                aria-pressed={on}
              >
                <span className={`shop-multi-box${on ? ' is-on' : ''}`} aria-hidden="true">
                  {on && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="shop-picker-code">{s.code}</span>
                <span className="shop-picker-country">{s.country || ''}</span>
              </button>
            );
          })}
          {visible.length === 0 && <div className="model-modal-empty">No shops match that search.</div>}
        </div>

        <div className="shop-multi-foot">
          <span className="zero-stock-hint">
            {picked.length === 0
              ? 'Nobody selected yet'
              : `${picked.length} selected`}
          </span>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onConfirm(picked)}
            disabled={busy || picked.length === 0}
          >
            {picked.length > 1 ? `Continue with ${picked.length}` : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
