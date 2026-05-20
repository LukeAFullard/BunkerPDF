import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { PDFPageThumbnail } from '../pdf/reorder/PDFPageThumbnail';

interface PageSelectorModalProps {
  isOpen: boolean;
  title: string;
  docId: string;
  pageCount: number;
  thumbnailCache: Record<string, string>;
  setThumbnailCache: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onConfirm: (selectedPages: number[]) => void;
  onCancel: () => void;
  singleSelection?: boolean;
}

export function PageSelectorModal({
  isOpen,
  title,
  docId,
  pageCount,
  thumbnailCache,
  setThumbnailCache,
  onConfirm,
  onCancel,
  singleSelection = false
}: PageSelectorModalProps) {
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (isOpen) {
      setSelectedPages(new Set());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleSelection = (pageNum: number) => {
    setSelectedPages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(pageNum)) {
        newSet.delete(pageNum);
      } else {
        if (singleSelection) {
          newSet.clear();
        }
        newSet.add(pageNum);
      }
      return newSet;
    });
  };

  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-xl font-bold">{title}</h2>
          <button onClick={onCancel} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {pages.map((pageNum) => {
              const isSelected = selectedPages.has(pageNum);
              return (
                <div
                  key={pageNum}
                  className={`relative cursor-pointer rounded-lg border-2 transition-all ${
                    isSelected ? 'border-blue-500 shadow-md transform scale-[1.02]' : 'border-transparent hover:border-gray-300'
                  }`}
                  onClick={() => toggleSelection(pageNum)}
                >
                  <div className="bg-white rounded-md overflow-hidden pointer-events-none">
                     <PDFPageThumbnail
                        docId={docId}
                        pageNumber={pageNum}
                        width={150}
                        thumbnailCache={thumbnailCache}
                        setThumbnailCache={setThumbnailCache}
                     />
                  </div>
                  <div className="absolute bottom-2 right-2 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded-md pointer-events-none">
                    Page {pageNum}
                  </div>
                  {isSelected && (
                    <div className="absolute top-2 right-2 bg-blue-500 text-white p-1 rounded-full pointer-events-none shadow-sm">
                      <Check className="w-4 h-4" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-4 border-t bg-white flex justify-between items-center">
          <div className="text-sm text-gray-600">
            {selectedPages.size} page{selectedPages.size !== 1 && 's'} selected
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(Array.from(selectedPages).sort((a, b) => a - b))}
              disabled={selectedPages.size === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
