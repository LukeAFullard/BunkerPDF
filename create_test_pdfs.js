import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';

async function createDocs() {
  // Doc 1 (Original)
  const doc1 = await PDFDocument.create();
  const font1 = await doc1.embedFont(StandardFonts.Helvetica);
  const page1 = doc1.addPage([600, 400]);

  page1.drawText('This is the first paragraph of the document.', { x: 50, y: 350, size: 14, font: font1 });
  page1.drawText('Here is the second paragraph. It contains some original information.', { x: 50, y: 300, size: 14, font: font1 });
  page1.drawText('This is the third paragraph, which will be completely removed in the next version.', { x: 50, y: 250, size: 14, font: font1 });
  page1.drawText('And finally, the fourth paragraph remains the same.', { x: 50, y: 200, size: 14, font: font1 });

  fs.writeFileSync('doc1.pdf', await doc1.save());

  // Doc 2 (Modified)
  const doc2 = await PDFDocument.create();
  const font2 = await doc2.embedFont(StandardFonts.Helvetica);
  const page2 = doc2.addPage([600, 400]);

  page2.drawText('This is the first paragraph of the document.', { x: 50, y: 350, size: 14, font: font2 });
  page2.drawText('Here is the second paragraph. It contains some modified information.', { x: 50, y: 300, size: 14, font: font2 });
  // Third paragraph removed
  page2.drawText('And finally, the fourth paragraph remains the same.', { x: 50, y: 250, size: 14, font: font2 });
  page2.drawText('This is a completely new fifth paragraph that was added.', { x: 50, y: 200, size: 14, font: font2 });

  fs.writeFileSync('doc2.pdf', await doc2.save());
  console.log('Created doc1.pdf and doc2.pdf');
}

createDocs();
