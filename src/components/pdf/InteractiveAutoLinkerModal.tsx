import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';
import { X, Link2, ZoomIn, ZoomOut, Loader2, Check, AlertCircle } from 'lucide-react';
import { useFileStore } from '../../store/fileStore';
import { cleanupPdfResources } from '../../lib/pdfCleanup';
import { getConfiguredLiteParse } from '../../lib/liteparseEngine';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

export interface LinkBox {
  pageNum: number; // 0-indexed
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  url: string;
}

interface InteractiveAutoLinkerModalProps {
  isOpen: boolean;
  docId: string | null;
  onClose: () => void;
  onApplyLinks: (links: LinkBox[]) => void;
}

export function InteractiveAutoLinkerModal({ isOpen, docId, onClose, onApplyLinks }: InteractiveAutoLinkerModalProps) {
  const documents = useFileStore(state => state.documents);
  const doc = documents.find(d => d.id === docId);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [overlayScale, setOverlayScale] = useState(1.0);

  const [linkBoxes, setLinkBoxes] = useState<LinkBox[]>([]);
  const [selectedLinks, setSelectedLinks] = useState<Set<string>>(new Set()); // Store unique identifiers for selected links

  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  useEffect(() => {
    if (!isOpen || !doc) return;
    setZoomLevel(1.0);
    setCurrentPage(1);
    setLinkBoxes([]);
    setSelectedLinks(new Set());

    let isMounted = true;
    setIsLoading(true);

    const loadPdfAndLiteparse = async () => {
      try {
        const arrayBuffer = await doc.file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer.slice(0) });
        const pdf = await loadingTask.promise;

        if (!isMounted) {
           cleanupPdfResources(pdf);
           return;
        }

        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);

        const engine = await getConfiguredLiteParse({ outputFormat: "json" });
        const result = await engine.parse(bytes);

        if (isMounted) {
          const foundLinks: LinkBox[] = [];

          // Regex to find URLs and Emails
          const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;

          if (result.pages) {
            result.pages.forEach((page: any, pageIdx: number) => {
              if (page.textItems) {
                page.textItems.forEach((item: any) => {
                  const text = item.text;
                  if (urlRegex.test(text)) {
                    // Extract the exact URL part
                    const match = text.match(urlRegex);
                    if (match && match[0]) {
                        let url = match[0];
                        // If it's an email or www without http, format it correctly
                        if (url.includes('@') && !url.startsWith('mailto:')) {
                            url = `mailto:${url}`;
                        } else if (url.startsWith('www.')) {
                            url = `https://${url}`;
                        }

                        foundLinks.push({
                            pageNum: pageIdx,
                            x: item.x,
                            y: item.y,
                            width: item.width,
                            height: item.height,
                            text: item.text,
                            url: url
                        });
                    }
                  }
                });
              }
            });
          }

          setLinkBoxes(foundLinks);
          // Auto-select all by default
          setSelectedLinks(new Set(foundLinks.map(l => `${l.pageNum}-${l.x}-${l.y}`)));

          setTimeout(() => {
            if (isMounted) renderPage(1, pdf);
          }, 0);
        }
      } catch (err) {
        console.error("Error loading PDF or LiteParse for AutoLinker", err);
        if (isMounted) setError("Failed to load PDF preview or extraction data.");
        setIsLoading(false);
      }
    };

    loadPdfAndLiteparse();

    return () => {
      isMounted = false;
      if (renderTaskRef.current) renderTaskRef.current.cancel();
      if (pdfDocRef.current) cleanupPdfResources(pdfDocRef.current);
      pdfDocRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, doc]);

  const renderPage = async (pageNum: number, pdf: pdfjsLib.PDFDocumentProxy) => {
    setIsLoading(true);
    try {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }

      const page = await pdf.getPage(pageNum);
      const canvas = canvasRef.current;
      const overlayDiv = overlayRef.current;
      if (!canvas || !overlayDiv) return;

      const context = canvas.getContext('2d');
      if (!context) return;

      const viewportHeight = window.innerHeight * 0.6;
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const baseScale = viewportHeight / unscaledViewport.height;
      const scale = baseScale * zoomLevel;
      const viewport = page.getViewport({ scale });

      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = Math.floor(viewport.width) + "px";
      canvas.style.height = Math.floor(viewport.height) + "px";

      const transform = outputScale !== 1
        ? [outputScale, 0, 0, outputScale, 0, 0]
        : undefined;

      const renderContext: any = {
        canvasContext: context,
        transform: transform as number[] | undefined,
        viewport: viewport,
      };

      renderTaskRef.current = page.render(renderContext);
      await renderTaskRef.current.promise;

      overlayDiv.style.width = `${canvas.style.width}`;
      overlayDiv.style.height = `${canvas.style.height}`;
      setOverlayScale(scale);
      setIsLoading(false);

    } catch (err) {
      if (err instanceof pdfjsLib.RenderingCancelledException) {
        // Expected
      } else {
        console.error("Error rendering page", err);
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    if (isOpen && pdfDocRef.current) {
      renderPage(currentPage, pdfDocRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, zoomLevel]);

  const toggleLinkSelection = (linkId: string) => {
      const newSet = new Set(selectedLinks);
      if (newSet.has(linkId)) {
          newSet.delete(linkId);
      } else {
          newSet.add(linkId);
      }
      setSelectedLinks(newSet);
  }

  const handleApply = () => {
      const linksToApply = linkBoxes.filter(l => selectedLinks.has(`${l.pageNum}-${l.x}-${l.y}`));
      onApplyLinks(linksToApply);
  }

  if (!isOpen || !doc) return null;

  const pageIdx = currentPage - 1;
  const currentPageLinks = linkBoxes.filter(l => l.pageNum === pageIdx);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl flex h-[90vh] overflow-hidden">

        {/* Left Side: PDF Preview */}
        <div className="w-2/3 bg-gray-100 flex flex-col relative">
          <div className="bg-white p-4 flex items-center justify-between shadow-sm z-10 border-b border-gray-200">
            <div>
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Link2 className="w-5 h-5 text-blue-600" />
                Interactive Auto-Linker
              </h2>
              <p className="text-sm text-gray-500 truncate max-w-sm" title={doc.name}>
                {doc.name}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center bg-gray-100 rounded-lg p-1">
                 <button onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.2))} className="p-1.5 hover:bg-white rounded shadow-sm text-gray-600 transition-colors">
                   <ZoomOut className="w-4 h-4" />
                 </button>
                 <span className="text-xs font-medium px-2 min-w-[3rem] text-center">{Math.round(zoomLevel * 100)}%</span>
                 <button onClick={() => setZoomLevel(z => Math.min(3.0, z + 0.2))} className="p-1.5 hover:bg-white rounded shadow-sm text-gray-600 transition-colors">
                   <ZoomIn className="w-4 h-4" />
                 </button>
              </div>
              <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto relative flex justify-center items-start p-8">
            {isLoading && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/50 backdrop-blur-sm">
                 <div className="flex flex-col items-center gap-3">
                   <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                   <span className="text-sm font-medium text-gray-600">
                     Rendering Page...
                   </span>
                 </div>
              </div>
            )}

            {error ? (
               <div className="text-red-500 p-4 bg-red-50 rounded-lg">{error}</div>
            ) : (
               <div className="relative shadow-xl ring-1 ring-black/5" style={{ minWidth: 'max-content' }}>
                  <canvas ref={canvasRef} className="block pointer-events-none" />

                  <div
                     ref={overlayRef}
                     className="absolute top-0 left-0"
                  >
                     {/* Overlay Link Boxes */}
                     {!isLoading && overlayScale > 0 && currentPageLinks.map((item, idx) => {
                        const linkId = `${item.pageNum}-${item.x}-${item.y}`;
                        const isSelected = selectedLinks.has(linkId);

                        return (
                           <div
                             key={idx}
                             onClick={() => toggleLinkSelection(linkId)}
                             className={`absolute cursor-pointer rounded-sm border-2 z-30 transition-colors ${
                                 isSelected
                                 ? 'border-blue-500 bg-blue-500/30 hover:bg-blue-500/50'
                                 : 'border-gray-400 bg-gray-400/20 hover:bg-gray-400/40'
                             }`}
                             style={{
                               left: `${item.x * overlayScale}px`,
                               top: `${item.y * overlayScale}px`,
                               width: `${item.width * overlayScale}px`,
                               height: `${item.height * overlayScale}px`,
                             }}
                             title={`URL: ${item.url}`}
                           >
                               {isSelected && (
                                   <div className="absolute -top-3 -right-3 bg-blue-500 text-white rounded-full p-0.5 shadow-md">
                                       <Check className="w-3 h-3" />
                                   </div>
                               )}
                           </div>
                        );
                     })}
                  </div>
               </div>
            )}
          </div>

          <div className="bg-white border-t border-gray-200 p-3 flex justify-center items-center gap-4 z-10">
            <button disabled={currentPage <= 1 || isLoading} onClick={() => setCurrentPage(p => p - 1)} className="px-4 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors">
              Previous
            </button>
            <span className="text-sm font-medium text-gray-600 min-w-[5rem] text-center">{currentPage} / {totalPages}</span>
            <button disabled={currentPage >= totalPages || isLoading} onClick={() => setCurrentPage(p => p + 1)} className="px-4 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors">
              Next
            </button>
          </div>
        </div>

        {/* Right Side: Links Panel */}
        <div className="w-1/3 bg-gray-50 flex flex-col border-l border-gray-200">
          <div className="p-6 flex-1 flex flex-col">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Detected Links</h3>
            <p className="text-sm text-gray-600 mb-6">
              LiteParse has scanned the document for URLs and email addresses. Select the links you want to make clickable.
            </p>

            <div className="flex-1 overflow-y-auto mb-4">
              {linkBoxes.length === 0 ? (
                <div className="text-center py-12 px-4 border-2 border-dashed border-gray-300 rounded-xl bg-white flex flex-col items-center">
                  <AlertCircle className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">{isLoading ? 'Scanning document...' : 'No links detected.'}</p>
                </div>
              ) : (
                <div className="space-y-2 pb-6">
                  {linkBoxes.map((link, idx) => {
                    const linkId = `${link.pageNum}-${link.x}-${link.y}`;
                    const isSelected = selectedLinks.has(linkId);

                    return (
                        <div
                            key={idx}
                            onClick={() => toggleLinkSelection(linkId)}
                            className={`p-3 rounded-lg border shadow-sm flex items-start gap-3 cursor-pointer transition-colors ${
                                isSelected ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200 hover:bg-gray-50'
                            }`}
                        >
                            <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                                isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300 bg-white'
                            }`}>
                                {isSelected && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <div className="overflow-hidden">
                                <span className="text-sm font-medium text-gray-800 block truncate" title={link.text}>{link.text}</span>
                                <span className="text-xs text-blue-600 block truncate mt-0.5" title={link.url}>{link.url}</span>
                                <span className="text-xs text-gray-400 mt-1 block">Page {link.pageNum + 1}</span>
                            </div>
                        </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-gray-200 mt-auto">
                <div className="flex items-center justify-between mb-4">
                    <span className="text-sm text-gray-600 font-medium">{selectedLinks.size} of {linkBoxes.length} selected</span>
                    <button
                        onClick={() => setSelectedLinks(new Set(linkBoxes.map(l => `${l.pageNum}-${l.x}-${l.y}`)))}
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                        Select All
                    </button>
                </div>
                <button
                    onClick={handleApply}
                    disabled={selectedLinks.size === 0}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
                >
                    <Link2 className="w-5 h-5" />
                    Apply {selectedLinks.size} Links
                </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
