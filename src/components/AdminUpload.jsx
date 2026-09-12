import { useCallback, useState } from 'react';
import { readXlsxStreaming } from '../lib/xlsxStreamReader';
import { supabase } from '../lib/supabaseClient';
import { COUNTRIES } from '../lib/stockQueries';
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

function parseDateToIso(v) {
  if (v === '' || v === null || v === undefined) return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let [, mm, dd, yy] = m;
    yy = yy.length === 2 ? (parseInt(yy, 10) < 70 ? '20' + yy : '19' + yy) : yy;
    return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function mapRow(r, uploadId, shopByCode) {
  const shopId = shopByCode.get(r.GodownShortName);
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

export default function AdminUpload({ onUploaded }) {
  const [country, setCountry] = useState('UAE');
  const [deleteOldData, setDeleteOldData] = useState(false);
  const [fileName, setFileName] = useState('');
  const [status, setStatus] = useState('idle'); // idle | reading | uploading | refreshing | cleaning | done | error
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState('');
  const [skippedRows, setSkippedRows] = useState(0);
  const [deletedOldCount, setDeletedOldCount] = useState(null);

  const handleFile = useCallback(
    async (file) => {
      setFileName(file.name);
      setError('');
      setSkippedRows(0);
      setDeletedOldCount(null);
      setStatus('reading');
      setProgress({ done: 0, total: 0 });

      try {
        const { data: shops, error: shopsErr } = await supabase.from('shops').select('id, code').eq('country', country);
        if (shopsErr) throw shopsErr;
        const shopByCode = new Map(shops.map((s) => [s.code, s.id]));

        const {
          data: { user },
        } = await supabase.auth.getUser();

        const { data: uploadRow, error: uploadErr } = await supabase
          .from('stock_uploads')
          .insert({ uploaded_by: user.id, source_filename: file.name, row_count: 0, status: 'processing', country })
          .select()
          .single();
        if (uploadErr) throw uploadErr;

        setStatus('uploading');

        let skipped = 0;
        let insertBuffer = [];
        let totalMapped = 0;

        const flushInsertBuffer = async () => {
          if (insertBuffer.length === 0) return;
          const { error: insertErr } = await supabase.from('stock_items').insert(insertBuffer);
          if (insertErr) throw insertErr;
          totalMapped += insertBuffer.length;
          insertBuffer = [];
          setProgress((p) => ({ ...p, done: totalMapped }));
        };

        // Rows stream in from the parser in read-batches; we map + re-batch
        // them for Supabase inserts as they arrive, so peak memory stays
        // proportional to one batch — not the whole file — regardless of
        // whether it's 300k rows or several times that.
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

        const { error: completeErr } = await supabase
          .from('stock_uploads')
          .update({ status: 'completed', row_count: totalRead })
          .eq('id', uploadRow.id);
        if (completeErr) throw completeErr;

        // The report reads from a pre-computed (materialized) summary for
        // speed at this data volume — it needs an explicit refresh after
        // each upload, since it doesn't auto-update like a normal view.
        setStatus('refreshing');
        const { error: refreshErr } = await supabase.rpc('refresh_stock_summary');
        if (refreshErr) throw refreshErr;

        if (deleteOldData) {
          setStatus('cleaning');
          const { data: deletedCount, error: deleteErr } = await supabase.rpc('admin_delete_old_uploads', {
            p_country: country,
            p_keep_upload_id: uploadRow.id,
          });
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
        <select value={country} onChange={(e) => setCountry(e.target.value)} disabled={status === 'uploading'}>
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
          disabled={status === 'uploading' || status === 'refreshing' || status === 'cleaning'}
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
          {(status === 'reading' || status === 'uploading' || status === 'refreshing' || status === 'cleaning') && (
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
          {status === 'refreshing' && <div>Refreshing report…</div>}
          {status === 'cleaning' && <div>Deleting old {country} data…</div>}
          {status === 'done' && (
            <div className="upload-done">
              Done — {progress.done.toLocaleString()} rows uploaded for {country}
              {skippedRows > 0 && ` (${skippedRows} rows skipped: unrecognized shop code)`}
              {deletedOldCount !== null && (
                <div>{deletedOldCount} old {country} upload(s) deleted.</div>
              )}
            </div>
          )}
        </div>
      )}
      {error && <div className="error-box">Error: {error}</div>}
    </div>
  );
}
