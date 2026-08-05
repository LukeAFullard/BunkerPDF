const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '../test-fixtures/tables');

// Fixture 05: reproduces the reported bug directly - a colored header band
// (filled rect, no stroke) followed by two rows whose label wraps across 3
// lines, with the value appearing on the middle line.
async function wrappedCellsHeaderBand() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([500, 500]);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontReg = await doc.embedFont(StandardFonts.Helvetica);

  const colA_x = 50, colB_x = 300, tableLeft = 45, tableRight = 455;
  const size = 10, lineHeight = 12;
  let y = 460;

  page.drawRectangle({ x: tableLeft, y: y - 4, width: tableRight - tableLeft, height: lineHeight + 4, color: rgb(0.25, 0.25, 0.3) });
  page.drawText('Non-domestic Power Schemes', { x: colA_x, y, size, font, color: rgb(1, 1, 1) });
  y -= lineHeight;

  page.drawText('Draw and Discharge or', { x: colA_x, y, size, font: fontReg });
  y -= lineHeight;
  page.drawText('Abstract less than 0.05', { x: colA_x, y, size, font: fontReg });
  page.drawText('Nil', { x: colB_x, y, size, font: fontReg });
  y -= lineHeight;
  page.drawText('m\u00b3/second', { x: colA_x, y, size, font: fontReg });
  y -= lineHeight;

  page.drawText('Draw and Discharge or', { x: colA_x, y, size, font: fontReg });
  y -= lineHeight;
  page.drawText('Abstract between 0.05 - 0.2', { x: colA_x, y, size, font: fontReg });
  page.drawText('$253.27', { x: colB_x, y, size, font: fontReg });
  y -= lineHeight;
  page.drawText('m\u00b2/second', { x: colA_x, y, size, font: fontReg });

  const bytes = await doc.save();
  fs.writeFileSync(path.join(outDir, '05-wrapped-cells-header-band.pdf'), bytes);
}

// Fixture 06: TWO header-banded sections in one table, each with its own
// wrapped rows, plus one plain (non-wrapped) row. Proves the fix isolates
// each section correctly and doesn't bleed content across bands.
async function multiSectionHeaderBands() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([500, 600]);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontReg = await doc.embedFont(StandardFonts.Helvetica);
  const colA_x = 50, colB_x = 300, tableLeft = 45, tableRight = 455, size = 10, lineHeight = 12;
  let y = 560;

  function band(text) {
    page.drawRectangle({ x: tableLeft, y: y - 4, width: tableRight - tableLeft, height: lineHeight + 4, color: rgb(0.25, 0.25, 0.3) });
    page.drawText(text, { x: colA_x, y, size, font, color: rgb(1, 1, 1) });
    y -= lineHeight;
  }
  function wrappedRow(lines, value) {
    lines.forEach((l, idx) => {
      page.drawText(l, { x: colA_x, y, size, font: fontReg });
      if (idx === Math.floor(lines.length / 2)) {
        page.drawText(value, { x: colB_x, y, size, font: fontReg });
      }
      y -= lineHeight;
    });
  }
  function simpleRow(a, b) {
    page.drawText(a, { x: colA_x, y, size, font: fontReg });
    page.drawText(b, { x: colB_x, y, size, font: fontReg });
    y -= lineHeight;
  }

  band('Section One');
  wrappedRow(['First label line', 'continuation of label', 'final line'], 'Value1');
  wrappedRow(['Second entry label', 'more wrapping here'], 'Value2');
  simpleRow('Plain Row', 'PlainValue');

  band('Section Two');
  wrappedRow(['Another label', 'wraps again', 'and again'], 'ValueA');
  wrappedRow(['Final entry', 'last wrap'], 'ValueB');

  const bytes = await doc.save();
  fs.writeFileSync(path.join(outDir, '06-multi-section-header-bands.pdf'), bytes);
}

