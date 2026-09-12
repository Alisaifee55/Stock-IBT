// =============================================================
// exportCsv.js — v2.0 — 12-09-2026
// Builds and downloads a CSV from report rows.
//
// Two things that bite CSV exports and are handled here:
//  - Formula injection: a value starting with = + - @ is executed by
//    Excel when the file is opened. Those are prefixed with a single
//    quote so they stay text.
//  - Excel needs a UTF-8 BOM or it mangles non-ASCII (colour names,
//    Arabic shop names) into mojibake.
// =============================================================

const RISKY_LEAD = /^[=+\-@\t\r]/;

function escapeCell(value) {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (RISKY_LEAD.test(s)) s = `'${s}`;
  // Quote whenever the value could break the row/field structure.
  if (/[",\n\r;]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** columns: [{ key, label, format? }] */
export function buildCsv(rows, columns) {
  const head = columns.map((c) => escapeCell(c.label)).join(',');
  const body = rows.map((r) =>
    columns.map((c) => escapeCell(c.format ? c.format(r[c.key], r) : r[c.key])).join(',')
  );
  // CRLF: the line ending Excel expects on Windows.
  return [head, ...body].join('\r\n');
}

/** Triggers a browser download. Works in Safari/iOS via a blob URL. */
export function downloadCsv(csv, filename) {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Give Safari a moment to start the download before revoking.
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1500);
}

/** sara-stock-report-12-09-2026-1935.csv */
export function timestampedFilename(prefix) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${prefix}-${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}-${p(d.getHours())}${p(
    d.getMinutes()
  )}.csv`;
}
