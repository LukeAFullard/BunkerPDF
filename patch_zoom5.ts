import fs from 'fs';

let content = fs.readFileSync('src/components/pdf/SideBySideViewerModal.tsx', 'utf-8');

// There is a better way to ensure it doesn't overflow the left edge when zooming.
// We can use a wrapper div that allows scaling without breaking `items-center`.
// But changing items-center to flex-start when scale > 1 and adding mx-auto to the children is very standard and robust.
// Wait, the previous replacement might have missed if I changed it in patch 3 already.
// Let's check exactly what's there.
console.log(content.match(/className="flex-1 overflow-.*?"/g));
