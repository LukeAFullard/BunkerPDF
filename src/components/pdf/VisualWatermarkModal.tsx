import { loadPdfDocument } from "../../lib/pdfHelper";
import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Check, Type, Move } from 'lucide-react';
import { useFileStore } from '../../store/fileStore';
import { cleanupPdfResources } from '../../lib/pdfCleanup';

interface VisualWatermarkModalProps {
  isOpen: boolean;
  docId: string | null;
  onClose: () => void;
  onApply: (text: string, pagesStr: string) => void;
}

export function VisualWatermarkModal({ isOpen, docId, onClose, onApply }: VisualWatermarkModalProps) {
  const documents = useFileStore(state => state.documents);
  const doc = documents.find(d => d.id === docId);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('CONFIDENTIAL');
  const [pagesStr, setPagesStr] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const [viewportCache, setViewportCache] = useState<pdfjsLib.PageViewport | null>(null);

  useEffect(() => {
    if (!isOpen || !doc) return;

    let isMounted = true;
    setIsLoading(true);

    const loadPdf = async () => {
      try {
        const arrayBuffer = await doc.file.arrayBuffer();
        const loadingTask = loadPdfDocument(arrayBuffer.slice(0));
        const pdf = await loadingTask.promise;

        if (!isMounted) {
           cleanupPdfResources(pdf);
           return;
        }

        pdfDocRef.current = pdf;
        renderPage(pdf);
      } catch (err) {
        console.error("Error loading PDF for watermark preview", err);
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
  }, [isOpen, docId]);

  const renderPage = async (pdf: pdfjsLib.PDFDocumentProxy) => {
    setIsLoading(true);
    try {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }

      const page = await pdf.getPage(1); // Preview on first page

      const canvas = canvasRef.current;
      if (!canvas) return;

      const context = canvas.getContext('2d');
      if (!context) return;

      // Fixed height to fit well in modal
      const viewportHeight = window.innerHeight * 0.6;
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const scale = viewportHeight / unscaledViewport.height;
      const viewport = page.getViewport({ scale });
      setViewportCache(viewport);

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
    } catch (err) {
      if (err instanceof pdfjsLib.RenderingCancelledException) {
        // Expected
      } else {
        console.error("Error rendering page", err);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !doc) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl flex h-[80vh] overflow-hidden">

        {/* Left Side: PDF Preview with Watermark Overlay */}
        <div className="flex-1 flex flex-col bg-gray-100 relative">
          <div className="p-3 border-b bg-white flex justify-between items-center shadow-sm z-10">
            <div className="flex items-center gap-2">
              <Type className="w-5 h-5 text-blue-600" />
              <h2 className="font-bold text-gray-800">Visual Watermark</h2>
            </div>
            <span className="text-sm text-gray-500 font-medium">Page 1 Preview</span>
          </div>

          <div className="flex-1 overflow-auto flex justify-center items-center p-6 relative">
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-20">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
            {error ? (
              <div className="text-red-500">{error}</div>
            ) : (
              <div className="relative shadow-lg pointer-events-none select-none">
                <canvas ref={canvasRef} className="block"  />

                {/* CSS Watermark Overlay matching engineA.ts logic (center, 45deg, 0.5 opacity, gray) */}
                {viewportCache && (
                  <div
                    className="absolute inset-0 flex items-center justify-center overflow-hidden"
                  >
                    <div
                      className="whitespace-nowrap"
                      style={{
                        transform: 'rotate(-45deg)', // PDF rotate 45deg counter-clockwise graphically usually maps to -45deg here relative to center
                        fontSize: `${50 * (viewportCache.scale || 1)}px`, // Match engineA scale (size: 50)
                        color: 'rgba(128, 128, 128, 0.5)', // Match engineA (0.5,0.5,0.5 with 0.5 opacity)
                        fontFamily: 'Helvetica, Arial, sans-serif',
                        fontWeight: 'bold',
                        // In engineA it's placed at x: width/4, y: height/2.
                        // CSS centering is close enough for a visual preview.
                      }}
                    >
                      {text || ' '}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Controls */}
        <div className="w-80 border-l bg-white flex flex-col">
          <div className="p-4 border-b">
            <h3 className="font-semibold text-gray-800">Settings</h3>
            <p className="text-xs text-gray-500 mt-1">Configure your watermark.</p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Watermark Text</label>
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="CONFIDENTIAL"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pages (optional)</label>
              <input
                type="text"
                value={pagesStr}
                onChange={(e) => setPagesStr(e.target.value)}
                placeholder="e.g. 1-3, 5 or leave empty for all"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
              />
            </div>

            <div className="bg-blue-50 text-blue-800 p-3 rounded-lg text-xs flex gap-2">
               <Move className="w-4 h-4 shrink-0 mt-0.5" />
               <p>Currently, the watermark position (centered diagonal) is fixed by the processing engine to ensure consistent application across all document sizes.</p>
            </div>
          </div>

          <div className="p-4 border-t bg-gray-50 flex flex-col gap-2">
            <button
              onClick={() => onApply(text, pagesStr)}
              disabled={!text.trim() || isLoading}
              className="w-full py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4" />
              Apply Watermark
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
