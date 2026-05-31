import { useState, useRef, useEffect } from 'react';
import { Settings } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';

export function SettingsDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { extractionMethod, setExtractionMethod, isDarkMode } = useUIStore();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownRef]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
        }`}
        title="Settings"
      >
        <Settings size={20} />
      </button>

      {isOpen && (
        <div className={`absolute right-0 mt-2 w-64 rounded-xl shadow-lg border z-50 ${
          isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        }`}>
          <div className="p-3 border-b border-gray-100 dark:border-gray-700">
            <h3 className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Settings</h3>
          </div>
          <div className="p-3">
            <div className="mb-2">
              <label className={`block text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                Text Extraction Engine
              </label>
              <select
                value={extractionMethod}
                onChange={(e) => setExtractionMethod(e.target.value as "pyodide" | "liteparse")}
                className={`w-full text-sm rounded-lg border p-2 focus:ring-2 focus:ring-blue-500 outline-none ${
                  isDarkMode
                    ? 'bg-gray-700 border-gray-600 text-white'
                    : 'bg-white border-gray-300 text-gray-900'
                }`}
              >
                <option value="pyodide">Pyodide (Standard)</option>
                <option value="liteparse">LiteParse (Preserves Layout)</option>
              </select>
              <p className={`mt-1 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                LiteParse preserves multi-column layouts and spacing better, while Pyodide is the standard fallback.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
