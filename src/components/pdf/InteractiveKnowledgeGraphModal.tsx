import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';
import { X, Network, ZoomIn, ZoomOut, Loader2, Copy, Check, MousePointer2, AlertCircle } from 'lucide-react';
import { useFileStore } from '../../store/fileStore';
import { cleanupPdfResources } from '../../lib/pdfCleanup';
import { getConfiguredLiteParse } from '../../lib/liteparseEngine';
import type { NERWorkerMessage, NERWorkerResponse } from "../../workers/nerWorker";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

interface InteractiveKnowledgeGraphModalProps {
  isOpen: boolean;
  docId: string | null;
  onClose: () => void;
  onRedact: (boxes: { pageNum: number, x: number, y: number, width: number, height: number, text: string }[]) => void;
}

export function InteractiveKnowledgeGraphModal({ isOpen, docId, onClose, onRedact }: InteractiveKnowledgeGraphModalProps) {
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
  const [extractedEntities, setExtractedEntities] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const nerWorkerRef = useRef<Worker | null>(null);

  useEffect(() => {
    if (!isOpen || !doc) return;
    setZoomLevel(1.0);
    setLiteparseData(null);
    setExtractedEntities([]);
    setCurrentPage(1);

    let isMounted = true;
    setIsLoading(true);

    const loadPdfAndLiteparse = async () => {
      try {
        const arrayBuffer = await doc.file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
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
          setLiteparseData(result);

          // Extract text for NER
          let fullText = "";
          if (result.pages) {
            for (const page of result.pages) {
              if (page.textItems) {
                for (const item of page.textItems) {
                  fullText += item.text + " ";
                }
              }
            }
          }

          // Run NER
          if (!nerWorkerRef.current) {
            nerWorkerRef.current = new Worker(
              new URL("../../workers/nerWorker.ts", import.meta.url),
              { type: 'module' }
            );

            nerWorkerRef.current.postMessage({ type: 'INIT' } satisfies NERWorkerMessage);
          }

          nerWorkerRef.current.onmessage = (e: MessageEvent<NERWorkerResponse>) => {
            if (!isMounted) return;
            const res = e.data;
            if (res.type === 'READY') {
              nerWorkerRef.current?.postMessage({
                type: 'EXTRACT',
                text: fullText
              } satisfies NERWorkerMessage);
            } else if (res.type === 'RESULT' && res.result) {
              setExtractedEntities(res.result);
            } else if (res.type === 'ERROR') {
              console.error("NER Error", res.error);
            }
          };

          setTimeout(() => {
            if (isMounted) renderPage(1, pdf, result);
          }, 0);
        }
      } catch (err) {
        console.error("Error loading PDF or LiteParse for KG", err);
        if (isMounted) setError("Failed to load PDF preview or extraction data.");
        setIsLoading(false);
      }
    };

    loadPdfAndLiteparse();

    return () => {
      isMounted = false;
      if (renderTaskRef.current) renderTaskRef.current.cancel();
      if (pdfDocRef.current) cleanupPdfResources(pdfDocRef.current);
      if (nerWorkerRef.current) nerWorkerRef.current.terminate();
      pdfDocRef.current = null;
      nerWorkerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, doc]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderPage = async (pageNum: number, pdf: pdfjsLib.PDFDocumentProxy, lpData: any = liteparseData) => {
    setIsLoading(true);
    try {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }

      const page = await pdf.getPage(pageNum);
      const canvas = canvasRef.current;
      const overlayDiv = overlayRef.current;
      if (!canvas || !overlayDiv || !lpData) return;

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
    if (isOpen && pdfDocRef.current && liteparseData) {
      renderPage(currentPage, pdfDocRef.current, liteparseData);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, zoomLevel]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleRedactItem = (item: any) => {
    onRedact([{
      pageNum: currentPage - 1,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      text: item.text || item.entity
    }]);
    // Optionally close the modal or keep it open
  };

  if (!isOpen || !doc) return null;

  const pageIdx = currentPage - 1;
  const currentLpPage = liteparseData?.pages?.[pageIdx];

  // Map entities to boxes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entityBoxes: any[] = [];
  if (currentLpPage?.textItems && extractedEntities.length > 0) {
    for (const item of currentLpPage.textItems) {
      for (const entity of extractedEntities) {
        if (item.text.includes(entity) || entity.includes(item.text)) {
           entityBoxes.push({ ...item, entity });
           break;
        }
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl flex h-[90vh] overflow-hidden">

        {/* Left Side: PDF Preview */}
        <div className="w-2/3 bg-gray-100 flex flex-col relative">
          <div className="bg-white p-4 flex items-center justify-between shadow-sm z-10 border-b border-gray-200">
            <div>
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Network className="w-5 h-5 text-indigo-600" />
                Interactive Knowledge Graph
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
                   <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                   <span className="text-sm font-medium text-gray-600">
                     {liteparseData ? "Rendering Page..." : "Analyzing Document..."}
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
                     {/* Overlay Entity Boxes */}
                     {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                     {!isLoading && overlayScale > 0 && entityBoxes.map((item: any, idx: number) => {
                        return (
                           <div
                             key={idx}
                             className="absolute cursor-pointer rounded-sm border-2 border-indigo-400 bg-indigo-500/20 hover:bg-indigo-500/40 hover:border-indigo-600 group z-30"
                             style={{
                               left: `${item.x * overlayScale}px`,
                               top: `${item.y * overlayScale}px`,
                               width: `${item.width * overlayScale}px`,
                               height: `${item.height * overlayScale}px`,
                             }}
                             title={`Entity: ${item.entity}`}
                           >
                             <div className="hidden group-hover:flex absolute -top-10 left-1/2 -translate-x-1/2 bg-white shadow-lg rounded-lg border border-gray-200 overflow-hidden z-50">
                               <button onClick={() => handleCopy(item.text)} className="p-2 hover:bg-gray-100 flex items-center gap-1 text-xs font-medium text-gray-700">
                                 <Copy className="w-3 h-3" /> Copy
                               </button>
                               <button onClick={() => handleRedactItem(item)} className="p-2 hover:bg-red-50 flex items-center gap-1 text-xs font-medium text-red-600 border-l border-gray-200">
                                 <MousePointer2 className="w-3 h-3" /> Redact
                               </button>
                             </div>
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

        {/* Right Side: Entities Panel */}
        <div className="w-1/3 bg-gray-50 flex flex-col border-l border-gray-200">
          <div className="p-6 flex-1 overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Detected Entities</h3>
            <p className="text-sm text-gray-600 mb-6">
              Entities found in this document. Interact with them on the left canvas.
            </p>

            {extractedEntities.length === 0 ? (
              <div className="text-center py-12 px-4 border-2 border-dashed border-gray-300 rounded-xl bg-white flex flex-col items-center">
                <AlertCircle className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-500">{isLoading ? 'Scanning document...' : 'No entities detected.'}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {extractedEntities.map((entity, idx) => (
                  <div key={idx} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-800 truncate">{entity}</span>
                    <button
                      onClick={() => handleCopy(entity)}
                      className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                      title="Copy Entity"
                    >
                      {copied === entity ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
