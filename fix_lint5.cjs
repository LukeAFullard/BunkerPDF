const fs = require('fs');
const filepath = 'src/components/pdf/InteractiveSmartHighlightModal.tsx';
let content = fs.readFileSync(filepath, 'utf-8');

content = content.replace(/setPdfDoc\(null\);/g, 'setTimeout(() => setPdfDoc(null), 0);');
content = content.replace(/setTextItems\(\[\]\);/g, 'setTimeout(() => setTextItems([]), 0);');
content = content.replace(/setSelectedBoxes\(\[\]\);/g, 'setTimeout(() => setSelectedBoxes([]), 0);');
content = content.replace(/setHoveredBox\(null\);/g, 'setTimeout(() => setHoveredBox(null), 0);');


fs.writeFileSync(filepath, content);
console.log("Fixed 5");
