import { useState, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowUpToLine, ArrowDownToLine, MoreVertical, Maximize2, RotateCw, RotateCcw, Trash2 } from 'lucide-react';
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
  isSelected?: boolean;
  onSelectToggle?: (e: React.MouseEvent | React.TouchEvent) => void;
  isOverlay?: boolean;
  badgeCount?: number;
  thumbnailSize?: number;
  rotation?: number;
  fade?: boolean;
  onRotate?: (degrees: number) => void;
  onDelete?: () => void;
  onExpand?: () => void;
}

export function SortableItem({
  id,
  docId,
  pageNumber,
  thumbnailCache,
  setThumbnailCache,
  onMoveToFront,
  onMoveToEnd,
  isSelected = false,
  onSelectToggle,
  isOverlay = false,
  badgeCount = 0,
  thumbnailSize = 120,
  rotation = 0,
  fade = false,
  onRotate,
  onDelete,
  onExpand,
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
    zIndex: isDragging || isOverlay || contextMenu ? 10 : 1,
    opacity: isDragging || fade ? 0.3 : 1,
    touchAction: 'none' as const,
  };

  const menuItems: ContextMenuItem[] = [
    {
      label: 'Expand (Zoom)',
      icon: <Maximize2 size={16} />,
      onClick: onExpand
    },
    {
      label: 'Rotate Right',
      icon: <RotateCw size={16} />,
      onClick: onRotate ? () => onRotate(90) : undefined
    },
    {
      label: 'Rotate Left',
      icon: <RotateCcw size={16} />,
      onClick: onRotate ? () => onRotate(-90) : undefined
    },
    {
      label: 'Delete',
      icon: <Trash2 size={16} />,
      onClick: onDelete
    },
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
  ].filter(item => item.onClick !== undefined) as ContextMenuItem[];

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
        className={`relative p-2 bg-white border rounded-lg shadow-sm cursor-grab active:cursor-grabbing group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isSelected ? 'border-blue-500 ring-2 ring-blue-500' : 'border-gray-200 hover:border-blue-400'}`}
        tabIndex={0}
        role="button"
        aria-label={`Page ${pageNumber}`}
      >
        {onSelectToggle && (
          <div
            className="absolute top-2 left-2 z-10 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onSelectToggle(e);
            }}
            onPointerDown={(e) => e.stopPropagation()} // Prevent drag when clicking checkbox
          >
            <input
              type="checkbox"
              checked={isSelected}
              readOnly
              className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
            />
          </div>
        )}

        <div style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 0.2s ease-in-out' }}>
          <PDFPageThumbnail
            docId={docId}
            pageNumber={pageNumber}
            width={thumbnailSize}
            className="rounded"
            thumbnailCache={thumbnailCache}
            setThumbnailCache={setThumbnailCache}
          />
        </div>

        {badgeCount > 1 && (
          <div className="absolute -top-3 -right-3 bg-blue-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-md z-20">
            {badgeCount}
          </div>
        )}

        <div className={`absolute bottom-1 right-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded font-medium backdrop-blur-sm transition-colors ${isSelected ? 'bg-blue-600/90' : 'group-hover:bg-blue-600/80'}`}>
          {pageNumber}
        </div>


        {/* Menu button for mobile/accessibility without long-press/right-click */}
        {!isOverlay && (
          <div className="absolute top-1 right-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity z-20">
            <button
              className="menu-button p-1 bg-black/50 hover:bg-black/70 text-white rounded backdrop-blur-sm shadow-sm border border-white/20 flex items-center justify-center cursor-pointer"
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
              <MoreVertical size={16} />
            </button>
          </div>
        )}
      </div>

      {contextMenu && menuItems.length > 0 && (
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
