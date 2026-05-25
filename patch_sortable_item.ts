import fs from 'fs';

let content = fs.readFileSync('src/components/pdf/reorder/SortableItem.tsx', 'utf-8');

// Import icons
content = content.replace(
  "import { ArrowUpToLine, ArrowDownToLine, MoreVertical } from 'lucide-react';",
  "import { ArrowUpToLine, ArrowDownToLine, MoreVertical, Maximize2, RotateCw, Trash2 } from 'lucide-react';"
);

// Add props
content = content.replace(
  "fade?: boolean;\n}",
  "fade?: boolean;\n  onRotate?: (degrees: number) => void;\n  onDelete?: () => void;\n  onExpand?: () => void;\n}"
);

content = content.replace(
  "fade = false,\n}: SortableItemProps) {",
  "fade = false,\n  onRotate,\n  onDelete,\n  onExpand,\n}: SortableItemProps) {"
);

// Add buttons
const menuButtonRegex = /\{\/\* Menu button for mobile\/accessibility without long-press\/right-click \*\/\}/;

const newButtons = `
        {/* Quick action buttons */}
        {!isOverlay && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none">
            <div className="bg-black/60 backdrop-blur-md rounded-lg p-1 flex items-center gap-1 shadow-lg pointer-events-auto">
              {onExpand && (
                <button
                  className="p-1.5 text-white hover:bg-white/20 rounded transition-colors"
                  onClick={(e) => { e.stopPropagation(); onExpand(); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  title="Expand"
                >
                  <Maximize2 size={14} />
                </button>
              )}
              {onRotate && (
                <button
                  className="p-1.5 text-white hover:bg-white/20 rounded transition-colors"
                  onClick={(e) => { e.stopPropagation(); onRotate(90); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  title="Rotate Right"
                >
                  <RotateCw size={14} />
                </button>
              )}
              {onDelete && (
                <button
                  className="p-1.5 text-white hover:bg-red-500/50 rounded transition-colors"
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        )}

`;

content = content.replace(menuButtonRegex, newButtons + "        {/* Menu button for mobile/accessibility without long-press/right-click */}");

fs.writeFileSync('src/components/pdf/reorder/SortableItem.tsx', content);
