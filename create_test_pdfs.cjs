const { PDFDocument } = require('pdf-lib');
const fs = require('fs');

async function createDoc() {
  const doc1 = await PDFDocument.create();

  // Page 1
  const p1 = doc1.addPage([500, 500]);
  p1.drawText("Page 1 Content", { x: 50, y: 400 });

  // Page 2
  const p2 = doc1.addPage([500, 500]);
  p2.drawText("Page 2 Content", { x: 50, y: 400 });

  // Page 3
  const p3 = doc1.addPage([500, 500]);
  p3.drawText("Page 3 Content", { x: 50, y: 400 });

  const b1 = await doc1.save();
  fs.writeFileSync('test.pdf', b1);
  console.log("Created test.pdf with 3 pages.");
}

createDoc().catch(console.error);
