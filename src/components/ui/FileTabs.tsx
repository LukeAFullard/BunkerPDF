import { useFileStore } from '../../store/fileStore';
import { PDFThumbnail } from '../pdf/PDFThumbnail';
import { cn } from '../../lib/utils';

export function FileTabs() {
  const documents = useFileStore(state => state.documents);
  const activeDocumentId = useFileStore(state => state.activeDocumentId);
  const setActiveDocument = useFileStore(state => state.setActiveDocument);
  const removeDocument = useFileStore(state => state.removeDocument);

  if (documents.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto border-b border-gray-200">
      {documents.map(doc => {
        const isActive = doc.id === activeDocumentId;
        return (
          <div
            key={doc.id}
            onClick={() => setActiveDocument(doc.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setActiveDocument(doc.id);
              }
            }}
            role="tab"
            aria-selected={isActive}
            tabIndex={0}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-t-lg border-t border-x cursor-pointer min-w-[120px] max-w-[200px] transition-colors relative group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500",
              isActive
                ? "bg-white border-gray-200 shadow-[0_4px_0_0_white] z-10 -mb-[1px]"
                : "bg-gray-50 border-gray-100 hover:bg-gray-100 text-gray-600"
            )}
          >
            <div className="w-6 h-8 flex-shrink-0">
               <PDFThumbnail file={doc.file} width={24} className="h-full rounded-sm" />
            </div>
            <span className="text-sm font-medium truncate flex-1" title={doc.name}>
              {doc.name}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeDocument(doc.id);
              }}
              aria-label={`Close ${doc.name}`}
              className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              title="Close tab"
            >
              &times;
            </button>
          </div>
        );
      })}
    </div>
  );
}
