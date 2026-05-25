import fs from 'fs';

let content = fs.readFileSync('src/components/pdf/SideBySideViewerModal.tsx', 'utf-8');

// The best way to "zoom in place, not change container size" but allow scrolling is to let the canvas dictate its size inside an `overflow-auto` container, but ensure the `flex flex-col items-center` doesn't do weird things when child is wider than parent.
// If a flex child is wider than parent, `items-center` can cause it to overflow the left side, making the left side unreachable via scroll!
// YES! This is a known CSS issue: `align-items: center` on a scroll container causes unreachable overflow if the item is too large.
// The fix is to use `margin: 0 auto` on the child instead of `items-center` on the parent, or `min-width: min-content` with `align-items: flex-start` or similar.
// Wait, `items-center` is on the scroll container.
// Let's replace `items-center` with `items-start`.

content = content.replace(
  /className="flex-1 overflow-auto p-4 custom-scrollbar flex flex-col items-center gap-6"/g,
  'className="flex-1 overflow-auto p-4 custom-scrollbar flex flex-col items-center gap-6" style={{ alignItems: scale > 1 ? "flex-start" : "center" }}'
);

fs.writeFileSync('src/components/pdf/SideBySideViewerModal.tsx', content);
