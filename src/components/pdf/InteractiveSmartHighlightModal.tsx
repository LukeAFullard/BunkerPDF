import { loadPdfDocument } from "../../lib/pdfHelper";
import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';
import { X, Highlighter, ZoomIn, ZoomOut, Loader2, Check } from 'lucide-react';
import { useFileStore } from '../../store/fileStore';
import { getConfiguredLiteParse } from '../../lib/liteparseEngine';


export interface HighlightBox {
  pageNum: number;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: [number, number, number];
}

interface InteractiveSmartHighlightModalProps {
  isOpen: boolean;
  docId: string | null;
  onClose: () => void;
  onApply: (boxes: HighlightBox[]) => void;
}

export function InteractiveSmartHighlightModal({ isOpen, docId, onClose, onApply }: InteractiveSmartHighlightModalProps) {
  const documents = useFileStore(state => state.documents);
  const doc = documents.find(d => d.id === docId);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [isLoading, setIsLoading] = useState(false);
  const [hoveredBox, setHoveredBox] = useState<{ x: number, y: number, width: number, height: number, text: string } | null>(null);
  const [selectedBoxes, setSelectedBoxes] = useState<HighlightBox[]>([]);
  const [currentColor, setCurrentColor] = useState<[number, number, number]>([1, 1, 0]); // Yellow

  // Store LiteParse items per page
  const [textItems, setTextItems] = useState<any[]>([]);

  const renderTaskRef = useRef<any>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);

  const [pageDimensions, setPageDimensions] = useState<{ width: number, height: number } | null>(null);


  const loadDocument = async () => {
    setIsLoading(true);
    try {
      const bytes = await doc!.file.arrayBuffer();

      const engine = await getConfiguredLiteParse({ outputFormat: "json" });
      const result = await engine.parse(new Uint8Array(bytes.slice(0)));
      if (result && result.pages) {
        setTextItems(result.pages);
      }

      const loadingTask = loadPdfDocument(bytes.slice(0));
      const pdf = await loadingTask.promise;
      setPdfDoc(pdf);
      setTotalPages(pdf.numPages);
      setCurrentPage(1);
    } catch (err: any) {
      setError(err.message || "Failed to load document");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && doc) {
      setTimeout(() => void loadDocument(), 0);
    } else {
      setTimeout(() => setPdfDoc(null), 0);
      setTimeout(() => setTextItems([]), 0);
      setTimeout(() => setSelectedBoxes([]), 0);
      setTimeout(() => setHoveredBox(null), 0);
    }
  }, [isOpen, doc]);




  const renderPage = async (pageNum: number, pdf: pdfjsLib.PDFDocumentProxy) => {
    setIsLoading(true);
    try {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }

      const page = await pdf.getPage(pageNum);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext('2d');
      if (!context) return;

      const viewportHeight = window.innerHeight * 0.6;
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const baseScale = viewportHeight / unscaledViewport.height;
      const scale = baseScale * zoomLevel;
      const viewport = page.getViewport({ scale });

      setPageDimensions({ width: viewport.width, height: viewport.height });

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
    } catch (err: any) {
      if (err instanceof pdfjsLib.RenderingCancelledException) {
      } else {
        console.error("Error rendering page", err);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (pdfDoc) {
      setTimeout(() => void renderPage(currentPage, pdfDoc), 0);
    }
  }, [pdfDoc, currentPage, zoomLevel]);



  const handleMouseMove = (e: React.MouseEvent) => {
    if (!overlayRef.current || !textItems || textItems.length < currentPage || !pageDimensions) return;

    const rect = overlayRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const pageItems = textItems[currentPage - 1].textItems;
    if (!pageItems) return;

    const liteParsePage = textItems[currentPage - 1];
    const scaleX = pageDimensions.width / liteParsePage.width;
    const scaleY = pageDimensions.height / liteParsePage.height;

    const lpX = x / scaleX;
    const lpY = y / scaleY;

    let closestItem = null;
    let minDistance = Infinity;

    // Find closest item within tolerance, computing distance to center
    // to handle overlapping bounding boxes so individual words can be selected.
    for (const item of pageItems) {
      if (
        lpX >= item.x - 2 &&
        lpX <= item.x + item.width + 2 &&
        lpY >= item.y - 2 &&
        lpY <= item.y + item.height + 2
      ) {
        const centerX = item.x + item.width / 2;
        const centerY = item.y + item.height / 2;
        const dist = Math.sqrt((lpX - centerX) ** 2 + (lpY - centerY) ** 2);

        if (dist < minDistance) {
          minDistance = dist;
          closestItem = item;
        }
      }
    }

    if (closestItem) {
        setHoveredBox({
          x: closestItem.x * scaleX,
          y: closestItem.y * scaleY,
          width: closestItem.width * scaleX,
          height: closestItem.height * scaleY,
          text: closestItem.text
        });
    } else {
        setTimeout(() => setHoveredBox(null), 0);
    }
  };

  const handleClick = () => {
    if (hoveredBox && pageDimensions && textItems.length >= currentPage) {
      const liteParsePage = textItems[currentPage - 1];
      const scaleX = liteParsePage.width / pageDimensions.width;
      const scaleY = liteParsePage.height / pageDimensions.height;

      const newBox: HighlightBox = {
        pageNum: currentPage - 1,
        x: hoveredBox.x * scaleX,
        y: hoveredBox.y * scaleY,
        width: hoveredBox.width * scaleX,
        height: hoveredBox.height * scaleY,
        text: hoveredBox.text,
        color: currentColor
      };

      const existingIndex = selectedBoxes.findIndex(
        b => Math.abs(b.x - newBox.x) < 1 && Math.abs(b.y - newBox.y) < 1 && b.pageNum === newBox.pageNum
      );

      if (existingIndex !== -1) {
        setSelectedBoxes(prev => prev.filter((_, i) => i !== existingIndex));
      } else {
        setSelectedBoxes(prev => [...prev, newBox]);
      }
    }
  };

  const removeBox = (index: number) => {
    setSelectedBoxes(prev => prev.filter((_, i) => i !== index));
  };

  if (!isOpen || !doc) return null;

  const rgbToHex = (r: number, g: number, b: number) => {
    const toHex = (c: number) => Math.round(c * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl flex h-[90vh] overflow-hidden">

        <div className="flex-1 flex flex-col bg-gray-100 relative">
          <div className="p-3 border-b bg-white flex justify-between items-center shadow-sm z-10">
            <div className="flex items-center gap-2">
              <Highlighter className="w-5 h-5 text-yellow-500" />
              <h2 className="font-bold text-gray-800">Smart Highlight</h2>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                 <button onClick={() => setCurrentColor([1, 1, 0])} className={`w-6 h-6 rounded-full bg-yellow-300 ${currentColor[0]===1 && currentColor[1]===1 && currentColor[2]===0 ? 'ring-2 ring-offset-2 ring-gray-800' : ''}`}></button>
                 <button onClick={() => setCurrentColor([0, 1, 0])} className={`w-6 h-6 rounded-full bg-green-400 ${currentColor[0]===0 && currentColor[1]===1 && currentColor[2]===0 ? 'ring-2 ring-offset-2 ring-gray-800' : ''}`}></button>
                 <button onClick={() => setCurrentColor([0, 1, 1])} className={`w-6 h-6 rounded-full bg-cyan-400 ${currentColor[0]===0 && currentColor[1]===1 && currentColor[2]===1 ? 'ring-2 ring-offset-2 ring-gray-800' : ''}`}></button>
                 <button onClick={() => setCurrentColor([1, 0.5, 0.5])} className={`w-6 h-6 rounded-full bg-red-400 ${currentColor[0]===1 && currentColor[1]===0.5 && currentColor[2]===0.5 ? 'ring-2 ring-offset-2 ring-gray-800' : ''}`}></button>
              </div>
              <div className="flex items-center gap-1 border-l pl-4 border-r pr-4">
                <button onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.25))} className="p-1 hover:bg-gray-100 rounded text-gray-600"><ZoomOut className="w-4 h-4" /></button>
                <span className="text-xs font-medium w-12 text-center">{Math.round(zoomLevel * 100)}%</span>
                <button onClick={() => setZoomLevel(z => Math.min(3.0, z + 0.25))} className="p-1 hover:bg-gray-100 rounded text-gray-600"><ZoomIn className="w-4 h-4" /></button>
              </div>
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} className="px-2 py-1 bg-gray-200 rounded disabled:opacity-50">Prev</button>
              <span className="text-sm font-medium">Page {currentPage} of {totalPages}</span>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="px-2 py-1 bg-gray-200 rounded disabled:opacity-50">Next</button>
            </div>
          </div>

          <div className="flex-1 overflow-auto flex justify-center items-center p-6 relative">
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-20">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              </div>
            )}

            {error ? (
              <div className="text-red-500">{error}</div>
            ) : (
              <div className="relative shadow-lg cursor-pointer">
                <canvas ref={canvasRef} className="block" />

                <div
                  ref={overlayRef}
                  className="absolute inset-0"
                  onMouseMove={handleMouseMove}
                  onClick={handleClick}
                  onMouseLeave={() => setHoveredBox(null)}
                >
                  {/* Render hovered box */}
                  {hoveredBox && (
                    <div
                      className="absolute border border-blue-500 bg-blue-500/20 pointer-events-none transition-all duration-75"
                      style={{
                        left: hoveredBox.x,
                        top: hoveredBox.y,
                        width: hoveredBox.width,
                        height: hoveredBox.height
                      }}
                    />
                  )}

                  {/* Render selected boxes for this page */}
                  {selectedBoxes.filter(b => b.pageNum === currentPage - 1).map((box, i) => {
                     // Need to convert back to screen coordinates
                     if (!pageDimensions || !textItems[currentPage - 1]) return null;
                     const liteParsePage = textItems[currentPage - 1];
                     const scaleX = pageDimensions.width / liteParsePage.width;
                     const scaleY = pageDimensions.height / liteParsePage.height;
                     const screenX = box.x * scaleX;
                     const screenY = box.y * scaleY;
                     const screenW = box.width * scaleX;
                     const screenH = box.height * scaleY;

                     return (
                        <div
                          key={i}
                          className="absolute mix-blend-multiply opacity-50 pointer-events-none"
                          style={{
                            left: screenX,
                            top: screenY,
                            width: screenW,
                            height: screenH,
                            backgroundColor: rgbToHex(box.color[0], box.color[1], box.color[2])
                          }}
                        />
                     );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="w-80 border-l bg-white flex flex-col">
          <div className="p-4 border-b">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              Highlights to Apply ({selectedBoxes.length})
            </h3>
            <p className="text-xs text-gray-500 mt-1">Click text blocks to highlight them precisely.</p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-2">
            {selectedBoxes.length === 0 ? (
              <div className="text-center text-sm text-gray-400 mt-10">
                No text selected yet.
              </div>
            ) : (
              selectedBoxes.map((box, i) => (
                <div key={i} className="border rounded p-2 text-sm flex justify-between items-start gap-2 group" style={{backgroundColor: `${rgbToHex(box.color[0], box.color[1], box.color[2])}40`}}>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Pg {box.pageNum + 1}</div>
                    <span className="line-clamp-2 text-gray-800 font-medium">{box.text}</span>
                  </div>
                  <button onClick={() => removeBox(i)} className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="p-4 border-t bg-gray-50 flex flex-col gap-2">
            <button
              onClick={() => onApply(selectedBoxes)}
              disabled={selectedBoxes.length === 0}
              className="w-full py-2 bg-yellow-500 text-white rounded-lg font-medium hover:bg-yellow-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4" />
              Apply Highlights
            </button>
            <button onClick={onClose} className="w-full py-2 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
