import { useState } from 'react';
import { useProcessingStore } from '../../store/processingStore';
import { ShieldCheck, X } from 'lucide-react';

export function ProcessingModal() {
  const { isActive, stage, progress, canCancel, onCancel } = useProcessingStore();
  const [showTrustBadge, setShowTrustBadge] = useState(true);

  if (!isActive) return null;

  const handleCancel = () => {
    if (canCancel && onCancel) {
      onCancel();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4 flex flex-col items-center gap-6">
        <div className="relative flex items-center justify-center">
          <svg className="animate-spin h-12 w-12 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>

        <div className="text-center w-full">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Processing</h3>
          <p className="text-sm text-gray-500" aria-live="polite">{stage}</p>
          {progress !== null && (
            <div className="w-full bg-gray-200 rounded-full h-2 mt-4 overflow-hidden">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
              />
            </div>
          )}
        </div>

        {canCancel && (
          <button
            onClick={handleCancel}
            className="w-full mt-2 py-2 px-4 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
        )}

        {showTrustBadge && (
          <div className="mt-4 flex items-start gap-2 bg-green-50 p-3 rounded-lg border border-green-100 relative">
            <ShieldCheck className="text-green-600 shrink-0 mt-0.5" size={16} />
            <div className="text-xs text-green-800 pr-4">
              <strong>Processing in your browser</strong>
              <p className="mt-0.5 opacity-90">No data is sent to any server.</p>
            </div>
            <button
              onClick={() => setShowTrustBadge(false)}
              className="absolute top-2 right-2 text-green-600 hover:text-green-800 focus-visible:outline-none"
              aria-label="Dismiss message"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
