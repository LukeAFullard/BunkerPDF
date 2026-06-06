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

  const [cropBox, setCropBox] = useState<{ left: number, top: number, right: number, bottom: number } | null>(null);
  // pdfBox stores the unscaled PDF coordinates (Points)
  const [pdfBox, setPdfBox] = useState<{ left: number, top: number, right: number, bottom: number } | null>(null);
  const [applyPagesMode, setApplyPagesMode] = useState<'current' | 'all' | 'custom'>('current');
  const [customPageRange, setCustomPageRange] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);

  const [resizeHandle, setResizeHandle] = useState<string | null>(null);

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
      const result = await engine.parse(new Uint8Array(bytes.slice(0)));
      if (result && result.pages) {
        setTextItems(result.pages);
      }

      // Load with pdfjs to render
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
    if (pdfDoc) {
      renderPage(currentPage, pdfDoc);
    }
  }, [pdfDoc, currentPage, zoomLevel]);

  // Effect to recalculate cropBox from pdfBox when zoom changes
  useEffect(() => {
    if (pdfBox && pageDimensions && textItems && textItems.length >= currentPage) {
      const liteParsePageRef = textItems[currentPage - 1];
      if (liteParsePageRef) {
        const scaleX = pageDimensions.width / liteParsePageRef.width;
        const scaleY = pageDimensions.height / liteParsePageRef.height;
        setCropBox({
          left: pdfBox.left * scaleX,
          top: pdfBox.top * scaleY,
          right: pdfBox.right * scaleX,
          bottom: pdfBox.bottom * scaleY
        });
      }
    }
  }, [pdfBox, pageDimensions, textItems, currentPage]);

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

      // Initialize crop lines to the edges of the page if they don't exist,
      // otherwise, rescale the cropBox to match the new viewport based on the saved pdfBox.
      if (textItems && textItems.length >= pageNum) {
        const liteParsePageRef = textItems[pageNum - 1];

        setPdfBox(currentPdfBox => {
          if (!currentPdfBox) {
            return {
              left: 0,
              top: 0,
              right: liteParsePageRef.width,
              bottom: liteParsePageRef.height
            };
          }
          return currentPdfBox;
        });

        // Avoid nested state updaters by reading the current ref/state carefully, or
        // relying on the next render pass if needed. Since we don't have a ref for pdfBox,
        // we'll update cropBox based on current pageDimensions and pdfBox in a useEffect,
        // but for initial load, we can set default values.
        setCropBox(currentCropBox => {
          if (!currentCropBox) {
            return {
              left: 0,
              top: 0,
              right: viewport.width,
              bottom: viewport.height
            };
          }
          return currentCropBox;
        });
      }

    } catch (err: any) {
      if (err instanceof pdfjsLib.RenderingCancelledException) {
      } else {
        console.error("Error rendering page", err);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const parsePageRange = (rangeStr: string, total: number): number[] => {
    const pages = new Set<number>();
    const parts = rangeStr.split(',');
    for (const part of parts) {
      const p = part.trim();
      if (!p) continue;
      if (p.includes('-')) {
        const [start, end] = p.split('-').map(s => parseInt(s.trim()));
        if (!isNaN(start) && !isNaN(end) && start <= end) {
          for (let i = Math.max(1, start); i <= Math.min(total, end); i++) {
            pages.add(i);
          }
        }
      } else {
        const num = parseInt(p);
        if (!isNaN(num) && num >= 1 && num <= total) {
          pages.add(num);
        }
      }
    }
    return Array.from(pages).sort((a, b) => a - b);
  };

  const getPagesToCheckIndices = (): number[] => {
    if (applyPagesMode === 'all') {
      return Array.from({ length: totalPages }, (_, i) => i);
    } else if (applyPagesMode === 'custom') {
      const selectedPages = parsePageRange(customPageRange, totalPages);
      return selectedPages.map(p => p - 1);
    } else {
      return [currentPage - 1];
    }
  };

  const checkIntersections = (box: { left: number, top: number, right: number, bottom: number }) => {
    if (!textItems || textItems.length < currentPage) return;
    if (!pageDimensions) return;

    const liteParsePageRef = textItems[currentPage - 1];
    const scaleX = liteParsePageRef.width / pageDimensions.width;
    const scaleY = liteParsePageRef.height / pageDimensions.height;

    const lpBox = {
      left: box.left * scaleX,
      top: box.top * scaleY,
      right: box.right * scaleX,
      bottom: box.bottom * scaleY
    };

    let intersects = false;
    let cutCount = 0;

    const indicesToCheck = getPagesToCheckIndices();
    const pagesToCheck = indicesToCheck.map(idx => textItems[idx]).filter(p => p !== undefined);

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

        const boxLeft = lpBox.left;
        const boxRight = lpBox.right;
        const boxTop = lpBox.top;
        const boxBottom = lpBox.bottom;

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
      const pageDesc = applyPagesMode === 'all' ? ' across all pages' : applyPagesMode === 'custom' ? ' across selected pages' : '';
      setWarningMessage(`Warning: The crop area cuts through ${cutCount} text element(s)${pageDesc}.`);
    } else {
      setWarningMessage(null);
    }
  };

  useEffect(() => {
    if (cropBox && (cropBox.right - cropBox.left) > 10 && (cropBox.bottom - cropBox.top) > 10) {
      checkIntersections(cropBox);
    }
  }, [applyPagesMode, customPageRange]);

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    const container = containerRef.current;
    if (!container) return;

    const target = e.target as HTMLElement;
    if (target.dataset.handle) {
      setResizeHandle(target.dataset.handle);
      setIsDragging(true);
      return;
    }

    // We no longer draw a box from scratch, so we don't start dragging without a handle
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging || !containerRef.current || !resizeHandle || !cropBox) return;

    const rect = containerRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const currentX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const currentY = Math.max(0, Math.min(clientY - rect.top, rect.height));

    const updatedCropBox = { ...cropBox };

    if (resizeHandle === 'left') {
      updatedCropBox.left = Math.min(currentX, updatedCropBox.right - 10);
    } else if (resizeHandle === 'right') {
      updatedCropBox.right = Math.max(currentX, updatedCropBox.left + 10);
    } else if (resizeHandle === 'top') {
      updatedCropBox.top = Math.min(currentY, updatedCropBox.bottom - 10);
    } else if (resizeHandle === 'bottom') {
      updatedCropBox.bottom = Math.max(currentY, updatedCropBox.top + 10);
    }

    setCropBox(updatedCropBox);

    if (pageDimensions && textItems.length >= currentPage) {
      const liteParsePageRef = textItems[currentPage - 1];
      const scaleX = liteParsePageRef.width / pageDimensions.width;
      const scaleY = liteParsePageRef.height / pageDimensions.height;

      setPdfBox({
        left: Math.round(updatedCropBox.left * scaleX),
        top: Math.round(updatedCropBox.top * scaleY),
        right: Math.round(updatedCropBox.right * scaleX),
        bottom: Math.round(updatedCropBox.bottom * scaleY)
      });
    }
  };

  const handlePdfBoxChange = (field: 'left' | 'top' | 'right' | 'bottom', value: number) => {
    if (!pdfBox || !pageDimensions || !textItems[currentPage - 1]) return;

    const newPdfBox = { ...pdfBox, [field]: value };

    // Enforce basic constraints
    if (field === 'left') newPdfBox.left = Math.min(newPdfBox.left, newPdfBox.right - 10);
    if (field === 'right') newPdfBox.right = Math.max(newPdfBox.right, newPdfBox.left + 10);
    if (field === 'top') newPdfBox.top = Math.min(newPdfBox.top, newPdfBox.bottom - 10);
    if (field === 'bottom') newPdfBox.bottom = Math.max(newPdfBox.bottom, newPdfBox.top + 10);

    setPdfBox(newPdfBox);

    const liteParsePageRef = textItems[currentPage - 1];
    const scaleX = pageDimensions.width / liteParsePageRef.width;
    const scaleY = pageDimensions.height / liteParsePageRef.height;

    const newCropBox = {
      left: newPdfBox.left * scaleX,
      top: newPdfBox.top * scaleY,
      right: newPdfBox.right * scaleX,
      bottom: newPdfBox.bottom * scaleY
    };

    setCropBox(newCropBox);

    if ((newCropBox.right - newCropBox.left) > 10 && (newCropBox.bottom - newCropBox.top) > 10) {
      checkIntersections(newCropBox);
    }
  };

  const handleMouseUp = () => {
    if (isDragging && cropBox && (cropBox.right - cropBox.left) > 10 && (cropBox.bottom - cropBox.top) > 10) {
      checkIntersections(cropBox);
    }
    setIsDragging(false);
    setResizeHandle(null);
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
        x: cropBox.left * scaleX,
        y: cropBox.top * scaleY,
        width: (cropBox.right - cropBox.left) * scaleX,
        height: (cropBox.bottom - cropBox.top) * scaleY
      };

      let pagesToCrop: number | 'all' | number[] = 'all';
      if (applyPagesMode === 'current') {
        pagesToCrop = currentPage - 1;
      } else if (applyPagesMode === 'custom') {
        pagesToCrop = getPagesToCheckIndices();
      }

      const newBytes = await cropPdfLiteparse(
        new Uint8Array(bytes.slice(0)),
        pagesToCrop,
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

          <div className="w-64 bg-white border-r p-4 flex flex-col gap-4 overflow-y-auto">
            <h3 className="font-semibold text-gray-700 mb-2">Crop Area (pt)</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Left Crop</label>
                <input
                  type="number"
                  value={pdfBox?.left ?? ''}
                  onChange={(e) => handlePdfBoxChange('left', parseFloat(e.target.value) || 0)}
                  disabled={!pdfBox}
                  className="w-full border rounded px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Right Crop</label>
                <input
                  type="number"
                  value={pdfBox?.right ?? ''}
                  onChange={(e) => handlePdfBoxChange('right', parseFloat(e.target.value) || 0)}
                  disabled={!pdfBox}
                  className="w-full border rounded px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Top Crop</label>
                <input
                  type="number"
                  value={pdfBox?.top ?? ''}
                  onChange={(e) => handlePdfBoxChange('top', parseFloat(e.target.value) || 0)}
                  disabled={!pdfBox}
                  className="w-full border rounded px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Bottom Crop</label>
                <input
                  type="number"
                  value={pdfBox?.bottom ?? ''}
                  onChange={(e) => handlePdfBoxChange('bottom', parseFloat(e.target.value) || 0)}
                  disabled={!pdfBox}
                  className="w-full border rounded px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-400"
                />
              </div>
            </div>
          </div>

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
                    <div className="absolute top-0 left-0 right-0 bg-black/30 pointer-events-none" style={{ height: cropBox.top }} />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/30 pointer-events-none" style={{ top: cropBox.bottom }} />
                    <div className="absolute bg-black/30 pointer-events-none" style={{ top: cropBox.top, bottom: 0, left: 0, width: cropBox.left, height: cropBox.bottom - cropBox.top }} />
                    <div className="absolute bg-black/30 pointer-events-none" style={{ top: cropBox.top, bottom: 0, left: cropBox.right, right: 0, height: cropBox.bottom - cropBox.top }} />

                    {/* 4 independent lines for cropping */}
                    {/* Top Line */}
                    <div
                      className="absolute border-t-2 border-blue-500 pointer-events-none"
                      style={{ top: cropBox.top, left: cropBox.left, width: cropBox.right - cropBox.left }}
                    >
                      <div data-handle="top" className="absolute w-full h-6 -top-3 left-0 cursor-ns-resize pointer-events-auto flex items-center justify-center group">
                        <div className="w-8 h-1 bg-blue-500 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                      </div>
                    </div>

                    {/* Bottom Line */}
                    <div
                      className="absolute border-b-2 border-blue-500 pointer-events-none"
                      style={{ top: cropBox.bottom, left: cropBox.left, width: cropBox.right - cropBox.left }}
                    >
                      <div data-handle="bottom" className="absolute w-full h-6 -top-3 left-0 cursor-ns-resize pointer-events-auto flex items-center justify-center group">
                        <div className="w-8 h-1 bg-blue-500 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                      </div>
                    </div>

                    {/* Left Line */}
                    <div
                      className="absolute border-l-2 border-blue-500 pointer-events-none"
                      style={{ left: cropBox.left, top: cropBox.top, height: cropBox.bottom - cropBox.top }}
                    >
                      <div data-handle="left" className="absolute w-6 h-full -left-3 top-0 cursor-ew-resize pointer-events-auto flex items-center justify-center group">
                        <div className="h-8 w-1 bg-blue-500 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                      </div>
                    </div>

                    {/* Right Line */}
                    <div
                      className="absolute border-r-2 border-blue-500 pointer-events-none"
                      style={{ left: cropBox.right, top: cropBox.top, height: cropBox.bottom - cropBox.top }}
                    >
                      <div data-handle="right" className="absolute w-6 h-full -left-3 top-0 cursor-ew-resize pointer-events-auto flex items-center justify-center group">
                        <div className="h-8 w-1 bg-blue-500 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                      </div>
                    </div>
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
            <div className="flex items-center gap-2 mr-4">
              <select
                value={applyPagesMode}
                onChange={(e) => setApplyPagesMode(e.target.value as any)}
                className="border rounded px-2 py-1 text-sm bg-white"
              >
                <option value="current">Current Page</option>
                <option value="all">All Pages</option>
                <option value="custom">Custom Range</option>
              </select>
              {applyPagesMode === 'custom' && (
                <input
                  type="text"
                  placeholder="e.g. 1-3, 5"
                  value={customPageRange}
                  onChange={(e) => setCustomPageRange(e.target.value)}
                  className="border rounded px-2 py-1 text-sm w-32"
                />
              )}
            </div>
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
