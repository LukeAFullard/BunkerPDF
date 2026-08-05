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

async function main() {
  await wrappedCellsHeaderBand();
  await multiSectionHeaderBands();
  await noLinesWrapped();
  console.log('Wrapped-row fixtures created successfully.');
}

main().catch(console.error);