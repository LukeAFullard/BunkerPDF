import { loadPdfDocument } from "../../lib/pdfHelper";
import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';
import { X, Crop, ZoomIn, ZoomOut, Loader2, Check, AlertTriangle } from 'lucide-react';
import { useFileStore } from '../../store/fileStore';
import { getConfiguredLiteParse } from '../../lib/liteparseEngine';
import { cropPdfLiteparse } from '../../lib/liteparseEngine';


interface SmartCropModalProps {
  isOpen: boolean;
  docId: string | null;
  onClose: () => void;
  onApply: (bytes: Uint8Array) => void;
}

export function SmartCropModal({ isOpen, docId, onClose, onApply }: SmartCropModalProps) {
  const documents = useFileStore(state => state.documents);
  const doc = documents.find(d => d.id === docId);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [isLoading, setIsLoading] = useState(false);

  const [textItems, setTextItems] = useState<any[]>([]);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  const [cropBox, setCropBox] = useState<{ x: number, y: number, width: number, height: number } | null>(null);
  const [applyAllPages, setApplyAllPages] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number, y: number } | null>(null);

  const renderTaskRef = useRef<any>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageDimensions, setPageDimensions] = useState<{ width: number, height: number } | null>(null);

  useEffect(() => {
    if (isOpen && doc) {
      loadDocument();
    } else {
      setPdfDoc(null);
      setTextItems([]);
      setCropBox(null);
      setWarningMessage(null);
    }
  }, [isOpen, doc]);

  const loadDocument = async () => {
    setIsLoading(true);
    try {
      const bytes = await doc!.file.arrayBuffer();

      // Load with LiteParse to get spatial data
      const engine = await getConfiguredLiteParse({ outputFormat: "json" });
      const result = await engine.parse(new Uint8Array(bytes));
      if (result && result.pages) {
        setTextItems(result.pages);
      }

      // Load with pdfjs to render
      const loadingTask = loadPdfDocument(bytes);
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
    if (pdfDoc) {
      renderPage(currentPage, pdfDoc);
    }
  }, [pdfDoc, currentPage, zoomLevel]);

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

  const checkIntersections = (box: { x: number, y: number, width: number, height: number }, checkAll: boolean) => {
    if (!textItems || textItems.length < currentPage) return;
    if (!pageDimensions) return;

    // Map drawn box (which is in screen coords) to LiteParse coords
    // LiteParse coords are roughly unscaled pdf space.
    // Let's find scale factors based on current page viewing
    const liteParsePageRef = textItems[currentPage - 1];
    const scaleX = liteParsePageRef.width / pageDimensions.width;
    const scaleY = liteParsePageRef.height / pageDimensions.height;

    const lpBox = {
      x: box.x * scaleX,
      y: box.y * scaleY,
      width: box.width * scaleX,
      height: box.height * scaleY
    };

    let intersects = false;
    let cutCount = 0;

    const pagesToCheck = checkAll ? textItems : [textItems[currentPage - 1]];

    for (const page of pagesToCheck) {
      if (!page || !page.textItems) continue;
      for (const item of page.textItems) {
        // Check if item intersects the boundary of the crop box
        // If the item is completely inside, it's fine. If completely outside, fine (it gets cropped out).
        // But if it straddles the boundary, that's a problem.

        const itemLeft = item.x;
        const itemRight = item.x + item.width;
        const itemTop = item.y;
        const itemBottom = item.y + item.height;

        const boxLeft = lpBox.x;
        const boxRight = lpBox.x + lpBox.width;
        const boxTop = lpBox.y;
        const boxBottom = lpBox.y + lpBox.height;

        // Check horizontal boundary crossing
        const crossesLeft = itemLeft < boxLeft && itemRight > boxLeft && itemBottom > boxTop && itemTop < boxBottom;
        const crossesRight = itemLeft < boxRight && itemRight > boxRight && itemBottom > boxTop && itemTop < boxBottom;

        // Check vertical boundary crossing
        const crossesTop = itemTop < boxTop && itemBottom > boxTop && itemRight > boxLeft && itemLeft < boxRight;
        const crossesBottom = itemTop < boxBottom && itemBottom > boxBottom && itemRight > boxLeft && itemLeft < boxRight;

        if (crossesLeft || crossesRight || crossesTop || crossesBottom) {
          intersects = true;
          cutCount++;
        }
      }
    }

    if (intersects) {
      setWarningMessage(`Warning: The crop area cuts through ${cutCount} text element(s)${checkAll ? ' across all pages' : ''}.`);
    } else {
      setWarningMessage(null);
    }
  };

  useEffect(() => {
    if (cropBox && cropBox.width > 10 && cropBox.height > 10) {
      checkIntersections(cropBox, applyAllPages);
    }
  }, [applyAllPages]);

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    setDragStart({ x, y });
    setCropBox({ x, y, width: 0, height: 0 });
    setIsDragging(true);
    setWarningMessage(null);
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging || !dragStart || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const currentX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const currentY = Math.max(0, Math.min(clientY - rect.top, rect.height));

    const newX = Math.min(dragStart.x, currentX);
    const newY = Math.min(dragStart.y, currentY);
    const newWidth = Math.abs(currentX - dragStart.x);
    const newHeight = Math.abs(currentY - dragStart.y);

    setCropBox({ x: newX, y: newY, width: newWidth, height: newHeight });
  };

  const handleMouseUp = () => {
    if (isDragging && cropBox && cropBox.width > 10 && cropBox.height > 10) {
      checkIntersections(cropBox, applyAllPages);
    } else if (cropBox && (cropBox.width <= 10 || cropBox.height <= 10)) {
      setCropBox(null);
      setWarningMessage(null);
    }
    setIsDragging(false);
  };

  const handleApply = async () => {
    if (!doc || !cropBox || !pageDimensions) return;
    setIsLoading(true);
    try {
      const bytes = await doc.file.arrayBuffer();
      const liteParsePage = textItems[currentPage - 1];
      const scaleX = liteParsePage.width / pageDimensions.width;
      const scaleY = liteParsePage.height / pageDimensions.height;

      const lpBox = {
        x: cropBox.x * scaleX,
        y: cropBox.y * scaleY,
        width: cropBox.width * scaleX,
        height: cropBox.height * scaleY
      };

      const newBytes = await cropPdfLiteparse(
        new Uint8Array(bytes),
        applyAllPages ? 'all' : currentPage - 1,
        lpBox
      );
      onApply(newBytes);
    } catch (err: any) {
      setError(err.message || "Failed to crop PDF");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !doc) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col h-[90vh] overflow-hidden">

        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
              <Crop className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-gray-800 text-lg">Smart Crop</h2>
              <p className="text-xs text-gray-500">Draw a box to crop the page. LiteParse will warn you if you cut through text.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden relative bg-gray-100">

          <div className="flex-1 flex flex-col relative overflow-auto items-center justify-center p-8">
            <div className="mb-4 flex items-center gap-4 bg-white px-4 py-2 rounded-full shadow-sm z-10">
              <button onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.25))} className="p-1 hover:bg-gray-100 rounded">
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium w-12 text-center">{Math.round(zoomLevel * 100)}%</span>
              <button onClick={() => setZoomLevel(z => Math.min(3.0, z + 0.25))} className="p-1 hover:bg-gray-100 rounded">
                <ZoomIn className="w-4 h-4" />
              </button>
              <div className="w-px h-4 bg-gray-300 mx-2" />
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} className="px-2 py-1 bg-gray-100 rounded disabled:opacity-50 text-sm">Prev</button>
              <span className="text-sm font-medium">Page {currentPage} / {totalPages}</span>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="px-2 py-1 bg-gray-100 rounded disabled:opacity-50 text-sm">Next</button>
            </div>

            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-20">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              </div>
            )}

            {error ? (
              <div className="text-red-500 bg-red-50 p-4 rounded-lg">{error}</div>
            ) : (
              <div
                ref={containerRef}
                className="relative shadow-lg cursor-crosshair touch-none"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleMouseDown}
                onTouchMove={handleMouseMove}
                onTouchEnd={handleMouseUp}
              >
                <canvas ref={canvasRef} className="block select-none" />

                {/* Dim overlay outside crop box */}
                {cropBox && (
                  <>
                    <div className="absolute top-0 left-0 right-0 bg-black/30 pointer-events-none" style={{ height: cropBox.y }} />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/30 pointer-events-none" style={{ top: cropBox.y + cropBox.height }} />
                    <div className="absolute bg-black/30 pointer-events-none" style={{ top: cropBox.y, bottom: 0, left: 0, width: cropBox.x, height: cropBox.height }} />
                    <div className="absolute bg-black/30 pointer-events-none" style={{ top: cropBox.y, bottom: 0, left: cropBox.x + cropBox.width, right: 0, height: cropBox.height }} />

                    {/* Crop box border */}
                    <div
                      className="absolute border-2 border-blue-500 bg-blue-500/10 pointer-events-none box-border"
                      style={{
                        left: cropBox.x,
                        top: cropBox.y,
                        width: cropBox.width,
                        height: cropBox.height
                      }}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t bg-white flex justify-between items-center">
          <div className="flex-1">
            {warningMessage && (
              <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-2 rounded-lg text-sm font-medium">
                <AlertTriangle className="w-4 h-4" />
                {warningMessage}
              </div>
            )}
          </div>
          <div className="flex gap-3 items-center">
            <label className="flex items-center gap-2 mr-4 text-sm font-medium text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={applyAllPages}
                onChange={(e) => setApplyAllPages(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              Apply to all pages
            </label>
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={!cropBox || isLoading}
              className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              Apply Crop
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
