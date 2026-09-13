// =============================================================
// ReportLive.jsx — v2.3 — 12-09-2026
// Changes from v2.0:
//  - Removed the inline per-row "expand to see Color/Size breakdown"
//    feature (the caret column + DetailRows) — it duplicated what
//    the Model No modal already shows, now in more detail (the IBT
//    Stock Transfer Console's grid). One way to see a model's
//    breakdown, not two.
//  - The WHOLE row opens that console now, not just the Model No
//    text — click anywhere in a row.
//  - When a model search jumps the table to one model, the table
//    scrolls into view automatically so the result isn't left
//    off-screen below the fold.
// Carried over from v2.0:
//  - Breakdown query failures no longer render as "no breakdown found".
//  - Empty state instead of a blank table.
//  - Last Sale renders as DD-MM-YYYY, not raw ISO.
//  - CSV export of every row matching the current filters (not just
//    the pages scrolled into view), with a live row counter.
// =============================================================

import { useEffect, useRef, useState } from 'react';
import {
  useStockSummary,
  formatIsoDate,
  fetchAllSummaryRows,
  EXPORT_MAX_ROWS,
} from '../lib/stockQueries';
import { buildCsv, downloadCsv, timestampedFilename } from '../lib/exportCsv';
import { SortIcon, DownloadIcon } from './icons';
import ModelDetailModal from './ModelDetailModal';

const COLS = [
  { key: 'model_no', label: 'Model No', sortable: false },
  { key: 'category', label: 'Category', sortable: true, shrink: true },
  { key: 'shop_code', label: 'Shop', sortable: false },
  { key: 'shop_country', label: 'Country', sortable: false },
  { key: 'sales_price', label: 'SP', sortable: true },
  { key: 'closing_stock', label: 'Closing Stock', sortable: true },
  { key: 'total_sales', label: 'Total Sales', sortable: true },
  { key: 'total_purchase', label: 'Total Purchase', sortable: true },
  { key: 'last_sales_date', label: 'Last Sale', sortable: true },
  { key: 'days_since_last_sale', label: 'Sale Days', sortable: true },
  { key: 'days_old', label: 'Days Old', sortable: true },
  { key: 'sales_velocity', label: 'Velocity (units/day)', sortable: true },
];

// Export carries the same columns the user sees, in the same order,
// with dates already formatted as DD-MM-YYYY.
const EXPORT_COLS = [
  { key: 'model_no', label: 'Model No' },
  { key: 'category', label: 'Category' },
  { key: 'shop_code', label: 'Shop' },
  { key: 'shop_country', label: 'Country' },
  { key: 'sales_price', label: 'Sales Price' },
  { key: 'closing_stock', label: 'Closing Stock' },
  { key: 'total_sales', label: 'Total Sales' },
  { key: 'total_purchase', label: 'Total Purchase' },
  { key: 'last_sales_date', label: 'Last Sale', format: (v) => formatIsoDate(v) },
  { key: 'days_since_last_sale', label: 'Sale Days' },
  { key: 'days_old', label: 'Days Old' },
  { key: 'sales_velocity', label: 'Velocity (units/day)' },
];

