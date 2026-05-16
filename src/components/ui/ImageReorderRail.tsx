import React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X, Check } from 'lucide-react';

export interface ImageItem {
  id: string;
  file: File;
  previewUrl: string;
}

interface SortableImageProps {
  id: string;
  item: ImageItem;
  onRemove: (id: string) => void;
}

function SortableImage({ id, item, onRemove }: SortableImageProps) {
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
    touchAction: 'none' as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="relative p-2 bg-white border border-gray-200 rounded-lg shadow-sm cursor-grab active:cursor-grabbing hover:border-blue-400 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 flex-shrink-0"
    >
      <img src={item.previewUrl} alt={item.file.name} className="w-24 h-32 object-cover rounded" />
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove(id);
        }}
        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 focus:outline-none z-20"
        aria-label="Remove image"
        title="Remove"
      >
        <X size={14} />
      </button>
    </div>
  );
}

interface ImageReorderRailProps {
  images: ImageItem[];
  setImages: React.Dispatch<React.SetStateAction<ImageItem[]>>;
  onConvert: () => void;
  onCancel: () => void;
  fitMode: 'fit' | 'original' | 'a4';
  setFitMode: (mode: 'fit' | 'original' | 'a4') => void;
  isProcessing: boolean;
}

export function ImageReorderRail({ images, setImages, onConvert, onCancel, fitMode, setFitMode, isProcessing }: ImageReorderRailProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setImages((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const removeImage = (id: string) => {
    setImages(prev => {
      const imgToRemove = prev.find(img => img.id === id);
      if (imgToRemove) {
        URL.revokeObjectURL(imgToRemove.previewUrl);
      }
      return prev.filter(img => img.id !== id);
    });
  };

  // calculate total size
  const totalSize = images.reduce((acc, img) => acc + img.file.size, 0);
  const totalSizeMB = totalSize / 1024 / 1024;
  const isOverSize = totalSizeMB > 80;

  return (
    <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm w-full max-w-4xl mx-auto mt-8">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-bold">Convert Images to PDF</h3>
          <p className="text-sm text-gray-500">
            {images.length} image{images.length !== 1 && 's'} selected {totalSizeMB > 0 && `(${(totalSizeMB).toFixed(1)} MB)`}
            {isOverSize && <span className="text-red-500 ml-2 font-medium">Warning: Total size exceeds 80MB. Try removing some images.</span>}
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <select
            value={fitMode}
            onChange={(e) => setFitMode(e.target.value as 'fit' | 'original' | 'a4')}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="a4">A4 (Centered)</option>
            <option value="fit">Fit to Page</option>
            <option value="original">Original Size</option>
          </select>

          <button
            onClick={onCancel}
            disabled={isProcessing}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConvert}
            disabled={isProcessing || images.length === 0 || isOverSize}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50 hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {isProcessing ? 'Processing...' : <><Check size={18} /> Convert to PDF</>}
          </button>
        </div>
      </div>

      <div className="bg-gray-50 p-4 rounded-xl border border-dashed border-gray-300 min-h-[160px] flex items-center overflow-x-auto">
        {images.length === 0 ? (
          <p className="text-gray-400 w-full text-center">No images remaining.</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={images.map(i => i.id)} strategy={rectSortingStrategy}>
              <div className="flex gap-4 p-2 items-center">
                {images.map((item) => (
                  <SortableImage key={item.id} id={item.id} item={item} onRemove={removeImage} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
