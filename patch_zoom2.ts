import fs from 'fs';

let content = fs.readFileSync('src/components/pdf/SideBySideViewerModal.tsx', 'utf-8');

// Let's implement visual CSS scaling inside the pane, so the canvas size is fixed at scale=1, but the CSS transforms it.
// Wait, CSS transform scale doesn't change document flow size, so it will overlap other pages if we just `transform: scale(1.5)`.
// We should just ensure horizontal scrolling works correctly, which `overflow-auto` does.
// But if they say "It should zoom in place, not change container size", they might mean they want the modal size to remain fixed (which it is, `w-full h-full max-h-[95vh]`), but the inner content should just scroll.
// If the issue is "cannot scroll", changing `overflow-y-auto` to `overflow-auto` fixes that.

// Let's also ensure `PDFPageView` doesn't enforce minWidth rigidly if not needed.
content = content.replace(
  /style=\{\{ minWidth: '300px' \}\}/g,
  "style={{ minWidth: 'min-content' }}"
);

fs.writeFileSync('src/components/pdf/SideBySideViewerModal.tsx', content);
