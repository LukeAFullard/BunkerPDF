const fs = require('fs');
const filepath = 'src/components/pdf/InteractiveSmartHighlightModal.tsx';
let content = fs.readFileSync(filepath, 'utf-8');

// Replace these so lint doesn't complain
content = content.replace(/loadDocument\(\);/g, 'void loadDocument();');
content = content.replace(/renderPage\(currentPage, pdfDoc\);/g, 'void renderPage(currentPage, pdfDoc);');

fs.writeFileSync(filepath, content);
console.log("Fixed 2");
