import { Fragment, useRef, useState } from 'react';
import { useStockSummary, useStockDetail } from '../lib/stockQueries';
import { SortIcon } from './icons';

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

function DetailRows({ modelNo, shopId }) {
  const { detail, loading } = useStockDetail(modelNo, shopId, true);
  if (loading) return (
    <tr className="detail-row"><td colSpan={COLS.length + 1}>Loading breakdown…</td></tr>
  );
  if (!detail || detail.length === 0) {
    return (
      <tr className="detail-row"><td colSpan={COLS.length + 1}>No Color/Size breakdown found.</td></tr>
    );
  }
  return (
    <>
      {detail.map((d, i) => (
        <tr className="detail-row" key={i}>
          <td></td>
          <td colSpan={2} className="detail-label">
            {d.color || '—'} / {d.size || '—'}
          </td>
          <td></td>
          <td>{d.closing_stock}</td>
          <td>{d.total_sales}</td>
          <td>{d.total_purchase}</td>
          <td colSpan={4}></td>
        </tr>
      ))}
    </>
  );
}

export default function ReportLive({ filters }) {
  const [sort, setSort] = useState({ key: 'sales_velocity', dir: 'desc' });
  const [expanded, setExpanded] = useState(new Set());
  const { rows, totalCount, loading, error, loadMore, hasMore } = useStockSummary(filters, sort);
  const scrollRef = useRef(null);

  const handleSort = (key) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || loading || !hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) loadMore();
  };

  const toggleExpand = (key) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="panel">
      <h3>
        Report
        <span className="count-pill">{totalCount.toLocaleString()} models</span>
      </h3>
      {error && <div className="error-box">Error loading data: {error}</div>}
      <div className="table-scroll report-table-scroll" ref={scrollRef} onScroll={handleScroll}>
        <table>
          <thead>
            <tr>
              <th></th>
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
              const isOpen = expanded.has(key);
              return (
                <Fragment key={key}>
                  <tr onClick={() => toggleExpand(key)} className="expandable-row">
                    <td className="expand-toggle">{isOpen ? '▾' : '▸'}</td>
                    <td className="model-cell">{r.model_no}</td>
                    <td className="shrink-cell" title={r.category}>
                      {r.category}
                    </td>
                    <td>{r.shop_code}</td>
                    <td>{r.shop_country}</td>
                    <td>{r.sales_price}</td>
                    <td>{r.closing_stock}</td>
                    <td>{r.total_sales}</td>
                    <td>{r.total_purchase}</td>
                    <td>{r.last_sales_date || ''}</td>
                    <td>{r.days_since_last_sale ?? ''}</td>
                    <td>{r.days_old}</td>
                    <td className="velocity">{r.sales_velocity}</td>
                  </tr>
                  {isOpen && <DetailRows modelNo={r.model_no} shopId={r.shop_id} />}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {loading && <div className="table-load-more">Loading…</div>}
        {!loading && hasMore && (
          <div className="table-load-more">
            Showing {rows.length.toLocaleString()} of {totalCount.toLocaleString()} — scroll for more
          </div>
        )}
      </div>
    </div>
  );
}
