// =============================================================
// ShopPickerPopover.jsx — v2.5 — 13-09-2026
// New in v2.5. Opens when a click needs a second shop chosen: a shop
// account sending its OWN stock elsewhere (destination not implied),
// or a Head Office (admin) account building a transfer between two
// shops it isn't itself. Lists every shop except the one already
// fixed, grouped loosely by country colour to match the grid.
// =============================================================

const COUNTRY_CLASS = { UAE: 'is-uae', OMAN: 'is-oman', KUWAIT: 'is-kuwait' };

export default function ShopPickerPopover({ title, shops, excludeShopId, onPick, onClose }) {
  const options = shops.filter((s) => s.id !== excludeShopId);

  return (
    <div className="shop-picker-backdrop" onClick={onClose} role="presentation">
      <div className="shop-picker-card" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="shop-picker-head">
          <span>{title}</span>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cancel">
            &times;
          </button>
        </div>
        <div className="shop-picker-list">
          {options.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`shop-picker-option ${COUNTRY_CLASS[s.country] || ''}`}
              onClick={() => onPick(s)}
            >
              <span className="shop-picker-code">{s.code}</span>
              <span className="shop-picker-country">{s.country}</span>
            </button>
          ))}
          {options.length === 0 && <div className="model-modal-empty">No other shops found.</div>}
        </div>
      </div>
    </div>
  );
}
