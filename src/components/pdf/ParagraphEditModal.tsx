import { useState } from 'react';
import type { PDFDocument } from '../../store/fileStore';
import { useProcessingStore } from '../../store/processingStore';

interface ParagraphEditModalProps {
  isOpen: boolean;
  doc: PDFDocument | null;
  onClose: () => void;
  onEdit: (doc: PDFDocument, searchText: string, replacementText: string) => Promise<void>;
}

export function ParagraphEditModal({ isOpen, doc, onClose, onEdit }: ParagraphEditModalProps) {
  const [searchText, setSearchText] = useState("");
  const [replacementText, setReplacementText] = useState("");
  const isGlobalProcessing = useProcessingStore((state) => state.isActive);

  if (!isOpen || !doc) return null;

  const handleConfirm = async () => {
    if (!searchText.trim() || !replacementText.trim()) return;
    await onEdit(doc, searchText, replacementText);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full shadow-2xl flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Edit Paragraph (Beta)</h3>
            <p className="text-sm text-gray-500 mt-1">
              Uses spatial layout extraction to find the bounding box of a paragraph containing your search text, masks it, and draws the replacement text in its place.
            </p>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Search Text (Exact Match)</label>
            <input
              autoFocus
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="Text to replace..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Replacement Text</label>
            <textarea
              value={replacementText}
              onChange={(e) => setReplacementText(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="New text..."
              rows={4}
            />
          </div>
        </div>

        <div className="p-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600"
            disabled={isGlobalProcessing}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            disabled={!searchText.trim() || !replacementText.trim() || isGlobalProcessing}
          >
            Apply Edit
          </button>
        </div>
      </div>
    </div>
  );
}
