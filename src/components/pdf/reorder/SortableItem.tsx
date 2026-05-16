import { useState, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowUpToLine, ArrowDownToLine, MoreVertical } from 'lucide-react';
import { PDFPageThumbnail } from './PDFPageThumbnail';
import { ContextMenu } from '../../ui/ContextMenu';
import type { ContextMenuItem } from '../../ui/ContextMenu';

interface SortableItemProps {
  id: string;
  docId: string;
  pageNumber: number;
  thumbnailCache: Record<string, string>;
  setThumbnailCache: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onMoveToFront?: () => void;
  onMoveToEnd?: () => void;
}

export function SortableItem({
  id,
  docId,
  pageNumber,
  thumbnailCache,
  setThumbnailCache,
  onMoveToFront,
  onMoveToEnd
}: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const touchTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (touchTimerRef.current) clearTimeout(touchTimerRef.current);

    // Check if we touched the menu button specifically
    if ((e.target as HTMLElement).closest('.menu-button')) {
      return;
    }

    const touch = e.touches[0];
    touchTimerRef.current = setTimeout(() => {
      setContextMenu({ x: touch.clientX, y: touch.clientY });
    }, 500); // 500ms long press
  };

  const handleTouchMove = () => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  };

  const handleTouchEnd = () => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging || contextMenu ? 10 : 1,
    opacity: isDragging ? 0.5 : 1,
    touchAction: 'none' as const,
  };

  const menuItems: ContextMenuItem[] = [
    {
      label: 'Send to Front',
      icon: <ArrowUpToLine size={16} />,
      onClick: onMoveToFront
    },
    {
      label: 'Send to End',
      icon: <ArrowDownToLine size={16} />,
      onClick: onMoveToEnd
    }
  ];

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onContextMenu={handleContextMenu}
        onTouchStart={(e) => {
          handleTouchStart(e);
          if (listeners?.onTouchStart) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            listeners.onTouchStart(e as any);
          }
        }}
        onTouchMove={(e) => {
          handleTouchMove();
          if (listeners?.onTouchMove) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            listeners.onTouchMove(e as any);
          }
        }}
        onTouchEnd={(e) => {
          handleTouchEnd();
          if (listeners?.onTouchEnd) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            listeners.onTouchEnd(e as any);
          }
        }}
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

        {/* Menu button for mobile/accessibility without long-press/right-click */}
        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            className="menu-button p-1 bg-black/50 hover:bg-black/70 text-white rounded backdrop-blur-sm"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              setContextMenu({ x: rect.left, y: rect.bottom + 4 });
            }}
            onPointerDown={(e) => {
              // Prevent dnd-kit from starting a drag operation
              e.stopPropagation();
            }}
          >
            <MoreVertical size={12} />
          </button>
        </div>
      </div>

      {contextMenu && (onMoveToFront || onMoveToEnd) && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={menuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}
