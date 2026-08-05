import { useState, useRef, useEffect } from 'react';
import { useUIStore } from '../../store/uiStore';
import { Settings, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function SettingsDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { extractionMethod, setExtractionMethod, complexityMode, setComplexityMode, spanningLabelOverflowFactor, setSpanningLabelOverflowFactor, spanWidthFractionRow, setSpanWidthFractionRow, enableLineTracing, setEnableLineTracing, enableStyledSpanningLabel, setEnableStyledSpanningLabel } = useUIStore();

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
            "text-gray-600 hover:bg-gray-200"
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
            "bg-white border-gray-200 text-gray-800"
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
                  "bg-gray-50 border-gray-300"
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

            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <label className="block text-sm font-medium mb-2">Complexity Mode</label>
              <select
                value={complexityMode}
                onChange={(e) => setComplexityMode(e.target.value as 'simple' | 'enhanced' | 'professional')}
                className={twMerge(
                  clsx(
                    "w-full rounded-md border text-sm py-1.5 px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                    "bg-gray-50 border-gray-300"
                  )
                )}
              >
                <option value="simple">Simple</option>
                <option value="professional">Professional</option>
              </select>
            </div>


            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => {
                  window.dispatchEvent(new Event('replay-tour'));
                  setIsOpen(false);
                }}
                className={twMerge(
                  clsx(
                    "w-full text-left text-sm py-2 px-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  )
                )}
              >
                Replay Welcome Tour
              </button>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <label className="block text-sm font-medium mb-4">Advanced Table Extraction</label>
              <div className="space-y-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableLineTracing}
                    onChange={(e) => setEnableLineTracing(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium">Use Line Tracing</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableStyledSpanningLabel}
                    onChange={(e) => setEnableStyledSpanningLabel(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium">Use Font Styles for Divider Labels</span>
                </label>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm">Divider Label Threshold</span>
                    <span className="text-xs text-gray-500 font-mono">{spanningLabelOverflowFactor.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="3.0"
                    step="0.1"
                    value={spanningLabelOverflowFactor}
                    onChange={(e) => setSpanningLabelOverflowFactor(parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <p className="text-[10px] text-gray-500 mt-1 leading-tight">Lower if wide labels are missed. Raise if long data splits.</p>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm">Span Width Fraction</span>
                    <span className="text-xs text-gray-500 font-mono">{Math.round(spanWidthFractionRow * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.3"
                    max="1.0"
                    step="0.05"
                    value={spanWidthFractionRow}
                    onChange={(e) => setSpanWidthFractionRow(parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
