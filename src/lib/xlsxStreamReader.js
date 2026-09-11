import { unzipSync, strFromU8 } from 'fflate';

// Minimal, purpose-built XLSX reader for very large sheets. Unlike SheetJS's
// XLSX.read()/sheet_to_json(), which builds a full in-memory JS object for
// every single cell (verified directly to crash on a 300k-row / ~8.8M-cell
// file even with 4GB+ available), this reads the sheet's raw XML once and
// walks it row-by-row, handing off complete rows in batches so peak memory
// stays roughly proportional to one batch, not the whole file.

const CELL_RE = /<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
const ATTR_R_RE = /\br="([A-Z]+)(\d+)"/;
const ATTR_T_RE = /\bt="([a-z]+)"/;
const VALUE_RE = /<v>([\s\S]*?)<\/v>/;
const INLINE_STR_RE = /<is>([\s\S]*?)<\/is>/;
const ROW_RE = /<row[^>]*>([\s\S]*?)<\/row>/g;

function decodeXmlEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

function parseSharedStrings(xml) {
  const strings = [];
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g;
  let siMatch;
  while ((siMatch = siRe.exec(xml))) {
    const inner = siMatch[1];
    let text = '';
    let tMatch;
    tRe.lastIndex = 0;
    while ((tMatch = tRe.exec(inner))) {
      text += tMatch[1];
    }
    strings.push(decodeXmlEntities(text));
  }
  return strings;
}

/**
 * Parses one <row>...</row> inner XML into { colLetter: value }.
 * Deliberately parses each cell's attributes (r=, t=) independently of their
 * order in the tag, rather than assuming a fixed attribute sequence — a
 * regex that assumed r= always precedes t= silently mis-parsed real files
 * where the style attribute (s=) sits between them.
 */
function parseRowCells(rowInnerXml, sharedStrings) {
  const cells = {};
  CELL_RE.lastIndex = 0;
  let m;
  while ((m = CELL_RE.exec(rowInnerXml))) {
    const attrs = m[1];
    const content = m[2]; // undefined for self-closing cells

    const rMatch = ATTR_R_RE.exec(attrs);
    if (!rMatch) continue;
    const col = rMatch[1];

    let value = '';
    if (content) {
      const typeMatch = ATTR_T_RE.exec(attrs);
      const type = typeMatch ? typeMatch[1] : null;
      const isMatch = INLINE_STR_RE.exec(content);
      const vMatch = VALUE_RE.exec(content);

      if (isMatch) {
        value = decodeXmlEntities(isMatch[1].replace(/<[^>]+>/g, ''));
      } else if (vMatch) {
        const rawV = vMatch[1];
        if (type === 's') {
          value = sharedStrings[parseInt(rawV, 10)] ?? '';
        } else if (type === 'str' || type === 'b') {
          value = decodeXmlEntities(rawV);
        } else {
          value = rawV;
        }
      }
    }
    cells[col] = value;
  }
  return cells;
}

function colLetterToIndex(letters) {
  let n = 0;
  for (let i = 0; i < letters.length; i++) {
    n = n * 26 + (letters.charCodeAt(i) - 64);
  }
  return n;
}

/**
 * Streams an .xlsx File, calling onBatch(rowsAsObjects) once per batchSize
 * rows. Rows are plain { headerName: stringValue } objects, matching the
 * shape SheetJS's sheet_to_json produced, so downstream mapping code is
 * unchanged. Returns the total row count processed.
 */
export async function readXlsxStreaming(file, { batchSize = 1000, onBatch, onProgress } = {}) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const entries = unzipSync(buf, {
    filter: (entry) =>
      entry.name === 'xl/sharedStrings.xml' ||
      entry.name === 'xl/_rels/workbook.xml.rels' ||
      entry.name === 'xl/workbook.xml' ||
      entry.name.startsWith('xl/worksheets/'),
  });

  const relsXml = strFromU8(entries['xl/_rels/workbook.xml.rels']);
  const workbookXml = strFromU8(entries['xl/workbook.xml']);
  const firstSheetName = /<sheet[^>]*r:id="([^"]+)"/.exec(workbookXml)?.[1];
  const relMatch = new RegExp(`<Relationship Id="${firstSheetName}"[^>]*Target="([^"]+)"`).exec(relsXml);
  const sheetPath = relMatch ? `xl/${relMatch[1].replace(/^\/?xl\//, '')}` : 'xl/worksheets/sheet1.xml';

  const sharedStrings = entries['xl/sharedStrings.xml'] ? parseSharedStrings(strFromU8(entries['xl/sharedStrings.xml'])) : [];
  const sheetXml = strFromU8(entries[sheetPath] || entries['xl/worksheets/sheet1.xml']);

  let headerByCol = null;
  let batch = [];
  let total = 0;

  ROW_RE.lastIndex = 0;
  let rowMatch;
  while ((rowMatch = ROW_RE.exec(sheetXml))) {
    const cells = parseRowCells(rowMatch[1], sharedStrings);

    if (!headerByCol) {
      headerByCol = {};
      for (const [col, val] of Object.entries(cells)) headerByCol[col] = val;
      continue; // header row consumed, not emitted as data
    }

    const rowObj = {};
    for (const col of Object.keys(headerByCol)) {
      rowObj[headerByCol[col]] = cells[col] ?? '';
    }
    batch.push(rowObj);
    total += 1;

    if (batch.length >= batchSize) {
      await onBatch(batch);
      onProgress?.(total);
      batch = [];
    }
  }
  if (batch.length > 0) {
    await onBatch(batch);
    onProgress?.(total);
  }

  return total;
}

// Exported for testing.
export const __internal = { parseSharedStrings, parseRowCells, decodeXmlEntities, colLetterToIndex };
