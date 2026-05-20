import { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
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
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { Check } from 'lucide-react';

import { useFileStore } from '../../../store/fileStore';
import { SortableItem } from './SortableItem';

interface PageItem {
  id: string;
  docId: string;
  originalPageNumber: number;
}

interface SingleDocumentReorderProps {
  isOpen: boolean;
  docId: string | null;
  onClose: () => void;
  onApply: (newOrder: number[]) => void;
  thumbnailCache: Record<string, string>;
  setThumbnailCache: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

export function SingleDocumentReorder({ isOpen, docId, onClose, onApply, thumbnailCache, setThumbnailCache }: SingleDocumentReorderProps) {
  const documents = useFileStore(state => state.documents);
  const doc = documents.find(d => d.id === docId);
  const [items, setItems] = useState<PageItem[]>([]);
  const [activeItem, setActiveItem] = useState<PageItem | null>(null);

  useEffect(() => {
    if (isOpen && doc && doc.pageCount) {
      setItems(Array.from({ length: doc.pageCount }, (_, i) => ({
        id: `${doc.id}-${i + 1}`,
        docId: doc.id,
        originalPageNumber: i + 1,
      })));
    } else {
      setItems([]);
    }
  }, [isOpen, doc]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  if (!isOpen || !doc) return null;

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const item = items.find(i => i.id === active.id);
    if (item) setActiveItem(item);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveItem(null);

    if (over && active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleApply = () => {
    onApply(items.map(item => item.originalPageNumber));
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-900/50 backdrop-blur-sm flex justify-center p-4 overflow-hidden">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50 rounded-t-2xl">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Reorder Pages</h2>
            <p className="text-sm text-gray-500 mt-1 truncate max-w-md">{doc.name}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <Check className="w-4 h-4" />
              Apply Changes
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-gray-50">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={items.map(i => i.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {items.map((item) => (
                  <SortableItem
                    key={item.id}
                    id={item.id}
                    docId={item.docId}
                    pageNumber={item.originalPageNumber}
                    thumbnailCache={thumbnailCache}
                    setThumbnailCache={setThumbnailCache}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay dropAnimation={{ sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }) }}>
              {activeItem ? (
                <div className="opacity-80 rotate-3 scale-105 transition-transform shadow-xl">
                  <SortableItem
                    id={activeItem.id}
                    docId={activeItem.docId}
                    pageNumber={activeItem.originalPageNumber}
                    thumbnailCache={thumbnailCache}
                    setThumbnailCache={setThumbnailCache}
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      </div>
    </div>
  );
}
