import { useState, useEffect } from 'react';

interface Metadata {
  standard: Record<string, string>;
  xmp: string;
}

interface MetadataModalProps {
  isOpen: boolean;
  onClose: () => void;
  metadata: Metadata | null;
  onSave: (newMetadata: Metadata) => void;
  isSaving: boolean;
}

export function MetadataModal({ isOpen, onClose, metadata, onSave, isSaving }: MetadataModalProps) {
  const [standardMetadata, setStandardMetadata] = useState<Record<string, string>>({});
  const [xmpMetadata, setXmpMetadata] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'standard' | 'xmp'>('standard');

  useEffect(() => {
    if (metadata && isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStandardMetadata(metadata.standard || {});

      setXmpMetadata(metadata.xmp || '');
    }
  }, [metadata, isOpen]);

  if (!isOpen) return null;

  const handleStandardChange = (key: string, value: string) => {
    setStandardMetadata({ ...standardMetadata, [key]: value });
  };

  const handleSave = () => {
    onSave({ standard: standardMetadata, xmp: xmpMetadata });
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-2xl shadow-xl relative animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <button
          onClick={onClose}
          disabled={isSaving}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors disabled:opacity-50"
          aria-label="Close"
        >
          ×
        </button>

        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
          Document Metadata
        </h3>

        <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4">
          <button
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'standard'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
            onClick={() => setActiveTab('standard')}
          >
            Standard Properties
          </button>
          <button
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'xmp'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
            onClick={() => setActiveTab('xmp')}
          >
            Hidden XMP Data
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-[300px] bg-gray-50 dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          {activeTab === 'standard' ? (
            <div className="space-y-4">
              {['title', 'author', 'subject', 'keywords', 'creator', 'producer', 'creationDate', 'modDate'].map(
                (key) => (
                  <div key={key} className="flex flex-col">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 capitalize">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:opacity-50"
                      value={standardMetadata[key] || ''}
                      onChange={(e) => handleStandardChange(key, e.target.value)}
                      disabled={isSaving}
                      placeholder={`Enter ${key}`}
                    />
                  </div>
                )
              )}
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Raw XMP XML
              </label>
              <textarea
                className="flex-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:opacity-50 font-mono text-xs whitespace-pre"
                value={xmpMetadata}
                onChange={(e) => setXmpMetadata(e.target.value)}
                disabled={isSaving}
                placeholder="No XMP metadata found..."
              />
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center"
          >
            {isSaving ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
