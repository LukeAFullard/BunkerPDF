import { useState } from 'react';
import { useFileStore } from '../../../store/fileStore';
import { FileDiff, X } from 'lucide-react';
import * as diff from 'diff';

interface DiffModalProps {
  onClose: () => void;
  extractText: (bytes: Uint8Array) => Promise<string>;
}

export function DiffModal({ onClose, extractText }: DiffModalProps) {
  const documents = useFileStore(state => state.documents);

  const [diffResult, setDiffResult] = useState<diff.Change[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Use state initialization for default values to avoid useEffect setState cascading renders
  const [doc1Id, setDoc1Id] = useState<string>(documents.length >= 1 ? documents[0].id : '');
  const [doc2Id, setDoc2Id] = useState<string>(documents.length >= 2 ? documents[1].id : '');

  const handleCompare = async () => {
    if (!doc1Id || !doc2Id) {
      setError('Please select two documents to compare.');
      return;
    }
    if (doc1Id === doc2Id) {
      setError('Please select two different documents.');
      return;
    }

    const doc1 = documents.find(d => d.id === doc1Id);
    const doc2 = documents.find(d => d.id === doc2Id);

    if (!doc1 || !doc2) {
      setError('One or both documents could not be found.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setDiffResult(null);

    try {
      const buffer1 = await doc1.file.arrayBuffer();
      const text1 = await extractText(new Uint8Array(buffer1));

      const buffer2 = await doc2.file.arrayBuffer();
      const text2 = await extractText(new Uint8Array(buffer2));

      // Compute diff
      const changes = diff.diffWordsWithSpace(text1, text2);
      setDiffResult(changes);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to compare documents.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl">
              <FileDiff className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Compare Documents</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Find text differences between two PDF files.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 w-full">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Original Document
              </label>
              <select
                value={doc1Id}
                onChange={e => setDoc1Id(e.target.value)}
                className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              >
                <option value="">Select a document...</option>
                {documents.map(doc => (
                  <option key={doc.id} value={doc.id}>{doc.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 w-full">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Modified Document
              </label>
              <select
                value={doc2Id}
                onChange={e => setDoc2Id(e.target.value)}
                className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              >
                <option value="">Select a document...</option>
                {documents.map(doc => (
                  <option key={doc.id} value={doc.id}>{doc.name}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleCompare}
              disabled={isLoading || !doc1Id || !doc2Id || doc1Id === doc2Id}
              className="w-full sm:w-auto px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {isLoading ? 'Comparing...' : 'Compare'}
            </button>
          </div>

          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg border border-red-100 dark:border-red-900/50">
              {error}
            </div>
          )}

          {diffResult && (
            <div className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden flex flex-col bg-gray-50 dark:bg-gray-900 min-h-[300px]">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white">Comparison Results</h3>
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-100 text-red-800 rounded inline-block"></span> Removed</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-100 text-green-800 rounded inline-block"></span> Added</span>
                </div>
              </div>
              <div className="p-6 overflow-y-auto font-mono text-sm leading-relaxed whitespace-pre-wrap bg-white dark:bg-gray-800 flex-1">
                {diffResult.map((part, index) => {
                  const colorClass = part.added
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                    : part.removed
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 line-through'
                      : 'text-gray-700 dark:text-gray-300';
                  return (
                    <span key={index} className={colorClass}>
                      {part.value}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
