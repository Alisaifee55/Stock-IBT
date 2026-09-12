// =============================================================
// AdminUpload.jsx — v2.0 — 12-09-2026
// Changes from v1.0:
//  - Report refresh now goes through the async job queue
//    (request_summary_refresh + poll) instead of the synchronous RPC
//    that always died on the authenticated role's 8s statement timeout.
//  - Every network call has a 20s timeout guard.
//  - beforeunload warning while an upload is in flight, so closing the
//    tab mid-run can't leave orphaned partial rows.
//  - row_count now records rows actually stored, not rows read from the
//    file (the old behaviour reported 25,440 for an upload that only
//    landed 10,987 items).
//  - Country selector and file input stay disabled for every busy state.
// =============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { readXlsxStreaming } from '../lib/xlsxStreamReader';
import { supabase } from '../lib/supabaseClient';
import { COUNTRIES } from '../lib/stockQueries';
import { runRefreshAndWait, withTimeout, SLOW_AFTER_MS } from '../lib/summaryRefresh';
import { UploadIcon } from './icons';
import logo from '../assets/sara-logo.png';

const INSERT_BATCH_SIZE = 500; // Supabase insert batch size (smaller than the
// parser's read batch size, which just controls how often we yield rows)

const COLUMN_MAP = {
  ModelNo: 'model_no',
  Brand: 'brand',
  CostPrice: 'cost_price',
  SalesPrice: 'sales_price',
  Category: 'category',
  YearDetail: 'year_detail',
  Type: 'type',
  Fabric: 'fabric',
  Color: 'color',
  Size: 'size',
  ClosingStock: 'closing_stock',
  SalesPeriod: 'sales_period',
  PurchasePeriod: 'purchase_period',
  TotalSales: 'total_sales',
  TotalPurchase: 'total_purchase',
  StockInPeriod: 'stock_in_period',
  StockOutPeriod: 'stock_out_period',
  TillDateStockIn: 'till_date_stock_in',
  FirstPurchaseDate: 'first_purchase_date',
  LastPurchaseDate: 'last_purchase_date',
  FirstSalesDate: 'first_sales_date',
  LastSalesDate: 'last_sales_date',
};
const DATE_FIELDS = new Set(['first_purchase_date', 'last_purchase_date', 'first_sales_date', 'last_sales_date']);

