

interface MetadataModalProps {
  isOpen: boolean;
  onClose: () => void;
  metadata: Record<string, string> | null;
}

export function MetadataModal({ isOpen, onClose, metadata }: MetadataModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg shadow-xl relative animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          aria-label="Close"
        >
          ×
        </button>

        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
          Document Metadata
        </h3>

        <div className="flex-1 overflow-y-auto min-h-0 bg-gray-50 dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          {!metadata || Object.keys(metadata).length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">
              No metadata found in this document.
            </p>
          ) : (
            <table className="w-full text-sm text-left">
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {Object.entries(metadata).map(([key, value]) => {
                  if (!value) return null;
                  return (
                    <tr key={key} className="hover:bg-gray-100 dark:hover:bg-gray-800">
                      <td className="py-3 px-2 font-medium text-gray-700 dark:text-gray-300 w-1/3 align-top break-all">
                        {key.charAt(0).toUpperCase() + key.slice(1)}
                      </td>
                      <td className="py-3 px-2 text-gray-600 dark:text-gray-400 align-top break-words">
                        {value}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
