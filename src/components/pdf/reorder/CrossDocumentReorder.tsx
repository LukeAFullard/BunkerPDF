import { loadPdfDocument } from "../../../lib/pdfHelper";
import { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  useDroppable,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
} from '@dnd-kit/core';
import type {
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { X, Check, RotateCw, RotateCcw, Trash2, ZoomIn, ZoomOut } from 'lucide-react';

import { useFileStore } from '../../../store/fileStore';
import { cleanupPdfResources } from '../../../lib/pdfCleanup';
import { SortableItem } from './SortableItem';

interface PageItem {
  id: string; // format: docId-originalPageNumber
  docId: string;
  originalPageNumber: number;
  rotation?: number;
}

interface DocColumn {
  docId: string;
  name: string;
  items: PageItem[];
}

interface CrossDocumentReorderProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (newStructures: Record<string, { docId: string; originalPageNumber: number; rotation?: number }[]>, columnNames: Record<string, string>) => void;
}


interface DroppableContainerProps {
  id: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

function DroppableContainer({ id, children, className, style }: DroppableContainerProps) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={className} style={style}>
      {children}
    </div>
  );
}

export function CrossDocumentReorder({ isOpen, onClose, onApply }: CrossDocumentReorderProps) {
  const documents = useFileStore((state) => state.documents);
  const [columns, setColumns] = useState<DocColumn[]>([]);
  const [thumbnailCache, setThumbnailCache] = useState<Record<string, string>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<PageItem | null>(null);

  const [loading, setLoading] = useState(true);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [lastSelectedColId, setLastSelectedColId] = useState<string | null>(null);
  const [thumbnailScale, setThumbnailScale] = useState(1);

  // Initialize data
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const initialColumns: DocColumn[] = [];

    const init = async () => {
      setLoading(true);
      try {
        for (const doc of documents) {
          let numPages = doc.pageCount;

          if (!numPages) {
            const arrayBuffer = await doc.file.arrayBuffer();
            const proxy = await loadPdfDocument(arrayBuffer.slice(0)).promise;
            numPages = proxy.numPages;
            cleanupPdfResources(proxy);
          }

          const items: PageItem[] = [];
          for (let i = 1; i <= (numPages || 1); i++) {
            items.push({ id: `${doc.id}-${i}`, docId: doc.id, originalPageNumber: i, rotation: 0 });
          }

          initialColumns.push({
            docId: doc.id,
            name: doc.name,
            items,
          });
        }

        if (isMounted) {
          setColumns(initialColumns);
          setLoading(false);
        }
      } catch (error) {
        console.error("Failed to initialize structure for reordering", error);
        if (isMounted) setLoading(false);
      }
    };

    init();

    return () => {
      isMounted = false;
    };
  }, [isOpen, documents]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const activeStr = active.id as string;
    setActiveId(activeStr);

    // If we drag something that isn't selected, clear selection and select it
    if (!selectedIds.has(activeStr)) {
      setSelectedIds(new Set([activeStr]));
      setLastSelectedId(activeStr);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    // Find the containers
    const activeColumnIndex = columns.findIndex((col) => col.items.some((item) => item.id === activeId));

    // Check if over is a column itself
    let overColumnIndex = columns.findIndex((col) => col.docId === overId);
    if (overColumnIndex === -1) {
       overColumnIndex = columns.findIndex((col) => col.items.some((item) => item.id === overId));
    }

    if (activeColumnIndex === -1 || overColumnIndex === -1) return;

    if (activeColumnIndex !== overColumnIndex) {
      setColumns((prevColumns) => {
        const newColumns = [...prevColumns];

        // Find all selected items and remove them from all columns
        const movedItems: PageItem[] = [];

        newColumns.forEach((col, colIdx) => {
          const itemsToKeep = col.items.filter(item => {
            if (selectedIds.has(item.id)) {
              movedItems.push(item);
              return false;
            }
            return true;
          });
          newColumns[colIdx] = { ...col, items: itemsToKeep };
        });

        const overItems = [...newColumns[overColumnIndex].items];
        const overItemIndex = overItems.findIndex((item) => item.id === overId);

        if (overItemIndex === -1) {
            overItems.push(...movedItems);
        } else {
             const isBelowOverItem =
              over &&
              active.rect.current.translated &&
              active.rect.current.translated.top > over.rect.top + over.rect.height;

             const modifier = isBelowOverItem ? 1 : 0;
             overItems.splice(overItemIndex >= 0 ? overItemIndex + modifier : overItems.length + 1, 0, ...movedItems);
        }

        newColumns[overColumnIndex] = { ...newColumns[overColumnIndex], items: overItems };
        return newColumns;
      });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) {
      setActiveId(null);
      return;
    }

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) {
       setActiveId(null);
       return;
    }

    const activeColumnIndex = columns.findIndex((col) => col.items.some((item) => item.id === activeId));
    const overColumnIndex = columns.findIndex((col) => col.docId === overId) !== -1
                            ? columns.findIndex((col) => col.docId === overId)
                            : columns.findIndex((col) => col.items.some((item) => item.id === overId));


    if (activeColumnIndex !== -1 && overColumnIndex !== -1 && activeColumnIndex === overColumnIndex) {
      const items = [...columns[activeColumnIndex].items];

      const newIndex = items.findIndex((item) => item.id === overId);
      if (newIndex !== -1) {
        // Find selected items and their relative order
        const selectedItems = items.filter(item => selectedIds.has(item.id));
        const unselectedItems = items.filter(item => !selectedIds.has(item.id));

        // Find insert position in the unselected array.
        // If we drop over a selected item, default to its original position.
        let targetIndex = unselectedItems.findIndex(item => item.id === overId);

        if (targetIndex === -1) {
           // Find the closest unselected item before the drop target
           const originalTargetIndex = items.findIndex(item => item.id === overId);
           let closestUnselectedIdx = -1;
           for (let i = originalTargetIndex - 1; i >= 0; i--) {
              if (!selectedIds.has(items[i].id)) {
                 closestUnselectedIdx = unselectedItems.findIndex(u => u.id === items[i].id);
                 break;
              }
           }
           targetIndex = closestUnselectedIdx !== -1 ? closestUnselectedIdx + 1 : 0;
        } else {
             const isBelowOverItem =
              over &&
              active.rect.current.translated &&
              active.rect.current.translated.top > over.rect.top + over.rect.height;

             if (isBelowOverItem) targetIndex++;
        }

        unselectedItems.splice(targetIndex, 0, ...selectedItems);

        setColumns((prev) => {
          const newCols = [...prev];
          newCols[activeColumnIndex] = {
            ...newCols[activeColumnIndex],
            items: unselectedItems,
          };
          return newCols;
        });
      }
    }

    setActiveId(null);
  };

  const handleSelectToggle = (e: React.MouseEvent | React.TouchEvent, id: string) => {
    const isShift = (e as React.MouseEvent).shiftKey;
    const isCtrl = (e as React.MouseEvent).ctrlKey || (e as React.MouseEvent).metaKey;

    setSelectedIds(prev => {
      const newSelected = new Set(prev);

      if (isShift && lastSelectedId) {
        // Shift select: Find all items between lastSelectedId and id
        const allItems = columns.flatMap(c => c.items);
        const startIdx = allItems.findIndex(i => i.id === lastSelectedId);
        const endIdx = allItems.findIndex(i => i.id === id);

        if (startIdx !== -1 && endIdx !== -1) {
          const start = Math.min(startIdx, endIdx);
          const end = Math.max(startIdx, endIdx);
          for (let i = start; i <= end; i++) {
            newSelected.add(allItems[i].id);
          }
        }
      } else if (isCtrl) {
        // Ctrl/Cmd select: toggle individual
        if (newSelected.has(id)) {
          newSelected.delete(id);
        } else {
          newSelected.add(id);
        }
      } else {
        // Normal select: replace selection
        if (newSelected.has(id) && newSelected.size === 1) {
          newSelected.clear();
        } else {
          newSelected.clear();
          newSelected.add(id);
        }
      }

      setLastSelectedId(newSelected.size > 0 ? id : null);
      return newSelected;
    });
  };

  const handleSelectAll = () => {
    const allIds = columns.flatMap(c => c.items).map(i => i.id);
    setSelectedIds(new Set(allIds));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
    setLastSelectedId(null);
  };

  const handleRotate = (degrees: number) => {
    setColumns(prev => prev.map(col => ({
      ...col,
      items: col.items.map(item =>
        selectedIds.has(item.id)
          ? { ...item, rotation: ((item.rotation || 0) + degrees) % 360 }
          : item
      )
    })));
  };


  const handleSelectAllInColumn = (e: React.MouseEvent, docId: string) => {
    const isShift = e.shiftKey;

    setSelectedIds(prev => {
      const next = new Set(prev);

      if (isShift && lastSelectedColId) {
        const startIdx = columns.findIndex(c => c.docId === lastSelectedColId);
        const endIdx = columns.findIndex(c => c.docId === docId);

        if (startIdx !== -1 && endIdx !== -1) {
          const start = Math.min(startIdx, endIdx);
          const end = Math.max(startIdx, endIdx);

          for (let i = start; i <= end; i++) {
            columns[i].items.forEach(item => next.add(item.id));
          }
        }
      } else {
        const col = columns.find(c => c.docId === docId);
        if (col) {
          col.items.forEach(item => next.add(item.id));
        }
      }
      return next;
    });
    setLastSelectedColId(docId);
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

const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;

    setColumns(prev => prev.map(col => ({
      ...col,
      items: col.items.filter(item => !selectedIds.has(item.id))
    })));
    setSelectedIds(new Set());
    setLastSelectedId(null);
  };

  const handleMoveToFront = (itemId: string, colId: string) => {
    setColumns((prevColumns) => {
      const colIndex = prevColumns.findIndex((c) => c.docId === colId);
      if (colIndex === -1) return prevColumns;

      const newColumns = [...prevColumns];
      const items = [...newColumns[colIndex].items];

      const itemIndex = items.findIndex((i) => i.id === itemId);
      if (itemIndex <= 0) return prevColumns; // Already at front or not found

      const [item] = items.splice(itemIndex, 1);
      items.unshift(item);

      newColumns[colIndex] = { ...newColumns[colIndex], items };
      return newColumns;
    });
  };

  const handleMoveToEnd = (itemId: string, colId: string) => {
    setColumns((prevColumns) => {
      const colIndex = prevColumns.findIndex((c) => c.docId === colId);
      if (colIndex === -1) return prevColumns;

      const newColumns = [...prevColumns];
      const items = [...newColumns[colIndex].items];

      const itemIndex = items.findIndex((i) => i.id === itemId);
      if (itemIndex === -1 || itemIndex === items.length - 1) return prevColumns; // Already at end or not found

      const [item] = items.splice(itemIndex, 1);
      items.push(item);

      newColumns[colIndex] = { ...newColumns[colIndex], items };
      return newColumns;
    });
  };

  const handleApply = () => {
    const result: Record<string, { docId: string; originalPageNumber: number; rotation?: number }[]> = {};
    const columnNames: Record<string, string> = {};
    columns.forEach(col => {
      result[col.docId] = col.items.map(item => ({
        docId: item.docId,
        originalPageNumber: item.originalPageNumber,
        rotation: item.rotation
      }));
      columnNames[col.docId] = col.name;
    });
    onApply(result, columnNames);
  };

  const handleSplit = (itemId: string, colId: string) => {
    setColumns(prevColumns => {
      const colIndex = prevColumns.findIndex(c => c.docId === colId);
      if (colIndex === -1) return prevColumns;

      const col = prevColumns[colIndex];
      const itemIndex = col.items.findIndex(i => i.id === itemId);
      if (itemIndex === -1 || itemIndex === col.items.length - 1) return prevColumns; // Can't split on last item

      const newColumns = [...prevColumns];

      const newDocId = `split-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const splitItems = col.items.slice(itemIndex + 1);
      const remainingItems = col.items.slice(0, itemIndex + 1);

      newColumns[colIndex] = {
        ...col,
        items: remainingItems
      };

      const match = col.name.match(/^(.*?)(\s+\(\d+\))?(\.pdf)?$/i);
      const baseName = match ? match[1] : col.name;
      const ext = match && match[3] ? match[3] : '';

      let nextSuffix = 1;
      let newName = '';
      do {
        newName = `${baseName} (${nextSuffix})${ext}`;
        nextSuffix++;
      } while (newColumns.some(c => c.name === newName));

      newColumns.splice(colIndex + 1, 0, {
        docId: newDocId,
        name: newName,
        items: splitItems
      });

      return newColumns;
    });
  };

  if (!isOpen) return null;

  const activeItem = activeId
    ? columns.flatMap((c) => c.items).find((i) => i.id === activeId)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50/95 backdrop-blur-sm">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex flex-col sm:flex-row justify-between items-center shadow-sm gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Cross-Document Reorder</h2>
          <p className="text-sm text-gray-500">Drag and drop pages within or between documents.</p>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 bg-gray-100 p-1.5 rounded-lg">
           <div className="flex items-center gap-1 px-2 border-r border-gray-300">
              <span className="text-xs text-gray-500 font-medium whitespace-nowrap">
                {selectedIds.size} Selected
              </span>
              <button onClick={handleSelectAll} className="text-xs text-blue-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50">All</button>
              <button onClick={handleDeselectAll} disabled={selectedIds.size === 0} className="text-xs text-gray-600 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-200 disabled:opacity-50">None</button>
           </div>
           <button
             onClick={() => handleRotate(90)}
             disabled={selectedIds.size === 0}
             className="p-1.5 text-gray-700 hover:bg-white rounded shadow-sm disabled:opacity-50 disabled:shadow-none"
             title="Rotate Right"
           >
             <RotateCw size={16} />
           </button>
           <button
             onClick={() => handleRotate(-90)}
             disabled={selectedIds.size === 0}
             className="p-1.5 text-gray-700 hover:bg-white rounded shadow-sm disabled:opacity-50 disabled:shadow-none"
             title="Rotate Left"
           >
             <RotateCcw size={16} />
           </button>
           <button
             onClick={handleDeleteSelected}
             disabled={selectedIds.size === 0}
             className="p-1.5 text-red-600 hover:bg-red-50 rounded shadow-sm disabled:opacity-50 disabled:shadow-none"
             title="Delete Selected"
           >
             <Trash2 size={16} />
           </button>

           <div className="w-px h-6 bg-gray-300 mx-1"></div>

           <div className="flex items-center gap-1 px-2">
             <ZoomOut size={14} className="text-gray-500" />
             <input
                type="range"
                min="0.5" max="2" step="0.1"
                value={thumbnailScale}
                onChange={(e) => setThumbnailScale(parseFloat(e.target.value))}
                className="w-20"
             />
             <ZoomIn size={14} className="text-gray-500" />
           </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 flex items-center gap-2"
          >
            <X size={18} /> Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 flex items-center gap-2"
          >
            <Check size={18} /> Apply Changes
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">Loading thumbnails...</span>
          </div>
        ) : (
          <div className="flex gap-6 h-full min-w-max items-stretch pb-4">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              {columns.map((col) => (
                <div key={col.docId} className="flex flex-col w-[300px] bg-gray-100/50 border border-gray-200 rounded-xl overflow-hidden shrink-0 shadow-sm flex-1 max-h-[calc(100vh-120px)]">
                  <div className="bg-gray-200/50 px-4 py-3 border-b border-gray-200">
                    <h3 className="font-semibold text-gray-800 truncate" title={col.name}>{col.name}</h3>
                    <div className="text-xs text-gray-500 flex justify-between items-center mt-1">
                      <span>{col.items.length} pages</span>
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => handleSelectAllInColumn(e, col.docId)}
                          className="text-blue-600 hover:text-blue-700 hover:underline cursor-pointer px-1"
                        >
                          Select All
                        </button>
                        <span className="text-gray-300">|</span>
                        <button
                          onClick={() => {
                            setSelectedIds(prev => {
                              const next = new Set(prev);
                              col.items.forEach(item => next.delete(item.id));
                              return next;
                            });
                          }}
                          className="text-gray-500 hover:text-gray-700 hover:underline cursor-pointer px-1"
                        >
                          Deselect All
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <SortableContext id={col.docId} items={col.items.map(i => i.id)} strategy={rectSortingStrategy}>
                      <DroppableContainer
                        id={col.docId}
                        className="grid gap-3 min-h-[100px]"
                        style={{
                          gridTemplateColumns: `repeat(auto-fill, minmax(${Math.max(100, 120 * thumbnailScale)}px, 1fr))`
                        }}
                      >
                        {col.items.map((item) => (
                          <SortableItem
                            key={item.id}
                            id={item.id}
                            docId={item.docId}
                            pageNumber={item.originalPageNumber}
                            thumbnailCache={thumbnailCache}
                            setThumbnailCache={setThumbnailCache}
                            onMoveToFront={() => handleMoveToFront(item.id, col.docId)}
                            onMoveToEnd={() => handleMoveToEnd(item.id, col.docId)}
                            onRotate={(degrees) => handleRotateSingle(item.id, degrees)}
                            onDelete={() => handleDeleteSingle(item.id)}
                            onExpand={() => setPreviewItem(item)}
                            onSplit={() => handleSplit(item.id, col.docId)}
                            isSelected={selectedIds.has(item.id)}
                            onSelectToggle={(e) => handleSelectToggle(e, item.id)}
                            thumbnailSize={120 * thumbnailScale}
                            rotation={item.rotation}
                            fade={activeId !== null && activeId !== item.id && selectedIds.has(item.id)}
                          />
                        ))}
                      </DroppableContainer>
                    </SortableContext>
                  </div>
                </div>
              ))}

              <DragOverlay dropAnimation={{ sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }) }}>
                {activeItem ? (
                  <div className="opacity-80 rotate-3 scale-105 transition-transform shadow-xl">
                    <SortableItem
                      id={activeItem.id}
                      docId={activeItem.docId}
                      pageNumber={activeItem.originalPageNumber}
                      thumbnailCache={thumbnailCache}
                      setThumbnailCache={setThumbnailCache}
                      isOverlay={true}
                      badgeCount={selectedIds.has(activeItem.id) ? selectedIds.size : 1}
                      thumbnailSize={120 * thumbnailScale}
                      rotation={activeItem.rotation}
                    />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        )}

        {/* Full Screen Preview Overlay */}
        {previewItem && (
          <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col backdrop-blur-sm transition-opacity">
            <div className="flex justify-end p-4 absolute top-4 right-4 z-[100]">
              <button
                onClick={() => setPreviewItem(null)}
                className="bg-black/50 hover:bg-black/70 text-white p-3 rounded-full transition-colors shadow-lg backdrop-blur-sm border border-white/20 relative z-[100]"
              >
                <X size={24} />
              </button>
            </div>
            <div className="flex-1 flex items-center justify-center overflow-hidden z-[40]">
              <TransformWrapper centerOnInit={true} initialScale={1} minScale={0.5} maxScale={5}>
                <TransformComponent wrapperStyle={{ width: '100vw', height: '100vh' }} contentStyle={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div
                    style={{
                      transform: `rotate(${previewItem.rotation || 0}deg)`,
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
                      thumbnailSize={800 / (window.devicePixelRatio || 1)}
                      rotation={0}
                      isOverlay={true}
                    />
                  </div>
                </TransformComponent>
              </TransformWrapper>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
