import { loadPdfDocument } from "../../lib/pdfHelper";
import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';
import { X, Check, Type, ZoomIn, ZoomOut, Loader2, MousePointer2 } from 'lucide-react';
import { useFileStore } from '../../store/fileStore';
import { cleanupPdfResources } from '../../lib/pdfCleanup';
import { getConfiguredLiteParse } from '../../lib/liteparseEngine';

export interface EditBox {
  pageNum: number;
  x: number;
  y: number;
  width: number;
  height: number;
  newText: string;
  fontSize?: number;
  lineHeight?: number;
}


interface InteractiveFontSizeNormalizerModalProps {
  isOpen: boolean;
  docId: string | null;
  onClose: () => void;
  onApply: (edits: EditBox[]) => void;
}

export function InteractiveFontSizeNormalizerModal({ isOpen, docId, onClose, onApply }: InteractiveFontSizeNormalizerModalProps) {
  const documents = useFileStore(state => state.documents);
  const doc = documents.find(d => d.id === docId);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [overlayScale, setOverlayScale] = useState(1.0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [liteparseData, setLiteparseData] = useState<any>(null);

  const [minFontSize, setMinFontSize] = useState<number>(12);

  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  const renderPage = async (pageNum: number, pdf: pdfjsLib.PDFDocumentProxy) => {
    setIsLoading(true);
    try {
      if (renderTaskRef.current) {
        await renderTaskRef.current.promise.catch(() => {});
      }

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: zoomLevel });

      const canvas = canvasRef.current;
      if (!canvas) return;

      const context = canvas.getContext('2d');
      if (!context) return;

      const outputScale = window.devicePixelRatio || 1;
      canvas.width = viewport.width * outputScale;
      canvas.height = viewport.height * outputScale;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      context.scale(outputScale, outputScale);
      setOverlayScale(zoomLevel);

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      // @ts-ignore
      renderTaskRef.current = page.render(renderContext);
      await renderTaskRef.current.promise;
    } catch (err: unknown) {
      if (err instanceof pdfjsLib.RenderingCancelledException) return;
      console.error("Render error", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !doc) return;
    setZoomLevel(1.0);
    setLiteparseData(null);
    setCurrentPage(1);

    let isMounted = true;

    const loadPdf = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const arrayBuffer = await doc.file.arrayBuffer();
        const pdf = await loadPdfDocument(arrayBuffer.slice(0)).promise;

        if (!isMounted) {
          pdf.destroy();
          return;
        }

        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);

        try {
          const parser = await getConfiguredLiteParse({ outputFormat: 'json' });
          const result = await parser.parse(new Uint8Array(arrayBuffer.slice(0)));
          if (isMounted) {
            setLiteparseData(JSON.parse(result));
          }
        } catch (lpErr) {
          console.error("LiteParse Error:", lpErr);
          if (isMounted) setError("Failed to extract spatial data via LiteParse.");
        }

        setTimeout(() => {
          if (isMounted) renderPage(1, pdf);
        }, 0);

      } catch (err) {
        console.error("Error loading PDF for font normalizer", err);
        if (isMounted) setError("Failed to load PDF.");
        setIsLoading(false);
      }
    };

    loadPdf();

    return () => {
      isMounted = false;
      // @ts-ignore
      cleanupPdfResources(renderTaskRef, pdfDocRef);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, doc]);

  useEffect(() => {
    if (isOpen && pdfDocRef.current) {
      renderPage(currentPage, pdfDocRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomLevel, currentPage]);

  if (!isOpen || !doc) return null;

  const currentLpPage = liteparseData?.pages?.[currentPage - 1];

  const handleApply = () => {
    if (!liteparseData) return;

    const allEdits: EditBox[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    liteparseData.pages.forEach((pageData: any, pageIndex: number) => {
      if (!pageData.items) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pageData.items.forEach((item: any) => {
        if (item.fontSize && item.fontSize < minFontSize && item.text.trim().length > 0) {
           allEdits.push({
             pageNum: pageIndex + 1,
             x: item.x,
             y: item.y,
             width: item.width,
             height: item.height,
             newText: item.text // Keep the text, the application logic will change the font size
           });
        }
      });
    });

    if (allEdits.length === 0) {
      alert(`No text found smaller than ${minFontSize}pt.`);
      return;
    }

    onApply(allEdits);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
        <div className="p-4 border-b flex justify-between items-center bg-gray-50 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
              <Type size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Interactive Font-Size Normalizer</h2>
              <p className="text-sm text-gray-500 hidden sm:block">Select a minimum font size to normalize tiny text.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 relative bg-gray-100/50 flex flex-col overflow-hidden">
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center space-x-2 bg-white/90 backdrop-blur shadow-sm border rounded-lg p-2">
               <div className="flex items-center space-x-2 px-2 border-r">
                <span className="text-xs font-medium text-gray-500">Min Size: {minFontSize}pt</span>
                <input
                  type="range"
                  min="6" max="24" step="1"
                  value={minFontSize}
                  onChange={(e) => setMinFontSize(Number(e.target.value))}
                  className="w-24 accent-indigo-600"
                />
              </div>

              <div className="flex items-center space-x-1 px-2 border-r">
                <button
                  onClick={() => setZoomLevel(prev => Math.max(0.5, prev - 0.25))}
                  className="p-1.5 hover:bg-gray-100 rounded-md text-gray-600 transition-colors"
                  title="Zoom Out"
                >
                  <ZoomOut size={18} />
                </button>
                <span className="text-sm font-medium w-12 text-center text-gray-600">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  onClick={() => setZoomLevel(prev => Math.min(3.0, prev + 0.25))}
                  className="p-1.5 hover:bg-gray-100 rounded-md text-gray-600 transition-colors"
                  title="Zoom In"
                >
                  <ZoomIn size={18} />
                </button>
              </div>

              <div className="flex items-center space-x-2 px-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage <= 1 || isLoading}
                  className="p-1 hover:bg-gray-100 rounded disabled:opacity-50 text-gray-600"
                >
                  ◀
                </button>
                <span className="text-sm font-medium text-gray-600">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages || isLoading}
                  className="p-1 hover:bg-gray-100 rounded disabled:opacity-50 text-gray-600"
                >
                  ▶
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto flex justify-center items-start p-12 pt-20">
              <div className="relative shadow-lg bg-white inline-block">
                {isLoading && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/50 backdrop-blur-sm">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                  </div>
                )}
                {error && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/90">
                    <div className="text-red-500 font-medium px-4 py-2 bg-red-50 rounded-lg border border-red-200">
                      {error}
                    </div>
                  </div>
                )}
                <canvas ref={canvasRef} className="block select-none" />

                {currentLpPage && !isLoading && (
                  <div
                    className="absolute inset-0 z-10 pointer-events-none"
                    style={{
                      transform: `scale(${overlayScale})`,
                      transformOrigin: 'top left',
                      width: `${currentLpPage.width}px`,
                      height: `${currentLpPage.height}px`
                    }}
                  >
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {currentLpPage.items?.map((item: any, idx: number) => {
                      const isSmall = item.fontSize && item.fontSize < minFontSize;
                      if (!isSmall || item.text.trim().length === 0) return null;

                      return (
                        <div
                          key={`small-${idx}`}
                          className="absolute border-[1.5px] border-amber-500 bg-amber-500/20"
                          style={{
                            left: `${item.x}px`,
                            top: `${item.y}px`,
                            width: `${item.width}px`,
                            height: `${item.height}px`,
                          }}
                          title={`Size: ${item.fontSize?.toFixed(1)}pt\nText: ${item.text}`}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
            <div className="text-sm text-gray-600 flex items-center gap-2">
                <MousePointer2 size={16} className="text-amber-500"/>
                Highlighted text will be normalized to {minFontSize}pt
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={!liteparseData}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm flex items-center space-x-2 disabled:opacity-50"
              >
                <Check size={16} />
                <span>Normalize Fonts ({minFontSize}pt)</span>
              </button>
            </div>
        </div>
      </div>
    </div>
  );
}
