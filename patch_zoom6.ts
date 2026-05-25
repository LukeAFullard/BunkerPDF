import fs from 'fs';

let content = fs.readFileSync('src/components/pdf/SideBySideViewerModal.tsx', 'utf-8');

content = content.replace(
  /style=\{\{ alignItems: scale > 1 \? "flex-start" : "center" \}\} style=\{\{ alignItems: scale > 1 \? "flex-start" : "center" \}\}/g,
  'style={{ alignItems: scale > 1 ? "flex-start" : "center" }}'
);

fs.writeFileSync('src/components/pdf/SideBySideViewerModal.tsx', content);