// Source export uses M/D/YY — verified across all 303,627 rows of
// ClosingStockDetailReport (22).xlsx: the first component never exceeds
// 12 while the second exceeds it in ~140,000 rows. Years are always
// 2-digit (13 through 26 observed).
function parseDateToIso(v) {
  if (v === '' || v === null || v === undefined) return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let [, mm, dd, yy] = m;
    yy = yy.length === 2 ? (parseInt(yy, 10) < 70 ? '20' + yy : '19' + yy) : yy;
    return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  // Build from parts rather than toISOString(): the latter converts to UTC
  // and shifts the date back a day for anyone in UTC+4.
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function mapRow(r, uploadId, shopByCode) {
  // Trim/upper the code: an untrimmed " TO" silently fell through to the
  // skipped pile before.
  const rawCode = r.GodownShortName;
  const code = rawCode === null || rawCode === undefined ? '' : String(rawCode).trim().toUpperCase();
  const shopId = shopByCode.get(code);
  if (!shopId) return null;
  const out = { upload_id: uploadId, shop_id: shopId };
  for (const [src, dest] of Object.entries(COLUMN_MAP)) {
    let v = r[src];
    if (DATE_FIELDS.has(dest)) v = parseDateToIso(v);
    else if (v === '') v = dest.includes('price') || dest === 'brand' || dest === 'category' ? null : 0;
    out[dest] = v;
  }
  return out;
}

const BUSY = new Set(['reading', 'uploading', 'refreshing', 'cleaning']);

export default function AdminUpload({ onUploaded }) {
  const [country, setCountry] = useState('UAE');
  const [deleteOldData, setDeleteOldData] = useState(false);
  const [fileName, setFileName] = useState('');
  const [status, setStatus] = useState('idle'); // idle | reading | uploading | refreshing | cleaning | done | error
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState('');
  const [skippedRows, setSkippedRows] = useState(0);
  const [deletedOldCount, setDeletedOldCount] = useState(null);
  const [refreshElapsed, setRefreshElapsed] = useState(0);
  const [refreshMs, setRefreshMs] = useState(null);
  const unmountedRef = useRef(false);

  const busy = BUSY.has(status);

  useEffect(() => () => {
    unmountedRef.current = true;
  }, []);

  // Don't let anyone close the tab mid-upload and orphan partial rows.
  useEffect(() => {
    if (!busy) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  const handleFile = useCallback(
    async (file) => {
      setFileName(file.name);
      setError('');
      setSkippedRows(0);
      setDeletedOldCount(null);
      setRefreshElapsed(0);
      setRefreshMs(null);
      setStatus('reading');
      setProgress({ done: 0, total: 0 });

      try {
        const { data: shops, error: shopsErr } = await withTimeout(
          supabase.from('shops').select('id, code').eq('country', country),
          20000,
          'Loading shop list'
        );
        if (shopsErr) throw shopsErr;
        const shopByCode = new Map(shops.map((s) => [String(s.code).trim().toUpperCase(), s.id]));

        const {
          data: { user },
        } = await withTimeout(supabase.auth.getUser(), 20000, 'Checking your session');
        if (!user) throw new Error('Your session has expired. Please sign out and sign in again.');

        const { data: uploadRow, error: uploadErr } = await withTimeout(
          supabase
            .from('stock_uploads')
            .insert({ uploaded_by: user.id, source_filename: file.name, row_count: 0, status: 'processing', country })
            .select()
            .single(),
          20000,
          'Creating the upload record'
        );
        if (uploadErr) throw uploadErr;

        setStatus('uploading');

        let skipped = 0;
        let insertBuffer = [];
        let totalMapped = 0;

        const flushInsertBuffer = async () => {
          if (insertBuffer.length === 0) return;
          const { error: insertErr } = await withTimeout(
            supabase.from('stock_items').insert(insertBuffer),
            20000,
            'Saving a batch of rows'
          );
          if (insertErr) throw insertErr;
          totalMapped += insertBuffer.length;
          insertBuffer = [];
          setProgress((p) => ({ ...p, done: totalMapped }));
        };

        // Rows stream in from the parser in read-batches; we map + re-batch
        // them for Supabase inserts as they arrive, so peak insert memory
        // stays proportional to one batch rather than the whole file.
        const totalRead = await readXlsxStreaming(file, {
          batchSize: 2000,
          onProgress: (n) => setProgress((p) => ({ ...p, total: n })),
          onBatch: async (rawBatch) => {
            for (const r of rawBatch) {
              const mapped = mapRow(r, uploadRow.id, shopByCode);
              if (!mapped) {
                skipped += 1;
                continue;
              }
              insertBuffer.push(mapped);
              if (insertBuffer.length >= INSERT_BATCH_SIZE) {
                await flushInsertBuffer();
              }
            }
          },
        });
        await flushInsertBuffer();
        setSkippedRows(skipped);

        if (totalMapped === 0) {
          throw new Error(
            `No rows matched any ${country} shop code (out of ${totalRead} rows read). Double-check you selected the right country, and that ${country} shops have been created (Manage Shops).`
          );
        }

        const { error: completeErr } = await withTimeout(
          supabase.from('stock_uploads').update({ status: 'completed', row_count: totalMapped }).eq('id', uploadRow.id),
          20000,
          'Marking the upload complete'
        );
        if (completeErr) throw completeErr;

        // The report reads from a pre-computed (materialized) summary. The
        // refresh is queued for a pg_cron worker and polled here — it runs
        // as postgres, so it isn't bound by the API's 8s statement timeout.
        setStatus('refreshing');
        const res = await runRefreshAndWait({
          onElapsed: setRefreshElapsed,
          isCancelled: () => unmountedRef.current,
        });
        if (!res?.cancelled) setRefreshMs(res.durationMs ?? null);

        if (deleteOldData) {
          setStatus('cleaning');
          const { data: deletedCount, error: deleteErr } = await withTimeout(
            supabase.rpc('admin_delete_old_uploads', { p_country: country, p_keep_upload_id: uploadRow.id }),
            60000,
            `Deleting old ${country} data`
          );
          if (deleteErr) throw deleteErr;
          setDeletedOldCount(deletedCount ?? 0);
        }

        setProgress({ done: totalMapped, total: totalRead });
        setStatus('done');
        onUploaded?.();
      } catch (err) {
        setError(err.message || 'Upload failed.');
        setStatus('error');
      }
    },
    [onUploaded, country, deleteOldData]
  );

  return (
    <div className="panel admin-upload-panel">
      <h3>Central stock upload (admin only)</h3>
      <label className="country-select-label">
        Country for this file
        <select value={country} onChange={(e) => setCountry(e.target.value)} disabled={busy}>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="delete-old-toggle">
        <input
          type="checkbox"
          checked={deleteOldData}
          onChange={(e) => setDeleteOldData(e.target.checked)}
          disabled={busy}
        />
        Delete old {country} data after this upload completes
        <span className="zero-stock-hint">(permanent — old history for {country} won't be kept)</span>
      </label>
      {status === 'idle' || status === 'error' ? (
        <label className="upload-drop">
          <UploadIcon />
          <span>{fileName ? `Retry: ${fileName} (${country})` : `Choose the ${country} closing stock file`}</span>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>
      ) : (
        <div className="upload-status">
          {busy && (
            <div className="upload-logo-stage">
              <div className="upload-logo-ring">
                <img src={logo} alt="" className="upload-logo-img" />
              </div>
            </div>
          )}
          <div>
            {fileName} — {country}
          </div>
          {status === 'reading' && <div>Reading workbook…</div>}
          {status === 'uploading' && (
            <div>
              Uploading {progress.done.toLocaleString()}
              {progress.total ? ` / ${progress.total.toLocaleString()}` : ''} rows…
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}
          {status === 'refreshing' && (
            <div>
              Refreshing report… {Math.round(refreshElapsed / 1000)}s
              {refreshElapsed > SLOW_AFTER_MS && (
                <div className="upload-refresh-note">
                  Still refreshing — this normally takes 10–30 seconds on a large file. Safe to leave this open.
                </div>
              )}
            </div>
          )}
          {status === 'cleaning' && <div>Deleting old {country} data…</div>}
          {status === 'done' && (
            <div className="upload-done">
              Done — {progress.done.toLocaleString()} rows stored for {country}
              {progress.total ? ` (${progress.total.toLocaleString()} read from file)` : ''}
              {skippedRows > 0 && (
                <div className="upload-skipped">
                  {skippedRows.toLocaleString()} rows skipped — their shop code doesn't exist in {country}. Add the
                  missing codes in Manage Shops and re-upload if those shops matter.
                </div>
              )}
              {refreshMs !== null && <div>Report refreshed in {(refreshMs / 1000).toFixed(1)}s.</div>}
              {deletedOldCount !== null && (
                <div>
                  {deletedOldCount} old {country} upload(s) deleted.
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {error && (
        <div className="error-box">
          Error: {error}
          <div className="error-hint">
            Rows already saved are kept. Choosing the file again re-uploads it as a new upload.
          </div>
        </div>
      )}
    </div>
  );
}
