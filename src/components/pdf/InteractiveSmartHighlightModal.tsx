import { loadPdfDocument } from "../../lib/pdfHelper";
import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';
import { X, Highlighter, ZoomIn, ZoomOut, Loader2, Check } from 'lucide-react';
import { useFileStore } from '../../store/fileStore';
import { getConfiguredLiteParse } from '../../lib/liteparseEngine';



export interface SubBox {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
}

export function splitItemIntoWords(item: Record<string, unknown>): SubBox[] {
  const text = (item.text as string) || '';
  const ix = item.x as number;
  const iy = item.y as number;
  const iw = item.width as number;
  const ih = item.height as number;

  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return [];
  if (words.length === 1) {
    return [{ x: ix, y: iy, width: iw, height: ih, text: words[0] }];
  }

  const subBoxes: SubBox[] = [];
  const charWidth = iw / text.length;

  let currentX = ix;
  let currentIndex = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const wordIndex = text.indexOf(word, currentIndex);
    const leadingSpaces = wordIndex - currentIndex;

    currentX += leadingSpaces * charWidth;
    const wordWidth = word.length * charWidth;

    subBoxes.push({
      x: currentX,
      y: iy,
      width: wordWidth,
      height: ih,
      text: word
    });

    currentX += wordWidth;
    currentIndex = wordIndex + word.length;
  }

  return subBoxes;
}

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

  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });

  // Store LiteParse items per page
  const [textItems, setTextItems] = useState<any[]>([]);

  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
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
    } catch (err: unknown) {
      setError((err as Error)?.message || "Failed to load document");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && doc) {
      setTimeout(() => loadDocument(), 0);
    } else {
      setTimeout(() => {
        setPdfDoc(prev => {
          if (prev) prev.destroy();
          return null;
        });
        setTextItems([]);
        setSelectedBoxes([]);
        setHoveredBox(null);
      }, 0);
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

      const renderContext = {
        canvasContext: context,
        transform: transform as number[] | undefined,
        viewport: viewport,
      };

      // @ts-expect-error - The types for pdfjs-dist do not export RenderParameters perfectly, but page.render accepts this shape.
      renderTaskRef.current = page.render(renderContext);
      await renderTaskRef.current.promise;
    } catch (err: unknown) {
      if (err instanceof pdfjsLib.RenderingCancelledException) {
        // Ignored
      } else {
        console.error("Error rendering page", err);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (pdfDoc) {
      setTimeout(() => renderPage(currentPage, pdfDoc), 0);
    }
  }, [pdfDoc, currentPage, zoomLevel]);

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
    if (!overlayRef.current || !textItems || textItems.length < currentPage || !pageDimensions) return;

    const rect = overlayRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isDrawing) {
      setCurrentPos({ x, y });
      return;
    }

    const liteParsePage = textItems[currentPage - 1] as Record<string, unknown>;
    if (!liteParsePage) return;
    const pageItems = liteParsePage.textItems;
    if (!pageItems || !Array.isArray(pageItems)) return;
    const lpWidth = (liteParsePage.width as number) || (liteParsePage.dimensions as any)?.width || pageDimensions.width;
    const lpHeight = (liteParsePage.height as number) || (liteParsePage.dimensions as any)?.height || pageDimensions.height;

    if (!lpWidth || !lpHeight) return;

    const scaleX = pageDimensions.width / lpWidth;
    const scaleY = pageDimensions.height / lpHeight;

    const lpX = x / scaleX;
    const lpY = y / scaleY;

    let hoveredWordBox: SubBox | null = null;

    // Check containment
    for (const item of pageItems as Record<string, unknown>[]) {
      const words = splitItemIntoWords(item);
      for (const wordBox of words) {
        if (lpX >= wordBox.x && lpX <= wordBox.x + wordBox.width &&
            lpY >= wordBox.y && lpY <= wordBox.y + wordBox.height) {
          hoveredWordBox = wordBox;
          break;
        }
      }
      if (hoveredWordBox) break;
    }

    if (hoveredWordBox) {
      setHoveredBox({
        x: hoveredWordBox.x * scaleX,
        y: hoveredWordBox.y * scaleY,
        width: hoveredWordBox.width * scaleX,
        height: hoveredWordBox.height * scaleY,
        text: hoveredWordBox.text
      });
    } else {
      setHoveredBox(null);
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    const x = Math.min(startPos.x, currentPos.x);
    const y = Math.min(startPos.y, currentPos.y);
    const w = Math.abs(currentPos.x - startPos.x);
    const h = Math.abs(currentPos.y - startPos.y);

    if (w > 5 || h > 5) {
      if (!pageDimensions || textItems.length < currentPage) return;
      const liteParsePage = textItems[currentPage - 1] as Record<string, unknown>;
      if (!liteParsePage) return;
      const pageItems = liteParsePage.textItems as Record<string, unknown>[];
      if (!pageItems || !Array.isArray(pageItems)) return;

      const lpWidth = (liteParsePage.width as number) || (liteParsePage.dimensions as any)?.width || pageDimensions.width;
      const lpHeight = (liteParsePage.height as number) || (liteParsePage.dimensions as any)?.height || pageDimensions.height;

      if (!lpWidth || !lpHeight) return;

      const scaleX = pageDimensions.width / lpWidth;
      const scaleY = pageDimensions.height / lpHeight;

      const lpX = x / scaleX;
      const lpY = y / scaleY;
      const lpW = w / scaleX;
      const lpH = h / scaleY;

      const newBoxes: HighlightBox[] = [];

      const lpRight = lpX + lpW;
      const lpBottom = lpY + lpH;

      for (const item of pageItems as Record<string, unknown>[]) {
        const words = splitItemIntoWords(item);
        for (const wordBox of words) {
          const centerX = wordBox.x + wordBox.width / 2;
          const centerY = wordBox.y + wordBox.height / 2;

          // Check if center point is inside the dragged box
          if (centerX >= lpX && centerX <= lpRight && centerY >= lpY && centerY <= lpBottom) {
            const newBox: HighlightBox = {
              pageNum: currentPage - 1,
              x: wordBox.x,
              y: wordBox.y,
              width: wordBox.width,
              height: wordBox.height,
              text: wordBox.text,
              color: currentColor
            };

            const existingIndex = selectedBoxes.findIndex(
              b => Math.abs(b.x - newBox.x) < 1 && Math.abs(b.y - newBox.y) < 1 && b.pageNum === newBox.pageNum
            );

            if (existingIndex === -1 && !newBoxes.some(b => Math.abs(b.x - newBox.x) < 1 && Math.abs(b.y - newBox.y) < 1)) {
              newBoxes.push(newBox);
            }
          }
        }
      }

      if (newBoxes.length > 0) {
        setSelectedBoxes(prev => [...prev, ...newBoxes]);
      }
    } else {
      // It was a click, not a drag
      if (hoveredBox && pageDimensions && textItems.length >= currentPage) {
        const liteParsePage = textItems[currentPage - 1] as Record<string, unknown>;

        const lpWidth = (liteParsePage.width as number) || (liteParsePage.dimensions as any)?.width || pageDimensions.width;
        const lpHeight = (liteParsePage.height as number) || (liteParsePage.dimensions as any)?.height || pageDimensions.height;

        if (!lpWidth || !lpHeight) return;

        const scaleX = pageDimensions.width / lpWidth;
        const scaleY = pageDimensions.height / lpHeight;

        const newBox: HighlightBox = {
          pageNum: currentPage - 1,
          x: hoveredBox.x / scaleX,
          y: hoveredBox.y / scaleY,
          width: hoveredBox.width / scaleX,
          height: hoveredBox.height / scaleY,
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
                <button onClick={() => setZoomLevel(z => Math.min(5.0, z + 0.25))} className="p-1 hover:bg-gray-100 rounded text-gray-600"><ZoomIn className="w-4 h-4" /></button>
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
                  className="absolute inset-0 select-none cursor-crosshair"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={() => {
                    handleMouseUp();
                    setHoveredBox(null);
                  }}
                >
                  {/* Render drawing box */}
                  {isDrawing && (
                    <div
                      className="absolute border-2 border-blue-500 bg-blue-500/20 pointer-events-none"
                      style={{
                        left: Math.min(startPos.x, currentPos.x),
                        top: Math.min(startPos.y, currentPos.y),
                        width: Math.abs(currentPos.x - startPos.x),
                        height: Math.abs(currentPos.y - startPos.y)
                      }}
                    />
                  )}

                  {/* Render hovered box */}
                  {hoveredBox && !isDrawing && (
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
                     const liteParsePage = textItems[currentPage - 1] as Record<string, unknown>;
                     const lpWidth = (liteParsePage.width as number) || (liteParsePage.dimensions as any)?.width || pageDimensions.width;
                     const lpHeight = (liteParsePage.height as number) || (liteParsePage.dimensions as any)?.height || pageDimensions.height;
                     const scaleX = pageDimensions.width / lpWidth;
                     const scaleY = pageDimensions.height / lpHeight;
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
