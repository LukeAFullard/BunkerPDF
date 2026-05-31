import { useState, useRef, useEffect } from 'react';
import { useUIStore } from '../../store/uiStore';
import { Settings, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function SettingsDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { extractionMethod, setExtractionMethod, liteparseOcrEnabled, setLiteparseOcrEnabled, isDarkMode } = useUIStore();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={twMerge(
          clsx(
            "p-2 rounded-lg transition-colors flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400",
            isDarkMode ? "text-gray-300 hover:bg-gray-700" : "text-gray-600 hover:bg-gray-200"
          )
        )}
        title="Settings"
      >
        <Settings size={20} />
        <ChevronDown size={14} />
      </button>

      {isOpen && (
        <div className={twMerge(
          clsx(
            "absolute right-0 mt-2 w-64 rounded-lg shadow-lg py-2 z-50 border",
            isDarkMode ? "bg-gray-800 border-gray-700 text-gray-200" : "bg-white border-gray-200 text-gray-800"
          )
        )}>
          <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 font-semibold">
            Settings
          </div>
          <div className="px-4 py-3">
            <label className="block text-sm font-medium mb-2">Text Extraction Engine</label>
            <select
              value={extractionMethod}
              onChange={(e) => setExtractionMethod(e.target.value as 'pyodide' | 'liteparse')}
              className={twMerge(
                clsx(
                  "w-full rounded-md border text-sm py-1.5 px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                  isDarkMode ? "bg-gray-700 border-gray-600" : "bg-gray-50 border-gray-300"
                )
              )}
            >
              <option value="pyodide">Standard (Pyodide)</option>
              <option value="liteparse">Preserves Layout (LiteParse)</option>
            </select>
            <p className="text-xs mt-2 text-gray-500 dark:text-gray-400">
              {extractionMethod === 'pyodide'
                ? 'Faster initial loads, but may lose multi-column layouts.'
                : 'Better layout preservation for complex documents.'}
            </p>

            {extractionMethod === 'liteparse' && (
              <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={liteparseOcrEnabled}
                    onChange={(e) => setLiteparseOcrEnabled(e.target.checked)}
                    className="mt-1 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="block text-sm font-medium">Enable In-Browser OCR</span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Automatically process scanned pages or images within PDFs using local OCR during extraction.
                    </span>
                  </div>
                </label>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
