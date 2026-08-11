import { useState, useRef, useEffect } from 'react';
import { useUIStore } from '../../store/uiStore';
import { Settings, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function SettingsDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { complexityMode, setComplexityMode } = useUIStore();

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
            <div>
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
          </div>
        </div>
      )}
    </div>
  );
}
