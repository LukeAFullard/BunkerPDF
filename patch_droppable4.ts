import fs from 'fs';

let content = fs.readFileSync('src/components/pdf/reorder/CrossDocumentReorder.tsx', 'utf-8');

// Add states and handlers
const activeIdState = "const [activeId, setActiveId] = useState<string | null>(null);";
const additionalStates = `
  const [previewItem, setPreviewItem] = useState<PageItem | null>(null);
`;
content = content.replace(activeIdState, activeIdState + additionalStates);


// Add handleSelectAllInColumn
const handleDeleteSelected = "const handleDeleteSelected = () => {";
const handleSelectAllInColumn = `
  const handleSelectAllInColumn = (docId: string) => {
    const col = columns.find(c => c.docId === docId);
    if (!col) return;

    setSelectedIds(prev => {
      const next = new Set(prev);
      col.items.forEach(item => next.add(item.id));
      return next;
    });
  };

  const handleRotateSingle = (id: string, degrees: number) => {
    setColumns(prev => prev.map(col => ({
      ...col,
      items: col.items.map(item =>
        item.id === id
          ? { ...item, rotation: ((item.rotation || 0) + degrees) % 360 }
          : item
      )
    })));
  };

  const handleDeleteSingle = (id: string) => {
    setColumns(prev => prev.map(col => ({
      ...col,
      items: col.items.filter(item => item.id !== id)
    })));
    setSelectedIds(prev => {
      if (prev.has(id)) {
        const next = new Set(prev);
        next.delete(id);
        return next;
      }
      return prev;
    });
  };

`;

content = content.replace(handleDeleteSelected, handleSelectAllInColumn + handleDeleteSelected);

// Add "Select All" button to column header
content = content.replace(
  /<div className="text-xs text-gray-500">{col.items.length} pages<\/div>\n\s*<\/div>/g,
  `<div className="text-xs text-gray-500 flex justify-between items-center">
                      <span>{col.items.length} pages</span>
                      <button
                        onClick={() => handleSelectAllInColumn(col.docId)}
                        className="text-blue-600 hover:text-blue-700 hover:underline cursor-pointer px-1"
                      >
                        Select All
                      </button>
                    </div>
                  </div>`
);

// Add new props to SortableItem
content = content.replace(
  /onMoveToEnd=\{\(\) => handleMoveToEnd\(item.id, col.docId\)\}/g,
  `onMoveToEnd={() => handleMoveToEnd(item.id, col.docId)}
                            onRotate={(degrees) => handleRotateSingle(item.id, degrees)}
                            onDelete={() => handleDeleteSingle(item.id)}
                            onExpand={() => setPreviewItem(item)}`
);

// Add full screen preview overlay
const dragOverlayEnd = "</DragOverlay>\n            </DndContext>\n          </div>\n        )}";
const fullScreenOverlay = `

        {/* Full Screen Preview Overlay */}
        {previewItem && (
          <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col backdrop-blur-sm transition-opacity">
            <div className="flex justify-end p-4">
              <button
                onClick={() => setPreviewItem(null)}
                className="text-white hover:bg-white/20 p-2 rounded-full transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            <div className="flex-1 flex items-center justify-center p-8 overflow-hidden">
              <div
                style={{
                  transform: \`rotate(\${previewItem.rotation || 0}deg)\`,
                  transition: 'transform 0.3s ease-in-out'
                }}
                className="max-h-full max-w-full flex items-center justify-center"
              >
                <SortableItem
                  id={previewItem.id + "_preview"}
                  docId={previewItem.docId}
                  pageNumber={previewItem.originalPageNumber}
                  thumbnailCache={thumbnailCache}
                  setThumbnailCache={setThumbnailCache}
                  thumbnailSize={800}
                  rotation={0}
                  isOverlay={true}
                />
              </div>
            </div>
          </div>
        )}
`;

content = content.replace(dragOverlayEnd, dragOverlayEnd + fullScreenOverlay);

fs.writeFileSync('src/components/pdf/reorder/CrossDocumentReorder.tsx', content);
