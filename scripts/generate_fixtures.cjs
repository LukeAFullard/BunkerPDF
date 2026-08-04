const { PDFDocument, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '../test-fixtures/tables');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function createPlainControlTable() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([500, 500]);

  // A plain 2x2 table
  // Headers
  page.drawText('Column 1', { x: 50, y: 450, size: 12 });
  page.drawText('Column 2', { x: 250, y: 450, size: 12 });
  // Row 1
  page.drawText('Data 1A', { x: 50, y: 430, size: 12 });
  page.drawText('Data 1B', { x: 250, y: 430, size: 12 });
  // Row 2
  page.drawText('Data 2A', { x: 50, y: 410, size: 12 });
  page.drawText('Data 2B', { x: 250, y: 410, size: 12 });

  const bytes = await doc.save();
  fs.writeFileSync(path.join(outDir, '04-plain-control-table.pdf'), bytes);
}

async function createNoisyLines() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([500, 500]);

  // Table with noisy lines
  page.drawText('Fee Type', { x: 50, y: 450, size: 12 });
  page.drawText('Amount', { x: 250, y: 450, size: 12 });

  page.drawText('Late Fee', { x: 50, y: 430, size: 12 });
  page.drawText('$50.00', { x: 250, y: 430, size: 12 });

  page.drawText('Transfer Fee', { x: 50, y: 410, size: 12 });
  page.drawText('$25.00', { x: 250, y: 410, size: 12 });

  // Draw lines to form table grid, plus some noisy small lines
  page.drawLine({ start: { x: 45, y: 465 }, end: { x: 400, y: 465 }, thickness: 1 });
  page.drawLine({ start: { x: 45, y: 445 }, end: { x: 400, y: 445 }, thickness: 1 });
  page.drawLine({ start: { x: 45, y: 425 }, end: { x: 400, y: 425 }, thickness: 1 });
  page.drawLine({ start: { x: 45, y: 405 }, end: { x: 400, y: 405 }, thickness: 1 });

  page.drawLine({ start: { x: 45, y: 465 }, end: { x: 45, y: 405 }, thickness: 1 });
  page.drawLine({ start: { x: 245, y: 465 }, end: { x: 245, y: 405 }, thickness: 1 });
  page.drawLine({ start: { x: 400, y: 465 }, end: { x: 400, y: 405 }, thickness: 1 });

  // Noisy line that could create an empty column if not handled
  page.drawLine({ start: { x: 240, y: 465 }, end: { x: 240, y: 405 }, thickness: 1 });

  const bytes = await doc.save();
  fs.writeFileSync(path.join(outDir, '01-noisy-lines-fee-schedule.pdf'), bytes);
}

async function createSpanningRows() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([500, 500]);

  // Table with spanning rows (dense rows vs spanning rows)
  page.drawText('Site', { x: 50, y: 450, size: 12 });
  page.drawText('Date', { x: 150, y: 450, size: 12 });
  page.drawText('Temp', { x: 250, y: 450, size: 12 });

  // Spanning row
  page.drawText('Region: North Lake (Deep Water)', { x: 50, y: 430, size: 12 }); // Spans across

  page.drawText('Site 1', { x: 50, y: 410, size: 12 });
  page.drawText('Jan 1', { x: 150, y: 410, size: 12 });
  page.drawText('5 C', { x: 250, y: 410, size: 12 });

  page.drawText('Site 2', { x: 50, y: 390, size: 12 });
  page.drawText('Jan 2', { x: 150, y: 390, size: 12 });
  page.drawText('6 C', { x: 250, y: 390, size: 12 });

  const bytes = await doc.save();
  fs.writeFileSync(path.join(outDir, '02-spanning-rows-water-temp.pdf'), bytes);
}

async function createColoredHeaderBands() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([500, 500]);

  page.drawText('Product', { x: 50, y: 450, size: 12 });
  page.drawText('Price', { x: 250, y: 450, size: 12 });

  // Colored header band (using background rect) - liteparse uses structural text colors fallback or rects
  page.drawRectangle({
    x: 45, y: 425, width: 350, height: 20,
    color: rgb(0.8, 0.8, 0.8)
  });
  // Text in header band (simulating bold or colored text)
  page.drawText('Category: Electronics', { x: 50, y: 430, size: 12, color: rgb(1, 0, 0) });

  page.drawText('Laptop', { x: 50, y: 410, size: 12 });
  page.drawText('$999', { x: 250, y: 410, size: 12 });

  const bytes = await doc.save();
  fs.writeFileSync(path.join(outDir, '03-colored-header-bands.pdf'), bytes);
}

async function main() {
  await createPlainControlTable();
  await createNoisyLines();
  await createSpanningRows();
  await createColoredHeaderBands();
  console.log('Fixtures created successfully.');
}

main().catch(console.error);