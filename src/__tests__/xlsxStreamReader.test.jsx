import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { readXlsxStreaming } from '../lib/xlsxStreamReader';

// Hand-built minimal .xlsx matching the exact real-world structure that
// caused a real bug: attributes ordered r="..." s="..." t="s" (style BEFORE
// type), which a naive "r then optionally t" regex silently mis-parsed,
// treating shared-string header names as raw index numbers instead.
function buildTestXlsx() {
  const sharedStrings = ['ModelNo', 'Brand', 'Category', 'TO', 'ABY-DGMX', 'ABY', 'DG ABAYA'];
  const ssXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">` +
    sharedStrings.map((s) => `<si><t>${s}</t></si>`).join('') +
    '</sst>';

  // Row 1 (header): style attribute BEFORE type attribute, exactly like the
  // real file that broke. Row 2 (data): includes a self-closing empty cell
  // (<c r="D2" s="0"/>) for a column with no header mapping, and a plain
  // numeric cell with no t= attribute at all.
  const sheetXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>` +
    `<row r="1" s="1" customFormat="1"><c r="A1" s="1" t="s"><v>0</v></c><c r="B1" s="1" t="s"><v>1</v></c><c r="C1" s="1" t="s"><v>2</v></c></row>` +
    `<row r="2"><c r="A2" s="0" t="s"><v>4</v></c><c r="B2" s="0" t="s"><v>5</v></c><c r="C2" s="0" t="s"><v>6</v></c><c r="D2" s="0"/></row>` +
    `<row r="3"><c r="A3" s="0" t="s"><v>3</v></c><c r="C3" s="0"/></row>` +
    `</sheetData></worksheet>`;

  const workbookXml =
    '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>';
  const relsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>';

  const zipped = zipSync({
    'xl/workbook.xml': strToU8(workbookXml),
    'xl/_rels/workbook.xml.rels': strToU8(relsXml),
    'xl/worksheets/sheet1.xml': strToU8(sheetXml),
    'xl/sharedStrings.xml': strToU8(ssXml),
  });
  return zipped;
}

describe('readXlsxStreaming', () => {
  it('correctly resolves shared-string header/data values even when the style attribute precedes the type attribute', async () => {
    const zipped = buildTestXlsx();
    const fakeFile = { arrayBuffer: async () => zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) };

    const rows = [];
    const total = await readXlsxStreaming(fakeFile, {
      batchSize: 10,
      onBatch: async (batch) => rows.push(...batch),
    });

    expect(total).toBe(2);
    // Regression check: header names must be real strings ("ModelNo"), not
    // raw shared-string index numbers ("0") — this is exactly the bug that
    // shipped once before being caught against the real production file.
    expect(rows[0]).toEqual({ ModelNo: 'ABY-DGMX', Brand: 'ABY', Category: 'DG ABAYA' });
    // Row 3's missing Brand cell (no <c> for column B) must default to ''.
    expect(rows[1]).toEqual({ ModelNo: 'TO', Brand: '', Category: '' });
  });
});
