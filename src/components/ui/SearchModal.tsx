import React, { useState, useEffect } from 'react';
import { X, Search as SearchIcon, Loader2 } from 'lucide-react';
import { useSearchStore, type DocumentSegment } from '../../store/searchStore';
import { useFileStore } from '../../store/fileStore';
import { generateEmbedding, cosineSimilarity } from '../../lib/searchEngine';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;

}

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ segment: DocumentSegment, score: number }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { segments, isIndexing, indexingProgress } = useSearchStore();
  const { setActiveDocument } = useFileStore();

  useEffect(() => {
    if (!isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery('');

      setResults([]);

      setError(null);
    }
  }, [isOpen]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setError(null);

    try {
      const queryEmbedding = await generateEmbedding(query);

      const scoredResults = segments
        .filter(s => s.embedding)
        .map(segment => ({
          segment,
          score: cosineSimilarity(queryEmbedding, segment.embedding!)
        }))
        .filter(r => r.score > 0.3) // threshold
        .sort((a, b) => b.score - a.score)
        .slice(0, 10); // top 10

      setResults(scoredResults);
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
            Semantic Multi-PDF Search
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 border-b bg-gray-50">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search across all open documents..."
              className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isIndexing || isSearching}
            />
            <button
              type="submit"
              disabled={!query.trim() || isIndexing || isSearching}
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
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="p-4 bg-red-50 text-red-700 rounded-lg mb-4">
              {error}
            </div>
          )}

          {results.length > 0 ? (
            <div className="space-y-4">
              {results.map(({ segment, score }, index) => (
                <div
                  key={index}
                  className="p-4 border rounded-lg hover:border-blue-500 cursor-pointer transition-colors"
                  onClick={() => handleResultClick(segment.docId)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-blue-600 truncate mr-4">
                      {segment.docName} (Page {segment.pageNumber})
                    </h3>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full whitespace-nowrap">
                      Score: {(score * 100).toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 line-clamp-3">
                    ...{segment.text.substring(0, 300)}...
                  </p>
                </div>
              ))}
            </div>
          ) : query && !isSearching && !isIndexing ? (
            <div className="text-center text-gray-500 py-12">
              No semantic matches found for "{query}".
            </div>
          ) : (
            <div className="text-center text-gray-500 py-12 flex flex-col items-center">
              <SearchIcon className="w-12 h-12 text-gray-300 mb-4" />
              <p>Type a question or phrase to search semantically across all indexed documents.</p>
              <p className="text-sm mt-2">Currently tracking {segments.length} segments across {new Set(segments.map(s => s.docId)).size} documents.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
