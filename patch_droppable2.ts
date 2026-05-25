import fs from 'fs';

let content = fs.readFileSync('src/components/pdf/reorder/CrossDocumentReorder.tsx', 'utf-8');

// Replace the grid div with DroppableContainer
content = content.replace(
  /<div\s+className="grid gap-3 min-h-\[100px\]"\s+style={{[^}]+}}\s*>/,
  `$&`.replace('<div', '<DroppableContainer id={col.docId}')
);

content = content.replace(
  /<\/div>\s*<\/SortableContext>/g,
  `</DroppableContainer>\n                    </SortableContext>`
);

fs.writeFileSync('src/components/pdf/reorder/CrossDocumentReorder.tsx', content);