// Fixture 07: NO ruled lines or header bands at all (pure spatial table),
// with a plain (non-bold) two-column header row immediately followed by
// wrapped rows. Proves the fix doesn't need any lines/fills to work, and
// that a plain header row doesn't wrongly absorb the first data row.
async function noLinesWrapped() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([500, 400]);
  const fontReg = await doc.embedFont(StandardFonts.Helvetica);
  const colA_x = 50, colB_x = 300, size = 10, lineHeight = 12;
  let y = 360;

  page.drawText('Item', { x: colA_x, y, size, font: fontReg });
  page.drawText('Amount', { x: colB_x, y, size, font: fontReg });
  y -= lineHeight;

  function wrappedRow(lines, value) {
    lines.forEach((l, idx) => {
      page.drawText(l, { x: colA_x, y, size, font: fontReg });
      if (idx === Math.floor(lines.length / 2)) {
        page.drawText(value, { x: colB_x, y, size, font: fontReg });
      }
      y -= lineHeight;
    });
  }

  wrappedRow(['Widget with a long name', 'that wraps to two lines'], '$10.00');
  wrappedRow(['Gadget'], '$20.00');
  wrappedRow(['Thingamajig with an', 'even longer name that', 'wraps three lines'], '$30.00');

  const bytes = await doc.save();
  fs.writeFileSync(path.join(outDir, '07-no-lines-wrapped.pdf'), bytes);
}

// Fixture 08: a wide, many-column table (like a real "Table 2: Values of the
// Parameters..." academic table with columns e1..e6) with section/case
// labels ("Case 1 (natural)", "Case 2 (regulated)", "Case 3 (snow-fed)")
// rendered as TWO separate text runs each (simulating how real PDFs commonly
// split a label across multiple text runs - e.g. a kerning adjustment or a
// font/style change mid-label - rather than emitting it as a single text
// item). Proves the spanning-row detection works by combined span/column
// overflow, not by requiring exactly one text item, and that a table this
// wide doesn't need a label to cross 60% of the total table width to be
// correctly recognized as a standalone divider row (it only needs to
// overflow past column 1, which is what real short case/section labels do).
async function splitSpanningLabel() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([500, 500]);
  const fontReg = await doc.embedFont(StandardFonts.Helvetica);
  const size = 10, lineHeight = 14;
  const colX = [50, 110, 160, 210, 260, 310, 360];
  let y = 460;

  function headerRow(cells) {
    cells.forEach((c, i) => page.drawText(c, { x: colX[i], y, size, font: fontReg }));
    y -= lineHeight;
  }
  function dataRow(cells) {
    cells.forEach((c, i) => page.drawText(c, { x: colX[i], y, size, font: fontReg }));
    y -= lineHeight;
  }
  function splitLabel(part1, part2) {
    page.drawText(part1, { x: colX[0], y, size, font: fontReg });
    const gap = fontReg.widthOfTextAtSize(part1 + ' ', size);
    page.drawText(part2, { x: colX[0] + gap, y, size, font: fontReg });
    y -= lineHeight;
  }

  headerRow(['e1', 'e2', 'e3', 'e4', 'e5', 'e6']);

  splitLabel('Case 1', '(natural)');
  dataRow(['6-par', '1.20', '0.84', '0.60', '0.44', '4.30', '2.96']);
  dataRow(['4-par', '3.50', '0.62', '0.58', '-', '-', '2.02']);
  dataRow(['2-par', '1.64', '0.80', '-', '-', '-', '-']);

  splitLabel('Case 2', '(regulated)');
  dataRow(['6-par', '2.70', '0.90', '0.53', '4.64', '28.20', '7.95']);
  dataRow(['4-par', '5.04', '0.19', '0.49', '-', '-', '0.74']);
  dataRow(['2-par', '4.43', '0.25', '-', '-', '-', '-']);

  splitLabel('Case 3', '(snow-fed)');
  dataRow(['6-par', '3.61', '0.44', '0.58', '0.44', '-0.36', '3.68']);
  dataRow(['4-par', '3.25', '0.25', '0.59', '-', '-', '-1.64']);
  dataRow(['2-par', '2.60', '0.40', '-', '-', '-', '-']);

  const bytes = await doc.save();
  fs.writeFileSync(path.join(outDir, '08-split-spanning-label.pdf'), bytes);
}

async function main() {
  await wrappedCellsHeaderBand();
  await multiSectionHeaderBands();
  await noLinesWrapped();
  await splitSpanningLabel();
  console.log('Wrapped-row fixtures created successfully.');
}

main().catch(console.error);