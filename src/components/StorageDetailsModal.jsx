// =============================================================
// StorageDetailsModal.jsx — v2.1 — 12-09-2026
// New in v2.1: thin modal chrome around the existing StorageOverview
// panel (per-country sizes, "Delete old data"), reached by clicking
// the compact Storage summary card in the top row. Follows the
// standing modal rules: closes via X, Escape, or backdrop click;
// scroll-locked while open.
// =============================================================

import { useEffect, useRef } from 'react';
import StorageOverview from './StorageOverview';

export default function StorageDetailsModal({ refreshToken, onChanged, onClose }) {
  const closeBtnRef = useRef(null);

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

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-card modal-card-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="storage-details-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h4 id="storage-details-title">Storage usage (admin only)</h4>
          <button
            ref={closeBtnRef}
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <div className="modal-body modal-body-wide">
          <StorageOverview refreshToken={refreshToken} onChanged={onChanged} embedded />
        </div>
      </div>
    </div>
  );
}
