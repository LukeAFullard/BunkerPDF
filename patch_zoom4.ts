import fs from 'fs';

let content = fs.readFileSync('src/components/pdf/SideBySideViewerModal.tsx', 'utf-8');

// The string was:
// className="flex-1 overflow-auto p-4 custom-scrollbar flex flex-col items-center gap-6"
// Let's just remove items-center and let the child handle centering.

content = content.replace(
  /className="flex-1 overflow-auto p-4 custom-scrollbar flex flex-col items-center gap-6"/g,
  'className="flex-1 overflow-auto p-4 custom-scrollbar flex flex-col gap-6" style={{ alignItems: scale > 1 ? "flex-start" : "center" }}'
);

// In PDFPageView:
// className="bg-white shadow-md relative min-h-[500px] flex justify-center items-center"
content = content.replace(
  /className="bg-white shadow-md relative min-h-\[500px\] flex justify-center items-center"/g,
  'className="bg-white shadow-md relative min-h-[500px] flex justify-center items-center mx-auto"'
);

fs.writeFileSync('src/components/pdf/SideBySideViewerModal.tsx', content);
