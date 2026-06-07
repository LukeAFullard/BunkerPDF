import { useState } from 'react';
import { useFileStore } from '../../../store/fileStore';
import { FileDiff, X } from 'lucide-react';
import * as diff from 'diff';

interface DiffModalProps {
  onClose: () => void;
  extractText: (bytes: Uint8Array) => Promise<string>;
  extractParagraphs: (bytes: Uint8Array) => Promise<string[]>;
  diffHighlightPdf: (bytes: Uint8Array, highlights: string[], color: [number, number, number]) => Promise<Uint8Array>;
  diffMergedHighlightPdf: (bytes1: Uint8Array, bytes2: Uint8Array, removedHighlights: string[], addedHighlights: string[]) => Promise<Uint8Array>;
}

export function DiffModal({ onClose, extractParagraphs, diffMergedHighlightPdf }: DiffModalProps) {
  const documents = useFileStore(state => state.documents);

  const [diffResult, setDiffResult] = useState<diff.Change[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Use state initialization for default values to avoid useEffect setState cascading renders
  const [doc1Id, setDoc1Id] = useState<string>(documents.length >= 1 ? documents[0].id : '');
  const [doc2Id, setDoc2Id] = useState<string>(documents.length >= 2 ? documents[1].id : '');

  const [progressMsg, setProgressMsg] = useState<string | null>(null);

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
    setDiffResult([]);

    try {
      const buffer1 = await doc1.file.arrayBuffer();
      const buffer2 = await doc2.file.arrayBuffer();

      setProgressMsg('Extracting layout from original document...');
      const blocks1 = await extractParagraphs(new Uint8Array(buffer1));

      setProgressMsg('Extracting layout from modified document...');
      const blocks2 = await extractParagraphs(new Uint8Array(buffer2));

      setProgressMsg('Computing differences...');
      await new Promise(resolve => setTimeout(resolve, 10));

      const blockChanges = diff.diffArrays(blocks1, blocks2, {
        comparator: (a, b) => {
          // Identify if blocks are identical
          return a === b;
        }
      });

      const finalChanges: diff.Change[] = [];

      for (let i = 0; i < blockChanges.length; i++) {
        const change = blockChanges[i];

        // Progress update every few blocks
        if (i % 10 === 0) {
          setProgressMsg(`Processing chunk ${i + 1} of ${blockChanges.length}...`);
          await new Promise(resolve => setTimeout(resolve, 0));
        }

        // If a block was removed and the very next block was added, we can compute an inline diff
        // to show intra-paragraph modifications.
        if (change.removed && i + 1 < blockChanges.length && blockChanges[i+1].added) {
          const removedText = change.value.join('\n\n');
          const addedText = blockChanges[i+1].value.join('\n\n');
          const inlineChanges = diff.diffWordsWithSpace(removedText, addedText);

          finalChanges.push(...inlineChanges);
          finalChanges.push({ value: '\n\n', count: 1, added: false, removed: false }); // block separator

          i++; // Skip the added block since we processed it
        } else if (change.added && i + 1 < blockChanges.length && blockChanges[i+1].removed) {
          const addedText = change.value.join('\n\n');
          const removedText = blockChanges[i+1].value.join('\n\n');
          const inlineChanges = diff.diffWordsWithSpace(removedText, addedText);

          finalChanges.push(...inlineChanges);
          finalChanges.push({ value: '\n\n', count: 1, added: false, removed: false });

          i++;
        } else {
          // Complete addition or removal of block
          finalChanges.push({
             value: change.value.join('\n\n') + '\n\n',
             added: change.added,
             removed: change.removed,
             count: change.count
          });
        }
      }

      setDiffResult(finalChanges);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to compare documents.');
    } finally {
      setIsLoading(false);
      setProgressMsg(null);
    }
  };

  const [isGeneratingMerged, setIsGeneratingMerged] = useState(false);

  const handleGenerateMergedHighlight = async () => {
    if (!diffResult || !doc1Id || !doc2Id) return;
    setIsGeneratingMerged(true);
    try {
      const doc1 = documents.find(d => d.id === doc1Id);
      const doc2 = documents.find(d => d.id === doc2Id);
      if (!doc1 || !doc2) throw new Error("Documents not found");
      const buffer1 = await doc1.file.arrayBuffer();
      const buffer2 = await doc2.file.arrayBuffer();

      // We no longer need to pass the diff arrays to the Python worker for PDF highlight generation.
      // The worker uses its own \`difflib.SequenceMatcher\` internally against the actual PDF coordinates,
      // avoiding all text search ambiguities.

      // Yield to the event loop so the UI can render the "Generating..." state
      await new Promise(resolve => setTimeout(resolve, 10));

      const newPdfBytes = await diffMergedHighlightPdf(new Uint8Array(buffer1), new Uint8Array(buffer2), [], []);
      const standardBuffer = new Uint8Array(newPdfBytes.length);
      standardBuffer.set(newPdfBytes);
      const blob = new Blob([standardBuffer], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = "diff-highlighted.zip";
      a.click();
      URL.revokeObjectURL(url);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to generate highlighted PDFs");
    } finally {
      setIsGeneratingMerged(false);
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

          {progressMsg && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-sm rounded-lg border border-blue-100 dark:border-blue-900/50 flex items-center justify-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-3"></div>
              {progressMsg}
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg border border-red-100 dark:border-red-900/50">
              {error}
            </div>
          )}

          {diffResult && diffResult.length > 0 && (
            <div className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden flex flex-col bg-gray-50 dark:bg-gray-900 min-h-[300px]">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white">Comparison Results</h3>
                  <button
                    onClick={handleGenerateMergedHighlight}
                    disabled={isGeneratingMerged || diffResult.filter(p => p.added || p.removed).length === 0}
                    className="text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-3 py-1.5 rounded transition-colors disabled:opacity-50 font-medium"
                    title="Download ZIP containing PDFs with red/green highlights"
                  >
                    {isGeneratingMerged ? 'Generating...' : 'Export Highlighted PDFs (ZIP)'}
                  </button>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-100 text-red-800 rounded inline-block"></span> Removed</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-100 text-green-800 rounded inline-block"></span> Added</span>
                </div>
              </div>

              <div className="flex flex-1 overflow-hidden">
                {/* Left Side: Original Document (Removed Text) */}
                <div className="flex-1 border-r border-gray-200 dark:border-gray-700 p-6 overflow-y-auto font-mono text-sm leading-relaxed whitespace-pre-wrap bg-white dark:bg-gray-800 flex flex-col">
                  <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Original</h4>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                  {diffResult.map((part, index) => {
                    if (part.added) return null; // Don't show added parts in the original document

                    const colorClass = part.removed
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 line-through'
                      : 'text-gray-700 dark:text-gray-300';
                    return (
                      <span key={`orig-${index}`} className={colorClass}>
                        {part.value}
                      </span>
                    );
                  })}
                  </div>
                </div>

                {/* Right Side: Modified Document (Added Text) */}
                <div className="flex-1 p-6 overflow-y-auto font-mono text-sm leading-relaxed whitespace-pre-wrap bg-white dark:bg-gray-800 flex flex-col">
                  <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Modified</h4>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                  {diffResult.map((part, index) => {
                    if (part.removed) return null; // Don't show removed parts in the modified document

                    const colorClass = part.added
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                      : 'text-gray-700 dark:text-gray-300';
                    return (
                      <span key={`mod-${index}`} className={colorClass}>
                        {part.value}
                      </span>
                    );
                  })}
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
