import { useState, useEffect } from "react";
import { X, Plus, Trash2, Save } from "lucide-react";

export interface Bookmark {
  level: number;
  title: string;
  page: number;
}

interface BookmarkModalProps {
  isOpen: boolean;
  bookmarks: Bookmark[];
  maxPages: number;
  onClose: () => void;
  onSave: (bookmarks: Bookmark[]) => void;
}

export function BookmarkModal({
  isOpen,
  bookmarks: initialBookmarks,
  maxPages,
  onClose,
  onSave,
}: BookmarkModalProps) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => setBookmarks(initialBookmarks), 0);
    }
  }, [isOpen, initialBookmarks]);

  if (!isOpen) return null;

  const handleUpdate = (index: number, field: keyof Bookmark, value: string | number) => {
    const newBookmarks = [...bookmarks];
    newBookmarks[index] = { ...newBookmarks[index], [field]: value };
    setBookmarks(newBookmarks);
  };

  const handleRemove = (index: number) => {
    setBookmarks(bookmarks.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    setBookmarks([...bookmarks, { level: 1, title: "New Bookmark", page: 1 }]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50 backdrop-blur-sm">
      <div
        className="bg-white rounded-xl w-full max-w-2xl shadow-2xl flex flex-col h-[80vh]"
        role="dialog"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="text-xl font-semibold text-gray-900">Bookmark Editor</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
          {bookmarks.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              No bookmarks found. Add one to get started!
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 mb-2 px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <div className="col-span-2">Level</div>
                <div className="col-span-7">Title</div>
                <div className="col-span-2">Page</div>
                <div className="col-span-1"></div>
              </div>
              {bookmarks.map((b, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center bg-white p-2 rounded border border-gray-200">
                  <div className="col-span-2">
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={b.level}
                      onChange={(e) => handleUpdate(i, "level", parseInt(e.target.value) || 1)}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="col-span-7 flex items-center">
                    <div style={{ width: `${(b.level - 1) * 16}px` }} className="flex-shrink-0" />
                    <input
                      type="text"
                      value={b.title}
                      onChange={(e) => handleUpdate(i, "title", e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      min="1"
                      max={maxPages}
                      value={b.page}
                      onChange={(e) => handleUpdate(i, "page", parseInt(e.target.value) || 1)}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    <button onClick={() => handleRemove(i)} className="text-red-500 hover:text-red-700 p-1">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={handleAdd}
            className="mt-4 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium px-2 py-1"
          >
            <Plus size={16} /> Add Bookmark
          </button>
        </div>

        <div className="p-4 border-t border-gray-100 flex justify-end gap-3 bg-white rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(bookmarks)}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 flex items-center gap-2"
          >
            <Save size={16} /> Save Bookmarks
          </button>
        </div>
      </div>
    </div>
  );
}
