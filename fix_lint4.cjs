const fs = require('fs');
const filepath = 'src/components/pdf/InteractiveSmartHighlightModal.tsx';
let content = fs.readFileSync(filepath, 'utf-8');

content = content.replace(/void loadDocument\(\);/g, 'setTimeout(() => void loadDocument(), 0);');
content = content.replace(/void renderPage\(currentPage, pdfDoc\);/g, 'setTimeout(() => void renderPage(currentPage, pdfDoc), 0);');

fs.writeFileSync(filepath, content);
console.log("Fixed 4");
