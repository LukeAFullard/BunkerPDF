import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';
import { X, Check, Highlighter, Search } from 'lucide-react';
import { useFileStore } from '../../store/fileStore';
import { cleanupPdfResources } from '../../lib/pdfCleanup';
import { useUIStore } from '../../store/uiStore';

// We must specify the worker source for pdfjs-dist.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

interface InteractiveHighlightModalProps {
  isOpen: boolean;
  docId: string | null;
  onClose: () => void;
  onApply: (textsToHighlight: string[]) => void;
}

export function InteractiveHighlightModal({ isOpen, docId, onClose, onApply }: InteractiveHighlightModalProps) {
  const documents = useFileStore(state => state.documents);
  const doc = documents.find(d => d.id === docId);
  const isDarkMode = useUIStore(state => state.isDarkMode);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  interface HighlightData {
    text: string;
    rects: { left: number; top: number; width: number; height: number; page: number }[];
  }
  const [highlights, setHighlights] = useState<HighlightData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  useEffect(() => {
    if (!isOpen || !doc) return;

    let isMounted = true;
    setIsLoading(true);

    const loadPdf = async () => {
      try {
        const arrayBuffer = await doc.file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;

        if (!isMounted) {
           cleanupPdfResources(pdf);
           return;
        }

        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);
        renderPage(currentPage, pdf);
      } catch (err) {
        console.error("Error loading PDF for highlight", err);
        if (isMounted) setError("Failed to load PDF preview.");
        setIsLoading(false);
      }
    };

    loadPdf();

    return () => {
      isMounted = false;
      if (renderTaskRef.current) renderTaskRef.current.cancel();
      if (pdfDocRef.current) cleanupPdfResources(pdfDocRef.current);
      pdfDocRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, docId]); // Deliberately omit currentPage to handle it separately

  useEffect(() => {
    if (isOpen && pdfDocRef.current) {
      renderPage(currentPage, pdfDocRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  const renderPage = async (pageNum: number, pdf: pdfjsLib.PDFDocumentProxy) => {
    setIsLoading(true);
    try {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }

      const page = await pdf.getPage(pageNum);

      const canvas = canvasRef.current;
      const textLayerDiv = textLayerRef.current;
      if (!canvas || !textLayerDiv) return;

      const context = canvas.getContext('2d');
      if (!context) return;

      // Fixed height to fit well in modal, calc scale
      const viewportHeight = window.innerHeight * 0.6;
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const scale = viewportHeight / unscaledViewport.height;
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

      // Setup Text Layer for selection
      textLayerDiv.innerHTML = '';
      textLayerDiv.style.width = `${canvas.style.width}`;
      textLayerDiv.style.height = `${canvas.style.height}`;
      textLayerDiv.style.setProperty('--scale-factor', scale.toString());

      const textContent = await page.getTextContent();

      const textLayer = new pdfjsLib.TextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport: viewport,
      });

      await textLayer.render();

    } catch (err) {
      if (err instanceof pdfjsLib.RenderingCancelledException) {
        // Expected on fast scrolling/page changes
      } else {
        console.error("Error rendering page", err);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      const text = selection.toString().trim();

      const layerRect = textLayerRef.current?.getBoundingClientRect();
      const rects: { left: number; top: number; width: number; height: number; page: number }[] = [];

      if (layerRect) {
        for (let i = 0; i < selection.rangeCount; i++) {
          const range = selection.getRangeAt(i);
          const clientRects = range.getClientRects();
          for (let j = 0; j < clientRects.length; j++) {
            const r = clientRects[j];
            rects.push({
              left: (r.left - layerRect.left) / layerRect.width,
              top: (r.top - layerRect.top) / layerRect.height,
              width: r.width / layerRect.width,
              height: r.height / layerRect.height,
              page: currentPage
            });
          }
        }
      }

      setHighlights(prev => [...prev, { text, rects }]);
      selection.removeAllRanges(); // clear selection after adding
    }
  };

  const removeHighlight = (index: number) => {
    setHighlights(prev => prev.filter((_, i) => i !== index));
  };

  if (!isOpen || !doc) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl flex h-[90vh] overflow-hidden">

        {/* Left Side: PDF Preview */}
        <div className="flex-1 flex flex-col bg-gray-100 relative">
          <div className="p-3 border-b bg-white flex justify-between items-center shadow-sm z-10">
            <div className="flex items-center gap-2">
              <Highlighter className="w-5 h-5 text-blue-600" />
              <h2 className="font-bold text-gray-800">Interactive Highlight</h2>
            </div>

            <div className="flex items-center gap-4">
               <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="px-2 py-1 bg-gray-200 rounded disabled:opacity-50"
              >
                Prev
              </button>
              <span className="text-sm font-medium">Page {currentPage} of {totalPages}</span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="px-2 py-1 bg-gray-200 rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>

          <div
            className="flex-1 overflow-auto flex justify-center items-center p-6 relative"
            onMouseUp={handleSelection}
            onTouchEnd={handleSelection}
          >
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-20">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
            {error ? (
              <div className="text-red-500">{error}</div>
            ) : (
              <div className="relative shadow-lg pdf-preview-container">
                <canvas ref={canvasRef} className="block" style={isDarkMode ? { filter: 'invert(1) hue-rotate(180deg)' } : undefined} />
                <div
                  ref={textLayerRef}
                  className="absolute inset-0 textLayer"
                  style={{ opacity: 0.2 }}
                />
                <div className="absolute inset-0 pointer-events-none" style={{ mixBlendMode: 'multiply' }}>
                  {highlights.filter(h => h.rects.some(r => r.page === currentPage)).map((h, i) => (
                    <div key={i}>
                      {h.rects.filter(r => r.page === currentPage).map((rect, j) => (
                        <div
                          key={j}
                          className="absolute bg-yellow-300 opacity-50"
                          style={{
                            left: `${rect.left * 100}%`,
                            top: `${rect.top * 100}%`,
                            width: `${rect.width * 100}%`,
                            height: `${rect.height * 100}%`,
                          }}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Selected Strings */}
        <div className="w-80 border-l bg-white flex flex-col">
          <div className="p-4 border-b">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <Search className="w-4 h-4" /> Selected Passages
            </h3>
            <p className="text-xs text-gray-500 mt-1">Select text on the document to add it to the highlight queue.</p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-2">
            {highlights.length === 0 ? (
              <div className="text-center text-sm text-gray-400 mt-10">
                No text selected yet.
              </div>
            ) : (
              highlights.map((h, i) => (
                <div key={i} className="bg-yellow-50 border border-yellow-200 rounded p-2 text-sm flex justify-between items-start gap-2 group">
                  <span className="line-clamp-3 text-gray-800 font-medium">{h.text}</span>
                  <button
                    onClick={() => removeHighlight(i)}
                    className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="p-4 border-t bg-gray-50 flex flex-col gap-2">
            <button
              onClick={() => onApply(highlights.map(h => h.text))}
              disabled={highlights.length === 0}
              className="w-full py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4" />
              Apply Highlights
            </button>
            <button
              onClick={onClose}
              className="w-full py-2 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
