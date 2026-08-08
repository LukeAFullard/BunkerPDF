import { loadPdfDocument } from "../../lib/pdfHelper";
import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';
import { X, Check, MousePointer2, ZoomIn, ZoomOut, Loader2 } from 'lucide-react';
import { useFileStore } from '../../store/fileStore';
import { cleanupPdfResources } from '../../lib/pdfCleanup';
import { getConfiguredLiteParse } from '../../lib/liteparseEngine';

// We must specify the worker source for pdfjs-dist.

export interface RedactBox {
  pageNum: number;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
}

interface InteractiveRedactModalProps {
  isOpen: boolean;
  docId: string | null;
  onClose: () => void;
  onApply: (boxes: RedactBox[]) => void;
}

export function InteractiveRedactModal({ isOpen, docId, onClose, onApply }: InteractiveRedactModalProps) {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [liteparseData, setLiteparseData] = useState<any>(null);
  const [selectedBoxes, setSelectedBoxes] = useState<RedactBox[]>([]);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });

  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  useEffect(() => {
    if (!isOpen || !doc) return;
    setZoomLevel(1.0);
    setLiteparseData(null);
    setSelectedBoxes([]);
    setCurrentPage(1);

    let isMounted = true;
    setIsLoading(true);

    const loadPdfAndLiteparse = async () => {
      try {
        const arrayBuffer = await doc.file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer.slice(0));

        // 1. Load PDF.js for visual rendering
        const loadingTask = loadPdfDocument(arrayBuffer.slice(0));
        const pdf = await loadingTask.promise;

        if (!isMounted) {
           cleanupPdfResources(pdf);
           return;
        }

        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);

        // 2. Load LiteParse for spatial bounding boxes in background
        const engine = await getConfiguredLiteParse({ outputFormat: "json" });
        const result = await engine.parse(bytes);

        if (isMounted) {
          setLiteparseData(result);
          // Wait for state to settle then render
          setTimeout(() => {
            if (isMounted) renderPage(1, pdf, result);
          }, 0);
        }
      } catch (err) {
        console.error("Error loading PDF or LiteParse for interactive redact", err);
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
  }, [isOpen, docId]); // Deliberately omit currentPage

  useEffect(() => {
    if (isOpen && pdfDocRef.current && liteparseData) {
      renderPage(currentPage, pdfDocRef.current, liteparseData);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, zoomLevel]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderPage = async (pageNum: number, pdf: pdfjsLib.PDFDocumentProxy, _lpData: any) => {
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const renderContext: any = {
        canvasContext: context,
        transform: transform as number[] | undefined,
        viewport: viewport,
      };

      renderTaskRef.current = page.render(renderContext);
      await renderTaskRef.current.promise;

      // Layout the LiteParse boxes
      overlayDiv.innerHTML = '';
      overlayDiv.style.width = `${canvas.style.width}`;
      overlayDiv.style.height = `${canvas.style.height}`;

      // Keep track of the scale to map coordinates cleanly later
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toggleBox = (item: any, pageIdx: number) => {
    setSelectedBoxes(prev => {
      const exists = prev.findIndex(b =>
        b.pageNum === pageIdx &&
        b.x === item.x &&
        b.y === item.y
      );
      if (exists !== -1) {
        const next = [...prev];
        next.splice(exists, 1);
        return next;
      }
      return [...prev, {
        pageNum: pageIdx,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        text: item.text
      }];
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setStartPos({ x, y });
    setCurrentPos({ x, y });
    setIsDrawing(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
    setCurrentPos({ x, y });
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    const x = Math.min(startPos.x, currentPos.x);
    const y = Math.min(startPos.y, currentPos.y);
    const w = Math.abs(currentPos.x - startPos.x);
    const h = Math.abs(currentPos.y - startPos.y);

    if (w > 10 && h > 10) {
      extractAndSnapRegion(x, y, w, h);
    }
  };

  const extractAndSnapRegion = (x: number, y: number, w: number, h: number) => {
    if (!liteparseData || overlayScale <= 0) return;

    // Map overlay coordinates back to LiteParse PDF coordinates
    const lpX = x / overlayScale;
    const lpY = y / overlayScale;
    const lpW = w / overlayScale;
    const lpH = h / overlayScale;

    const lpRight = lpX + lpW;
    const lpBottom = lpY + lpH;

    const pageIdx = currentPage - 1;
    const items = liteparseData.pages[pageIdx]?.textItems || [];

    // Filter items that intersect the drawn box
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const intersectingItems = items.filter((item: any) => {
      const itemRight = item.x + item.width;
      const itemBottom = item.y + item.height;
      return !(lpRight < item.x || lpX > itemRight || lpBottom < item.y || lpY > itemBottom);
    });

    if (intersectingItems.length > 0) {
        // Instead of creating one giant composite box that can't be toggled,
        // we add all intersecting individual items to the selected list.
        // This ensures they render and behave exactly like single-clicked items,
        // allowing the user to unselect them easily if they made a mistake.
        setSelectedBoxes(prev => {
           const next = [...prev];
           for (const item of intersectingItems) {
               // Only add if not already selected
               const exists = next.findIndex(b => b.pageNum === pageIdx && b.x === item.x && b.y === item.y);
               if (exists === -1) {
                   next.push({
                       pageNum: pageIdx,
                       x: item.x,
                       y: item.y,
                       width: item.width,
                       height: item.height,
                       text: item.text
                   });
               }
           }
           return next;
        });
    }
  };

  const handleApply = () => {
    if (selectedBoxes.length > 0) {
      onApply(selectedBoxes);
    }
  };

  if (!isOpen || !doc) return null;

  // Render the overlay divs directly in React, driven by state, instead of raw DOM injection.
  const pageIdx = currentPage - 1;
  const currentLpPage = liteparseData?.pages?.[pageIdx];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl flex h-[90vh] overflow-hidden">

        {/* Left Side: PDF Preview */}
        <div className="w-2/3 bg-gray-100 flex flex-col relative">
          {/* Header */}
          <div className="bg-white p-4 flex items-center justify-between shadow-sm z-10 border-b border-gray-200">
            <div>
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <MousePointer2 className="w-5 h-5 text-indigo-600" />
                Point & Click Redact
              </h2>
              <p className="text-sm text-gray-500 truncate max-w-sm" title={doc.name}>
                {doc.name}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center bg-gray-100 rounded-lg p-1">
                 <button
                   onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.2))}
                   className="p-1.5 hover:bg-white rounded shadow-sm text-gray-600 transition-colors"
                   title="Zoom Out"
                 >
                   <ZoomOut className="w-4 h-4" />
                 </button>
                 <span className="text-xs font-medium px-2 min-w-[3rem] text-center">
                   {Math.round(zoomLevel * 100)}%
                 </span>
                 <button
                   onClick={() => setZoomLevel(z => Math.min(5.0, z + 0.2))}
                   className="p-1.5 hover:bg-white rounded shadow-sm text-gray-600 transition-colors"
                   title="Zoom In"
                 >
                   <ZoomIn className="w-4 h-4" />
                 </button>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Canvas Area */}
          <div className="flex-1 overflow-auto relative flex justify-center items-start p-8">
            {isLoading && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/50 backdrop-blur-sm">
                 <div className="flex flex-col items-center gap-3">
                   <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                   <span className="text-sm font-medium text-gray-600">
                     {liteparseData ? "Rendering Page..." : "Analyzing Layout (LiteParse)..."}
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
                     className="absolute top-0 left-0 w-full h-full cursor-crosshair z-30"
                     onMouseDown={handleMouseDown}
                     onMouseMove={handleMouseMove}
                     onMouseUp={handleMouseUp}
                     onMouseLeave={handleMouseUp}
                  >
                     {/* Overlay Interactive LiteParse Boxes */}
                     {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                     {!isLoading && currentLpPage?.textItems && overlayScale > 0 && currentLpPage.textItems.map((item: any, idx: number) => {
                        const isSelected = selectedBoxes.some(b => b.pageNum === pageIdx && b.x === item.x && b.y === item.y);
                        return (
                           <div
                             key={`item-${idx}`}
                             onClick={(e) => {
                               e.stopPropagation();
                               toggleBox(item, pageIdx);
                             }}
                             className={`absolute cursor-pointer rounded-sm border ${
                               isSelected
                                 ? 'bg-black border-black text-transparent opacity-80'
                                 : 'border-transparent hover:bg-red-500/40 hover:border-red-600/50'
                             }`}
                             style={{
                               left: `${item.x * overlayScale}px`,
                               top: `${item.y * overlayScale}px`,
                               width: `${item.width * overlayScale}px`,
                               height: `${item.height * overlayScale}px`,
                             }}
                             title={item.text}
                           />
                        );
                     })}

                     {/* Drawing Selection overlay */}
                     {isDrawing && (
                        <div
                          className="absolute border-2 border-red-500 bg-red-500/20"
                          style={{
                            left: Math.min(startPos.x, currentPos.x),
                            top: Math.min(startPos.y, currentPos.y),
                            width: Math.abs(currentPos.x - startPos.x),
                            height: Math.abs(currentPos.y - startPos.y)
                          }}
                        />
                     )}

                  </div>
               </div>
            )}
          </div>

          {/* Pagination */}
          <div className="bg-white border-t border-gray-200 p-3 flex justify-center items-center gap-4 z-10">
            <button
              disabled={currentPage <= 1 || isLoading}
              onClick={() => setCurrentPage(p => p - 1)}
              className="px-4 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="text-sm font-medium text-gray-600 min-w-[5rem] text-center">
              {currentPage} / {totalPages}
            </span>
            <button
              disabled={currentPage >= totalPages || isLoading}
              onClick={() => setCurrentPage(p => p + 1)}
              className="px-4 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>

        {/* Right Side: Selected Items */}
        <div className="w-1/3 bg-gray-50 flex flex-col border-l border-gray-200">
          <div className="p-6 flex-1 overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Selected for Redaction</h3>
            <p className="text-sm text-gray-600 mb-6">
              Hover over the document and click any text block to mark it for permanent redaction.
            </p>

            {selectedBoxes.length === 0 ? (
              <div className="text-center py-12 px-4 border-2 border-dashed border-gray-300 rounded-xl bg-white">
                <MousePointer2 className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-500">No text blocks selected.</p>
                <p className="text-xs text-gray-400 mt-1">Click blocks on the left to add them here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedBoxes.map((box, idx) => (
                  <div key={idx} className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-1 relative group">
                    <button
                      onClick={() => {
                        setSelectedBoxes(prev => prev.filter((_, i) => i !== idx));
                      }}
                      className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-2">
                       <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium">Page {box.pageNum + 1}</span>
                    </div>
                    <p className="text-sm text-gray-800 font-medium line-clamp-2 pr-6">
                       {box.text}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-6 bg-white border-t border-gray-200">
            <button
              onClick={handleApply}
              disabled={selectedBoxes.length === 0}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow active:scale-[0.98]"
            >
              <Check className="w-5 h-5" />
              Apply Redactions
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
