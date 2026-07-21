import React, { useState, useEffect } from 'react';
import { X, Search as SearchIcon, Loader2 } from 'lucide-react';
import { useSearchStore, type DocumentSegment } from '../../store/searchStore';
import { useFileStore, type PDFDocument } from '../../store/fileStore';
import { generateEmbedding, cosineSimilarity } from '../../lib/searchEngine';
import { analyzeDocumentHealth } from '../../lib/healthChecks';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onIndexDocuments: () => void;
  onRunOcr: (doc: PDFDocument) => void;
}



export function SearchModal({ isOpen, onClose, onIndexDocuments, onRunOcr }: SearchModalProps) {
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ semantic: { segment: DocumentSegment, score?: number }[], keyword: { segment: DocumentSegment }[] }>({ semantic: [], keyword: [] });
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocrNeededDocs, setOcrNeededDocs] = useState<PDFDocument[]>([]);
  const [isAnalyzingHealth, setIsAnalyzingHealth] = useState(false);

  const { segments, isIndexing, indexingProgress } = useSearchStore();
  const { documents, setActiveDocument } = useFileStore();

  const indexedDocIds = new Set(segments.map(s => s.docId));
  const unindexedDocs = documents.filter(doc => !indexedDocIds.has(doc.id));
  const unindexedDocsCount = unindexedDocs.length;

  useEffect(() => {
    if (!isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery('');

      setResults({ semantic: [], keyword: [] });

      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || unindexedDocsCount === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOcrNeededDocs([]);
      return;
    }

    let isMounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsAnalyzingHealth(true);

    const checkDocs = async () => {
      const needsOcr: PDFDocument[] = [];
      for (const doc of unindexedDocs) {
        const health = await analyzeDocumentHealth(doc.file);
        if (health.needsOcr) {
          needsOcr.push(doc);
        }
      }
      if (isMounted) {
        setOcrNeededDocs(needsOcr);
        setIsAnalyzingHealth(false);
      }
    };

    checkDocs();

    return () => {
      isMounted = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, unindexedDocsCount]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    if (selectedDocIds.size === 0) {
      setError("Please select at least one document to search.");
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const filteredSegments = segments.filter(s => selectedDocIds.has(s.docId));

      const queryEmbedding = await generateEmbedding(query);

      const semanticResults = filteredSegments
        .filter(s => s.embedding)
        .map(segment => ({
          segment,
          score: cosineSimilarity(queryEmbedding, segment.embedding!)
        }))
        .filter(r => r.score > 0.3) // threshold
        .sort((a, b) => b.score - a.score)
        .slice(0, 10); // top 10

      const lowerQuery = query.toLowerCase();
      const keywordResults = filteredSegments
        .filter(s => s.text.toLowerCase().includes(lowerQuery))
        .map(segment => ({ segment }))
        .slice(0, 20); // Limit keyword results

      setResults({
        semantic: semanticResults,
        keyword: keywordResults
      });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setError(err.message || 'Error performing search');
    } finally {
      setIsSearching(false);
    }
  };

  const handleResultClick = (docId: string) => {
    setActiveDocument(docId);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <SearchIcon className="text-blue-500" />
            Multi-PDF Search
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 border-b bg-gray-50">
          {unindexedDocsCount === 0 && !isIndexing && !isAnalyzingHealth && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Select documents to search:</span>
                <div className="space-x-2 text-sm">
                  <button type="button" onClick={() => setSelectedDocIds(new Set(documents.map(d => d.id)))} className="text-blue-600 hover:underline">Select All</button>
                  <span className="text-gray-300">|</span>
                  <button type="button" onClick={() => setSelectedDocIds(new Set())} className="text-gray-500 hover:underline">Clear</button>
                </div>
              </div>
              <div className="flex flex-col gap-2 max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-2 bg-white">
                {documents.map(doc => (
                  <label key={doc.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                    <input
                      type="checkbox"
                      checked={selectedDocIds.has(doc.id)}
                      onChange={(e) => {
                        const newSet = new Set(selectedDocIds);
                        if (e.target.checked) newSet.add(doc.id);
                        else newSet.delete(doc.id);
                        setSelectedDocIds(newSet);
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700 truncate">{doc.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {isAnalyzingHealth ? (
            <div className="flex flex-col items-center p-6 text-gray-500">
              <Loader2 className="w-8 h-8 animate-spin mb-3 text-blue-500" />
              <p>Analyzing document health...</p>
            </div>
          ) : unindexedDocsCount > 0 && !isIndexing ? (
            <div className="flex flex-col items-center p-6 bg-blue-50 rounded-lg border border-blue-200">
              <SearchIcon className="w-12 h-12 text-blue-500 mb-3" />
              <h3 className="text-lg font-bold text-blue-800 mb-2">Indexing Required</h3>

              {ocrNeededDocs.length > 0 ? (
                <>
                  <p className="text-center text-red-600 mb-4 font-medium">
                    ⚠️ {ocrNeededDocs.length} of your unindexed {ocrNeededDocs.length === 1 ? 'document appears' : 'documents appear'} to be scanned and require OCR before indexing.
                  </p>
                  <button
                    onClick={() => onRunOcr(ocrNeededDocs[0])}
                    className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors"
                  >
                    Run OCR on "{ocrNeededDocs[0].name}"
                  </button>
                </>
              ) : (
                <>
                  <p className="text-center text-blue-600 mb-4">
                    You have {unindexedDocsCount} {unindexedDocsCount === 1 ? 'document' : 'documents'} that must be indexed before you can search.
                  </p>
                  <button
                    onClick={onIndexDocuments}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                  >
                    Index Documents Now
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              <form onSubmit={handleSearch} className="flex gap-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search across all open documents..."
                  className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isIndexing || isSearching || unindexedDocsCount > 0}
                />
                <button
                  type="submit"
                  disabled={!query.trim() || isIndexing || isSearching || unindexedDocsCount > 0}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                >
                  {isSearching ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Search'}
                </button>
              </form>
              {isIndexing && (
                <div className="mt-2 text-sm text-gray-600 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Indexing documents... {indexingProgress}%
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="p-4 bg-red-50 text-red-700 rounded-lg mb-4">
              {error}
            </div>
          )}

          {(results.semantic.length > 0 || results.keyword.length > 0) ? (
            <div className="space-y-6">
              {results.semantic.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">Semantic Matches</h3>
                  <div className="space-y-4">
                    {results.semantic.map(({ segment, score }, index) => (
                      <div
                        key={'sem-'+index}
                        className="p-4 border rounded-lg hover:border-blue-500 cursor-pointer transition-colors"
                        onClick={() => handleResultClick(segment.docId)}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-semibold text-blue-600 truncate mr-4">
                            {segment.docName} (Page {segment.pageNumber})
                          </h4>
                          {score !== undefined && (
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full whitespace-nowrap">
                              Score: {(score * 100).toFixed(1)}%
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-700 line-clamp-3">
                          ...{segment.text.substring(0, 300)}...
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {results.keyword.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2 mt-4">Keyword Matches</h3>
                  <div className="space-y-4">
                    {results.keyword.map(({ segment }, index) => (
                      <div
                        key={'key-'+index}
                        className="p-4 border rounded-lg hover:border-blue-500 cursor-pointer transition-colors"
                        onClick={() => handleResultClick(segment.docId)}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-semibold text-blue-600 truncate mr-4">
                            {segment.docName} (Page {segment.pageNumber})
                          </h4>
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full whitespace-nowrap">
                            Exact Match
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 line-clamp-3">
                          ...{segment.text.substring(0, 300)}...
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : query && !isSearching && !isIndexing ? (
            <div className="text-center text-gray-500 py-12">
              No matches found for "{query}".
            </div>
          ) : (
            <div className="text-center text-gray-500 py-12 flex flex-col items-center">
              <SearchIcon className="w-12 h-12 text-gray-300 mb-4" />
              <p>Type a question or phrase to search across all indexed documents.</p>
              <p className="text-sm mt-2">Currently tracking {segments.length} segments across {new Set(segments.map(s => s.docId)).size} documents.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
