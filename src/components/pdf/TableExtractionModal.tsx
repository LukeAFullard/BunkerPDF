import { useState } from 'react';
import type { PDFDocument } from '../../store/fileStore';
import { useProcessingStore } from '../../store/processingStore';
import { useUIStore } from '../../store/uiStore';

interface TableExtractionModalProps {
  isOpen: boolean;
  doc: PDFDocument | null;
  onClose: () => void;
  onExtract: (doc: PDFDocument, format: 'excel' | 'csv' | 'markdown' | 'latex') => Promise<void>;
}

export function TableExtractionModal({ isOpen, doc, onClose, onExtract }: TableExtractionModalProps) {
  const [format, setFormat] = useState<'excel' | 'csv' | 'markdown' | 'latex'>('excel');
  const isGlobalProcessing = useProcessingStore((state) => state.isActive);
  const extractionMethod = useUIStore((state) => state.extractionMethod);

  if (!isOpen || !doc) return null;

  const handleConfirm = async () => {
    // Standard extraction always routes to excel right now
    if (extractionMethod === 'pyodide') {
      await onExtract(doc, 'excel');
    } else {
      await onExtract(doc, format);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full shadow-2xl flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Extract Tables</h3>
            <p className="text-sm text-gray-500 mt-1">
              Select the desired output format for your tables.
            </p>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as 'excel' | 'csv' | 'markdown' | 'latex')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              disabled={extractionMethod === 'pyodide'}
            >
              {extractionMethod === 'pyodide' ? (
                <option value="excel">Excel (Standard/Pyodide Mode)</option>
              ) : (
                <>
                  <option value="csv">CSV (LiteParse)</option>
                  <option value="markdown">Markdown (LiteParse)</option>
                  <option value="latex">LaTeX (LiteParse)</option>
                </>
              )}
            </select>
            {extractionMethod === 'pyodide' && (
              <p className="text-xs text-gray-500 mt-2">
                In Standard mode, only Excel extraction is supported. Switch to 'Preserves Layout (LiteParse)' in settings to export to CSV, Markdown, or LaTeX.
              </p>
            )}
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
            disabled={isGlobalProcessing}
          >
            Extract
          </button>
        </div>
      </div>
    </div>
  );
}
