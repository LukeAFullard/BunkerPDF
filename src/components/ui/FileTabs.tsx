import { useFileStore } from '../../store/fileStore';
import { PDFThumbnail } from '../pdf/PDFThumbnail';
import { cn } from '../../lib/utils';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableTabProps {
  id: string;
  doc: any;
  isActive: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}

function SortableTab({ id, doc, isActive, onSelect, onRemove }: SortableTabProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : isActive ? 10 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => {
        // Only select if it's not a drag operation, though useSortable handles clicks well usually
        onSelect(id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(id);
        }
      }}
      role="tab"
      aria-selected={isActive}
      tabIndex={0}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-t-lg border-t border-x cursor-pointer min-w-[120px] max-w-[200px] transition-colors relative group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500",
        isActive
          ? "bg-white border-gray-200 shadow-[0_4px_0_0_white] z-10 -mb-[1px]"
          : "bg-gray-50 border-gray-100 hover:bg-gray-100 text-gray-600"
      )}
    >
      <div className="w-6 h-8 flex-shrink-0">
         <PDFThumbnail file={doc.file} width={24} className="h-full rounded-sm pointer-events-none" />
      </div>
      <span className="text-sm font-medium truncate flex-1 pointer-events-none" title={doc.name}>
        {doc.name}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove(id);
        }}
        onPointerDown={(e) => e.stopPropagation()} // Prevent drag when clicking close button
        aria-label={`Close ${doc.name}`}
        className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        title="Close tab"
      >
        &times;
      </button>
    </div>
  );
}

export function FileTabs() {
  const documents = useFileStore(state => state.documents);
  const activeDocumentId = useFileStore(state => state.activeDocumentId);
  const setActiveDocument = useFileStore(state => state.setActiveDocument);
  const removeDocument = useFileStore(state => state.removeDocument);
  const reorderDocuments = useFileStore(state => state.reorderDocuments);

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

  if (documents.length === 0) return null;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = documents.findIndex(doc => doc.id === active.id);
      const newIndex = documents.findIndex(doc => doc.id === over.id);

      reorderDocuments(arrayMove(documents, oldIndex, newIndex));
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-2 overflow-x-auto border-b border-gray-200 pt-1 px-1">
        <SortableContext
          items={documents.map(d => d.id)}
          strategy={horizontalListSortingStrategy}
        >
          {documents.map(doc => {
            const isActive = doc.id === activeDocumentId;
            return (
              <SortableTab
                key={doc.id}
                id={doc.id}
                doc={doc}
                isActive={isActive}
                onSelect={setActiveDocument}
                onRemove={removeDocument}
              />
            );
          })}
        </SortableContext>
      </div>
    </DndContext>
  );
}