export default function ReportLive({ filters, modelJump, canRequest = false, onTransferCreated, myShopId = null, myCountry = null }) {
  const [sort, setSort] = useState({ key: 'sales_velocity', dir: 'desc' });
  const [openModel, setOpenModel] = useState(null);
  const [exportState, setExportState] = useState('idle'); // idle | working | error
  const [exportCount, setExportCount] = useState(0);
  const [exportError, setExportError] = useState('');
  const [exportNote, setExportNote] = useState('');
  const unmountedRef = useRef(false);
  const panelRef = useRef(null);

  useEffect(
    () => () => {
      unmountedRef.current = true;
    },
    []
  );

  const handleExport = async () => {
    if (exportState === 'working') return;
    setExportState('working');
    setExportCount(0);
    setExportError('');
    setExportNote('');
    try {
      const { rows: allRows, truncated, cancelled } = await fetchAllSummaryRows(filters, sort, modelJump, {
        onProgress: setExportCount,
        isCancelled: () => unmountedRef.current,
      });
      if (cancelled) return;
      if (allRows.length === 0) {
        setExportError('Nothing to export with the current filters.');
        setExportState('error');
        return;
      }
      downloadCsv(buildCsv(allRows, EXPORT_COLS), timestampedFilename('sara-stock-report'));
      if (truncated) {
        setExportNote(`Capped at ${EXPORT_MAX_ROWS.toLocaleString()} rows — narrow the filters for the rest.`);
      }
      setExportState('idle');
    } catch (err) {
      setExportError(err.message || 'Export failed.');
      setExportState('error');
    }
  };
  const { rows, totalCount, loading, error, loadMore, hasMore } = useStockSummary(filters, sort, modelJump);
  const scrollRef = useRef(null);

  // A model search jumped the table to one model: bring the report
  // panel into view so the result isn't left below the fold.
  useEffect(() => {
    if (modelJump) {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [modelJump]);

  const handleSort = (key) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || !hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) loadMore();
  };

  const isEmpty = !loading && !error && rows.length === 0;

  return (
    <div className="panel" ref={panelRef}>
      <h3>
        Report
        <span className="count-pill">{totalCount.toLocaleString()} models</span>
        <button
          type="button"
          className="btn btn-reset export-btn"
          onClick={handleExport}
          disabled={exportState === 'working' || totalCount === 0}
          title="Download every row matching the current filters as CSV"
        >
          {exportState === 'working' ? (
            <>
              <span className="refresh-spinner" aria-hidden="true" />
              Preparing {exportCount.toLocaleString()} rows…
            </>
          ) : (
            <>
              <DownloadIcon />
              Export CSV
            </>
          )}
        </button>
      </h3>
      {exportError && <div className="error-box small">{exportError}</div>}
      {exportNote && <div className="export-note">{exportNote}</div>}
      {error && <div className="error-box">Error loading data: {error}</div>}
      <div className="table-scroll report-table-scroll" ref={scrollRef} onScroll={handleScroll}>
        <table>
          <thead>
            <tr>
              {COLS.map((c) => (
                <th
                  key={c.key}
                  onClick={() => c.sortable && handleSort(c.key)}
                  className={sort.key === c.key ? 'sorted' : ''}
                  style={{ cursor: c.sortable ? 'pointer' : 'default' }}
                >
                  {c.label}
                  {sort.key === c.key && <SortIcon direction={sort.dir} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const key = `${r.model_no}|${r.shop_id}`;
              const openThisModel = () =>
                setOpenModel({
                  modelNo: r.model_no,
                  shopId: r.shop_id,
                  shopCode: r.shop_code,
                  shopCountry: r.shop_country,
                  category: r.category,
                  salesPrice: r.sales_price,
                  lastSalesDate: r.last_sales_date,
                });
              return (
                <tr key={key} onClick={openThisModel} className="expandable-row" title={`View ${r.model_no} — photo, stock across shops`}>
                  <td className="model-cell">
                    <span className="model-link">{r.model_no}</span>
                  </td>
                  <td className="shrink-cell" title={r.category}>
                    {r.category}
                  </td>
                  <td>{r.shop_code}</td>
                  <td>{r.shop_country}</td>
                  <td>{r.sales_price}</td>
                  <td>{r.closing_stock}</td>
                  <td>{r.total_sales}</td>
                  <td>{r.total_purchase}</td>
                  <td>{formatIsoDate(r.last_sales_date)}</td>
                  <td>{r.days_since_last_sale ?? ''}</td>
                  <td>{r.days_old ?? ''}</td>
                  <td className="velocity">{r.sales_velocity ?? ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {isEmpty && (
          <div className="table-empty">
            <div className="table-empty-title">No models match these filters</div>
            <div className="table-empty-hint">
              Try clearing a filter, or tick "Show models with zero closing stock". Press Esc to clear everything.
            </div>
          </div>
        )}
        {loading && <div className="table-load-more">Loading…</div>}
        {!loading && hasMore && (
          <div className="table-load-more">
            Showing {rows.length.toLocaleString()} of {totalCount.toLocaleString()} — scroll for more
          </div>
        )}
      </div>
      {openModel && (
        <ModelDetailModal
          model={openModel}
          onClose={() => setOpenModel(null)}
          canRequest={canRequest}
          onTransferCreated={onTransferCreated}
          myShopId={myShopId}
          myCountry={myCountry}
        />
      )}
    </div>
  );
}
