import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PDFPageThumbnail } from './PDFPageThumbnail';

interface SortableItemProps {
  id: string;
  docId: string;
  pageNumber: number;
  thumbnailCache: Record<string, string>;
  setThumbnailCache: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

export function SortableItem({ id, docId, pageNumber, thumbnailCache, setThumbnailCache }: SortableItemProps) {
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
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="relative p-2 bg-white border border-gray-200 rounded-lg shadow-sm cursor-grab active:cursor-grabbing hover:border-blue-400 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      tabIndex={0}
      role="button"
      aria-label={`Page ${pageNumber}`}
    >
      <PDFPageThumbnail
        docId={docId}
        pageNumber={pageNumber}
        width={120}
        className="rounded"
        thumbnailCache={thumbnailCache}
        setThumbnailCache={setThumbnailCache}
      />
      <div className="absolute top-1 left-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded font-medium backdrop-blur-sm group-hover:bg-blue-600/80 transition-colors">
        {pageNumber}
      </div>
    </div>
  );
}
