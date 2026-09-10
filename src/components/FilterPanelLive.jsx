import { useMemo, useState } from 'react';
import { useFilterOptions } from '../lib/stockQueries';
import { FilterIcon, SearchIcon } from './icons';

function MultiCheck({ label, options, selected, onChange }) {
  const [search, setSearch] = useState('');
  const visible = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.trim().toLowerCase();
    return options.filter((opt) => opt.label.toLowerCase().includes(q));
  }, [options, search]);

  const toggle = (val) => {
    const next = new Set(selected);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    onChange(next);
  };

  const allVisibleSelected = visible.length > 0 && visible.every((o) => selected.has(o.value));
  const selectAllVisible = () => {
    const next = new Set(selected);
    if (allVisibleSelected) visible.forEach((o) => next.delete(o.value));
    else visible.forEach((o) => next.add(o.value));
    onChange(next);
  };

  return (
    <div className="filter-field">
      <div className="filter-field-head">
        <label>{label}</label>
        {options.length > 0 && (
          <button type="button" className="select-all-btn" onClick={selectAllVisible}>
            {allVisibleSelected ? 'Clear' : 'Select all'}
          </button>
        )}
      </div>
      <div className="filter-search">
        <SearchIcon />
        <input placeholder={`Search ${label.toLowerCase()}...`} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="multiselect">
        {visible.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)', padding: 6 }}>No matches</div>}
        {visible.map((o) => (
          <label key={o.value}>
            <input type="checkbox" checked={selected.has(o.value)} onChange={() => toggle(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}

export default function FilterPanelLive({ filters, setFilters, onClear, shopsById }) {
  const options = useFilterOptions(filters, shopsById);
  const [resetToken, setResetToken] = useState(0);

  const handleClear = () => {
    setResetToken((t) => t + 1);
    onClear();
  };

  return (
    <div className="filter-panel">
      <h3>
        <FilterIcon />
        Filters
      </h3>
      <div className="toggle-row">
        <label className="zero-stock-toggle">
          <input
            type="checkbox"
            checked={filters.showZeroStock}
            onChange={(e) => setFilters((f) => ({ ...f, showZeroStock: e.target.checked }))}
          />
          Show models with zero closing stock
          <span className="zero-stock-hint">(hidden by default)</span>
        </label>
        <label className="zero-stock-toggle">
          <input
            type="checkbox"
            checked={filters.includeNeverSold}
            onChange={(e) => setFilters((f) => ({ ...f, includeNeverSold: e.target.checked }))}
          />
          Include models that have never sold
          <span className="zero-stock-hint">(no sale date)</span>
        </label>
      </div>
      <div className="filter-grid">
        <MultiCheck
          key={`shop-${resetToken}`}
          label="Shop"
          options={options.shops.map((s) => ({ value: s.id, label: s.code }))}
          selected={filters.shopIds}
          onChange={(v) => setFilters((f) => ({ ...f, shopIds: v }))}
        />
        <MultiCheck
          key={`category-${resetToken}`}
          label="Category"
          options={options.categories.map((c) => ({ value: c, label: c }))}
          selected={filters.categories}
          onChange={(v) => setFilters((f) => ({ ...f, categories: v }))}
        />
        <MultiCheck
          key={`brand-${resetToken}`}
          label="Brand"
          options={options.brands.map((b) => ({ value: b, label: b }))}
          selected={filters.brands}
          onChange={(v) => setFilters((f) => ({ ...f, brands: v }))}
        />
        <div className="filter-field">
          <label>Days since last sale (range)</label>
          <div className="range-inputs">
            <input
              type="number"
              min="0"
              placeholder="Min"
              value={filters.daysSinceLastSaleMin}
              onChange={(e) => setFilters((f) => ({ ...f, daysSinceLastSaleMin: e.target.value }))}
            />
            <span>to</span>
            <input
              type="number"
              min="0"
              placeholder="Max"
              value={filters.daysSinceLastSaleMax}
              onChange={(e) => setFilters((f) => ({ ...f, daysSinceLastSaleMax: e.target.value }))}
            />
          </div>
        </div>
      </div>
      <button className="clear-filters-btn" onClick={handleClear}>
        Clear all filters
        <span className="shortcut-hint">Esc</span>
      </button>
    </div>
  );
}
