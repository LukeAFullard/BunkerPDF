const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function main() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([500, 300]);
  const fontReg = await doc.embedFont(StandardFonts.TimesRoman);
  const fontBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const size = 11;

  // Centered-in-column numeric values (matching a real LaTeX booktabs table),
  // plus a real vertical rule after the label column and real horizontal
  // rules - matching the real-world source PDF (arXiv 2007.07561, Table 1).
  const colCenters = [193, 224, 253, 279, 305, 331, 357];
  const labelX = 60;
  const vSepX = 143;

  function drawCentered(text, cx, y, font = fontReg) {
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: cx - w / 2, y, size, font });
  }

  let y = 220;
  const top = y + 20, bottom = y - 45;
  const ruleRight = 375; // covers all real numeric columns, well short of the caption line below

  page.drawLine({ start: { x: 50, y: top }, end: { x: ruleRight, y: top }, thickness: 1.2 });
  page.drawLine({ start: { x: vSepX, y: bottom }, end: { x: vSepX, y: top }, thickness: 1.2 });
  page.drawLine({ start: { x: 50, y: top - 20 }, end: { x: ruleRight, y: top - 20 }, thickness: 0.75 });

  page.drawText('k', { x: labelX, y, size, font: fontBold });
  ['1', '2', '3', '4', '5', '6', '9'].forEach((t, i) => drawCentered(t, colCenters[i], y, fontBold));
  y -= 20;

  page.drawText('Period', { x: labelX, y, size, font: fontReg });
  ['inf', '96', '48', '32', '24', '19', '12'].forEach((t, i) => drawCentered(t, colCenters[i], y));
  y -= 20;

  page.drawText('Contribution', { x: labelX, y, size, font: fontReg });
  ['52.8', '20.3', '7.5', '6.7', '2.9', '2.2', '0.7'].forEach((t, i) => drawCentered(t, colCenters[i], y));
  y -= 30;

  // A wide caption line below the table, in the same crop/selection - this is
  // what a real "Table 1. ..." caption looks like, and is what triggers the
  // bug: a single wide text item whose extent both (a) bridges over the real
  // per-column gaps when computing fallback column boundaries, and (b)
  // inflates the inferred table width past where the real horizontal rules
  // actually end.
  page.drawText(
    'Table 1. Accumulated contribution of each frequency over total variability, extending well past the rule.',
    { x: 50, y, size: 10, font: fontReg }
  );

  const bytes = await doc.save();
  fs.writeFileSync(path.join(__dirname, '../test-fixtures/tables/09-caption-partial-rule.pdf'), bytes);
  console.log('wrote fixture 09');
}

main();