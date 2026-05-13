import { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
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
  arrayMove,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import * as pdfjsLib from 'pdfjs-dist';
import { X, Check } from 'lucide-react';

import { useFileStore } from '../../../store/fileStore';
import { SortableItem } from './SortableItem';

interface PageItem {
  id: string; // format: docId-originalPageNumber
  docId: string;
  originalPageNumber: number;
}

interface DocColumn {
  docId: string;
  name: string;
  items: PageItem[];
}

interface CrossDocumentReorderProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (newStructures: Record<string, { docId: string; originalPageNumber: number }[]>) => void;
}

export function CrossDocumentReorder({ isOpen, onClose, onApply }: CrossDocumentReorderProps) {
  const documents = useFileStore((state) => state.documents);
  const [columns, setColumns] = useState<DocColumn[]>([]);
  const [pdfProxies, setPdfProxies] = useState<Record<string, pdfjsLib.PDFDocumentProxy>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize data
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const proxies: Record<string, pdfjsLib.PDFDocumentProxy> = {};
    const initialColumns: DocColumn[] = [];

    const init = async () => {
      setLoading(true);
      try {
        for (const doc of documents) {
          const arrayBuffer = await doc.file.arrayBuffer();
          const proxy = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          proxies[doc.id] = proxy;

          const numPages = proxy.numPages;
          const items: PageItem[] = [];
          for (let i = 1; i <= numPages; i++) {
            items.push({ id: `${doc.id}-${i}`, docId: doc.id, originalPageNumber: i });
          }

          initialColumns.push({
            docId: doc.id,
            name: doc.name,
            items,
          });
        }

        if (isMounted) {
          setPdfProxies(proxies);
          setColumns(initialColumns);
          setLoading(false);
        }
      } catch (error) {
        console.error("Failed to load PDFs for reordering", error);
        if (isMounted) setLoading(false);
      }
    };

    init();

    return () => {
      isMounted = false;
      // Cleanup proxies?  Could destroy them if needed, but pdfjs generally handles it
    };
  }, [isOpen, documents]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);
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
        const activeItems = [...newColumns[activeColumnIndex].items];
        const overItems = [...newColumns[overColumnIndex].items];

        const activeItemIndex = activeItems.findIndex((item) => item.id === activeId);
        const [movedItem] = activeItems.splice(activeItemIndex, 1);

        const overItemIndex = overItems.findIndex((item) => item.id === overId);
        if (overItemIndex === -1) {
            overItems.push(movedItem);
        } else {
             const isBelowOverItem =
              over &&
              active.rect.current.translated &&
              active.rect.current.translated.top > over.rect.top + over.rect.height;

             const modifier = isBelowOverItem ? 1 : 0;
             overItems.splice(overItemIndex >= 0 ? overItemIndex + modifier : overItems.length + 1, 0, movedItem);
        }

        newColumns[activeColumnIndex] = { ...newColumns[activeColumnIndex], items: activeItems };
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

    const activeColumnIndex = columns.findIndex((col) => col.items.some((item) => item.id === activeId));
    const overColumnIndex = columns.findIndex((col) => col.docId === overId) !== -1
                            ? columns.findIndex((col) => col.docId === overId)
                            : columns.findIndex((col) => col.items.some((item) => item.id === overId));


    if (activeColumnIndex !== -1 && overColumnIndex !== -1 && activeColumnIndex === overColumnIndex) {
      const items = columns[activeColumnIndex].items;
      const oldIndex = items.findIndex((item) => item.id === activeId);
      const newIndex = items.findIndex((item) => item.id === overId);

      if (oldIndex !== newIndex) {
        setColumns((prev) => {
          const newCols = [...prev];
          newCols[activeColumnIndex] = {
            ...newCols[activeColumnIndex],
            items: arrayMove(items, oldIndex, newIndex),
          };
          return newCols;
        });
      }
    }

    setActiveId(null);
  };

  const handleApply = () => {
    const result: Record<string, { docId: string; originalPageNumber: number }[]> = {};
    columns.forEach(col => {
      result[col.docId] = col.items.map(item => ({
        docId: item.docId,
        originalPageNumber: item.originalPageNumber
      }));
    });
    onApply(result);
  };

  if (!isOpen) return null;

  const activeItem = activeId
    ? columns.flatMap((c) => c.items).find((i) => i.id === activeId)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50/95 backdrop-blur-sm">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Cross-Document Reorder</h2>
          <p className="text-sm text-gray-500">Drag and drop pages within or between documents.</p>
        </div>
        <div className="flex items-center gap-3">
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
                    <div className="text-xs text-gray-500">{col.items.length} pages</div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <SortableContext id={col.docId} items={col.items.map(i => i.id)} strategy={rectSortingStrategy}>
                      <div className="grid grid-cols-2 gap-3 min-h-[100px]">
                        {col.items.map((item) => (
                          <SortableItem
                            key={item.id}
                            id={item.id}
                            pdfDoc={pdfProxies[item.docId]}
                            pageNumber={item.originalPageNumber}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </div>
                </div>
              ))}

              <DragOverlay dropAnimation={{ sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }) }}>
                {activeItem ? (
                  <div className="opacity-80 rotate-3 scale-105 transition-transform shadow-xl">
                    <SortableItem
                      id={activeItem.id}
                      pdfDoc={pdfProxies[activeItem.docId]}
                      pageNumber={activeItem.originalPageNumber}
                    />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        )}
      </div>
    </div>
  );
}
