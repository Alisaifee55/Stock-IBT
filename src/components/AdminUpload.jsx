import { useCallback, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabaseClient';
import { UploadIcon } from './icons';

const BATCH_SIZE = 500;

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

export default function AdminUpload({ onUploaded }) {
  const [fileName, setFileName] = useState('');
  const [status, setStatus] = useState('idle'); // idle | reading | uploading | done | error
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState('');
  const [skippedRows, setSkippedRows] = useState(0);

  const handleFile = useCallback(
    async (file) => {
      setFileName(file.name);
      setError('');
      setSkippedRows(0);
      setStatus('reading');

      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (rawRows.length === 0) throw new Error('No data rows found in the sheet.');

        const { data: shops, error: shopsErr } = await supabase.from('shops').select('id, code');
        if (shopsErr) throw shopsErr;
        const shopByCode = new Map(shops.map((s) => [s.code, s.id]));

        const {
          data: { user },
        } = await supabase.auth.getUser();

        const { data: uploadRow, error: uploadErr } = await supabase
          .from('stock_uploads')
          .insert({ uploaded_by: user.id, source_filename: file.name, row_count: rawRows.length, status: 'processing' })
          .select()
          .single();
        if (uploadErr) throw uploadErr;

        let skipped = 0;
        const mapped = rawRows
          .map((r) => {
            const shopId = shopByCode.get(r.GodownShortName);
            if (!shopId) {
              skipped += 1;
              return null;
            }
            const out = { upload_id: uploadRow.id, shop_id: shopId };
            for (const [src, dest] of Object.entries(COLUMN_MAP)) {
              let v = r[src];
              if (DATE_FIELDS.has(dest)) v = parseDateToIso(v);
              else if (v === '') v = dest.includes('price') || dest === 'brand' || dest === 'category' ? null : 0;
              out[dest] = v;
            }
            return out;
          })
          .filter(Boolean);
        setSkippedRows(skipped);

        setStatus('uploading');
        setProgress({ done: 0, total: mapped.length });
        for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
          const batch = mapped.slice(i, i + BATCH_SIZE);
          const { error: insertErr } = await supabase.from('stock_items').insert(batch);
          if (insertErr) throw insertErr;
          setProgress({ done: Math.min(i + BATCH_SIZE, mapped.length), total: mapped.length });
        }

        const { error: completeErr } = await supabase
          .from('stock_uploads')
          .update({ status: 'completed' })
          .eq('id', uploadRow.id);
        if (completeErr) throw completeErr;

        setStatus('done');
        onUploaded?.();
      } catch (err) {
        setError(err.message || 'Upload failed.');
        setStatus('error');
      }
    },
    [onUploaded]
  );

  return (
    <div className="panel admin-upload-panel">
      <h3>Central stock upload (admin only)</h3>
      {status === 'idle' || status === 'error' ? (
        <label className="upload-drop">
          <UploadIcon />
          <span>{fileName ? `Retry: ${fileName}` : 'Choose CLOSING_STOCK.xlsx to upload'}</span>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>
      ) : (
        <div className="upload-status">
          <div>{fileName}</div>
          {status === 'reading' && <div>Reading workbook…</div>}
          {status === 'uploading' && (
            <div>
              Uploading {progress.done.toLocaleString()} / {progress.total.toLocaleString()} rows…
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}
          {status === 'done' && (
            <div className="upload-done">
              Done — {progress.total.toLocaleString()} rows uploaded
              {skippedRows > 0 && ` (${skippedRows} rows skipped: unrecognized shop code)`}
            </div>
          )}
        </div>
      )}
      {error && <div className="error-box">Error: {error}</div>}
    </div>
  );
}
