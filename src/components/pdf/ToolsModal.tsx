import React from "react";
import { useUIStore } from "../../store/uiStore";
import { Search } from "lucide-react";

export interface ToolItem {
  category: string;
  label: string;
  onClick?: () => void;
  variant?: string;
}

interface ToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  tools: ToolItem[];
  documentName: string;
}

export function ToolsModal({ isOpen, onClose, tools, documentName }: ToolsModalProps) {
  const isDarkMode = useUIStore((state) => state.isDarkMode);
  const [searchQuery, setSearchQuery] = React.useState("");

  if (!isOpen) return null;

  const filteredTools = tools.filter(
    (item) =>
      item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupedTools = filteredTools.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, ToolItem[]>);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-4xl max-h-[85vh] rounded-xl shadow-2xl flex flex-col ${
          isDarkMode ? "bg-gray-800 text-gray-100" : "bg-white text-gray-900"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-2xl font-bold">Document Tools</h2>
            <p className={`text-sm mt-1 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
              {documentName}
            </p>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 ${
              isDarkMode
                ? "hover:bg-gray-700 focus-visible:ring-gray-500"
                : "hover:bg-gray-100 focus-visible:ring-gray-300"
            }`}
          >
            <span className="sr-only">Close</span>
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="relative">
            <Search
              className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 ${
                isDarkMode ? "text-gray-400" : "text-gray-500"
              }`}
            />
            <input
              type="text"
              placeholder="Search tools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-10 pr-4 py-3 rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                isDarkMode
                  ? "bg-gray-900 border-gray-700 text-gray-100 placeholder-gray-500"
                  : "bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400"
              }`}
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {Object.keys(groupedTools).length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No tools found matching "{searchQuery}"
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {Object.entries(groupedTools).map(([category, items]) => (
                <div key={category} className="space-y-3">
                  <h3
                    className={`font-semibold text-sm uppercase tracking-wider ${
                      category === "Danger"
                        ? "text-red-500"
                        : isDarkMode
                        ? "text-gray-400"
                        : "text-gray-500"
                    }`}
                  >
                    {category}
                  </h3>
                  <div className="grid grid-cols-1 gap-2">
                    {items.map((item, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          item.onClick?.();
                          onClose();
                        }}
                        className={`text-left px-4 py-3 rounded-lg border transition-all focus-visible:outline-none focus-visible:ring-2 ${
                          item.variant === "danger"
                            ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-300 focus-visible:ring-red-500 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/40"
                            : isDarkMode
                            ? "border-gray-700 bg-gray-800/50 hover:bg-gray-700 hover:border-gray-600 focus-visible:ring-gray-500"
                            : "border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 focus-visible:ring-indigo-500 shadow-sm hover:shadow"
                        }`}
                      >
                        <div className="font-medium">{item.label}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
