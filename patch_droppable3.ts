import fs from 'fs';

let content = fs.readFileSync('src/components/pdf/reorder/CrossDocumentReorder.tsx', 'utf-8');

// Replace the grid div with DroppableContainer specifically
content = content.replace(
  /<div\n\s*className="grid gap-3 min-h-\[100px\]"\n\s*style={{\n\s*gridTemplateColumns: `repeat\(auto-fill, minmax\(\${Math.max\(100, 120 \* thumbnailScale\)}px, 1fr\)\)`\n\s*}}\n\s*>/g,
  `<DroppableContainer\n                        id={col.docId}\n                        className="grid gap-3 min-h-[100px]"\n                        style={{\n                          gridTemplateColumns: \`repeat(auto-fill, minmax(\${Math.max(100, 120 * thumbnailScale)}px, 1fr))\`\n                        }}\n                      >`
);

fs.writeFileSync('src/components/pdf/reorder/CrossDocumentReorder.tsx', content);
