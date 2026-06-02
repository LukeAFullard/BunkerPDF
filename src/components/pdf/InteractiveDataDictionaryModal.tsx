import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';
import { X, Download, ZoomIn, ZoomOut, Loader2, Database } from 'lucide-react';
import { useFileStore } from '../../store/fileStore';
import { cleanupPdfResources } from '../../lib/pdfCleanup';
import { getConfiguredLiteParse } from '../../lib/liteparseEngine';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

interface InteractiveDataDictionaryModalProps {
  isOpen: boolean;
  docId: string | null;
  onClose: () => void;
}

interface KeyValuePair {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  label: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
  confidence: number;
}

export function InteractiveDataDictionaryModal({ isOpen, docId, onClose }: InteractiveDataDictionaryModalProps) {
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
  const [extractedPairs, setExtractedPairs] = useState<KeyValuePair[]>([]);

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
    setExtractedPairs([]);

    let isMounted = true;

    const loadPdf = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const arrayBuffer = await doc.file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;

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
            const data = JSON.parse(result);
            setLiteparseData(data);
            extractKeyValuePairs(data, 1);
          }
        } catch (lpErr) {
          console.error("LiteParse Error:", lpErr);
          if (isMounted) setError("Failed to extract spatial data via LiteParse.");
        }

        setTimeout(() => {
          if (isMounted) renderPage(1, pdf);
        }, 0);

      } catch (err) {
        console.error("Error loading PDF for data dictionary", err);
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extractKeyValuePairs = (data: any, pageNum: number) => {
      if (!data || !data.pages || !data.pages[pageNum - 1]) return;
      const items = data.pages[pageNum - 1].items || [];

      const pairs: KeyValuePair[] = [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const potentialLabels = items.filter((item: any) => item.text.trim().endsWith(':'));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      potentialLabels.forEach((labelItem: any) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rightCandidates = items.filter((item: any) =>
              Math.abs(item.y - labelItem.y) < 5 &&
              item.x > labelItem.x + labelItem.width &&
              item.text.trim().length > 0
          );

          if (rightCandidates.length > 0) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              rightCandidates.sort((a: any, b: any) => a.x - b.x);
              pairs.push({
                  label: labelItem,
                  value: rightCandidates[0],
                  confidence: 1.0 // Heuristic confidence
              });
          }
      });

      setExtractedPairs(pairs);
  };

  useEffect(() => {
    if (isOpen && pdfDocRef.current) {
      renderPage(currentPage, pdfDocRef.current);
      if (liteparseData) {
          extractKeyValuePairs(liteparseData, currentPage);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomLevel, currentPage]);

  if (!isOpen || !doc) return null;

  const currentLpPage = liteparseData?.pages?.[currentPage - 1];

  const handleExport = () => {
      if (extractedPairs.length === 0) return;

      const dict: Record<string, string> = {};
      extractedPairs.forEach(p => {
          const key = p.label.text.replace(/:$/, '').trim();
          dict[key] = p.value.text.trim();
      });

      const jsonString = JSON.stringify(dict, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc.name.replace('.pdf', '')}_data_dict.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
        <div className="p-4 border-b flex justify-between items-center bg-gray-50 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
              <Database size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Visual Data Dictionary</h2>
              <p className="text-sm text-gray-500 hidden sm:block">Automatically pairs labels and values using spatial heuristics.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 relative bg-gray-100/50 flex flex-col overflow-hidden">
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center space-x-2 bg-white/90 backdrop-blur shadow-sm border rounded-lg p-2">

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
                    {extractedPairs.map((pair, idx) => {
                      const label = pair.label;
                      const value = pair.value;

                      return (
                        <div key={`pair-${idx}`}>
                            <div
                                className="absolute border-[1.5px] border-blue-500 bg-blue-500/10"
                                style={{
                                left: `${label.x}px`,
                                top: `${label.y}px`,
                                width: `${label.width}px`,
                                height: `${label.height}px`,
                                }}
                            />
                            <div
                                className="absolute border-[1.5px] border-green-500 bg-green-500/10"
                                style={{
                                left: `${value.x}px`,
                                top: `${value.y}px`,
                                width: `${value.width}px`,
                                height: `${value.height}px`,
                                }}
                            />
                            <svg className="absolute inset-0 overflow-visible w-full h-full">
                                <line
                                    x1={label.x + label.width}
                                    y1={label.y + label.height / 2}
                                    x2={value.x}
                                    y2={value.y + value.height / 2}
                                    stroke="#8b5cf6"
                                    strokeWidth="1.5"
                                    strokeDasharray="4"
                                />
                            </svg>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="w-80 bg-white border-l overflow-y-auto flex flex-col shadow-inner">
             <div className="p-4 border-b sticky top-0 bg-white/95 backdrop-blur z-10">
                 <h3 className="font-semibold text-gray-800">Extracted Pairs</h3>
                 <p className="text-xs text-gray-500 mt-1">Found {extractedPairs.length} pairs on this page.</p>
             </div>
             <div className="p-4 flex-1 space-y-3">
                 {extractedPairs.length === 0 ? (
                     <p className="text-sm text-gray-500 text-center py-8">No key-value pairs detected.</p>
                 ) : (
                    extractedPairs.map((pair, i) => (
                        <div key={i} className="bg-gray-50 p-3 rounded-lg border text-sm">
                            <div className="font-medium text-blue-700 mb-1">{pair.label.text}</div>
                            <div className="text-green-700 break-words">{pair.value.text}</div>
                        </div>
                    ))
                 )}
             </div>
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
            <div className="text-sm text-gray-600 flex items-center gap-2">
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
              >
                Close
              </button>
              <button
                onClick={handleExport}
                disabled={extractedPairs.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm flex items-center space-x-2 disabled:opacity-50"
              >
                <Download size={16} />
                <span>Export JSON</span>
              </button>
            </div>
        </div>
      </div>
    </div>
  );
}
