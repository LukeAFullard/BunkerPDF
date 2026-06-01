import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';
import { X, TableProperties, ZoomIn, ZoomOut, Loader2, Download, Copy, Check } from 'lucide-react';
import { useFileStore } from '../../store/fileStore';
import { cleanupPdfResources } from '../../lib/pdfCleanup';
import { getConfiguredLiteParse, formatTableFromItems } from '../../lib/liteparseEngine';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

interface InteractiveTableModalProps {
  isOpen: boolean;
  docId: string | null;
  onClose: () => void;
}

export function InteractiveTableModal({ isOpen, docId, onClose }: InteractiveTableModalProps) {
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

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });
  const [selectionBox, setSelectionBox] = useState<{ x: number, y: number, w: number, h: number } | null>(null);

  const [extractedTable, setExtractedTable] = useState<string | null>(null);
  const [format, setFormat] = useState<'csv' | 'markdown'>('csv');
  const [copied, setCopied] = useState(false);

  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  useEffect(() => {
    if (!isOpen || !doc) return;
    setZoomLevel(1.0);
    setLiteparseData(null);
    setSelectionBox(null);
    setExtractedTable(null);
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
          setTimeout(() => {
            if (isMounted) renderPage(1, pdf);
          }, 0);
        }
      } catch (err) {
        console.error("Error loading PDF or LiteParse for interactive table", err);
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
  }, [isOpen, docId]);

  useEffect(() => {
    if (isOpen && pdfDocRef.current && liteparseData) {
      renderPage(currentPage, pdfDocRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, zoomLevel]);

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

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setStartPos({ x, y });
    setCurrentPos({ x, y });
    setIsDrawing(true);
    setSelectionBox(null);
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
      setSelectionBox({ x, y, w, h });
      extractRegion(x, y, w, h);
    }
  };

  const extractRegion = (x: number, y: number, w: number, h: number) => {
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
      // Use our backend function, telling it NOT to require multiple columns,
      // since the user explicitly drew a box around this specific content.
      const tableStr = formatTableFromItems(intersectingItems, format, false);
      setExtractedTable(tableStr);
    } else {
      setExtractedTable(null);
    }
  };

  // Re-run extraction if format changes
  useEffect(() => {
    if (selectionBox) {
      extractRegion(selectionBox.x, selectionBox.y, selectionBox.w, selectionBox.h);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format]);

  const handleCopy = () => {
    if (extractedTable) {
      navigator.clipboard.writeText(extractedTable);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (extractedTable && doc) {
      const blob = new Blob([extractedTable], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc.name}_table_p${currentPage}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  if (!isOpen || !doc) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl flex h-[90vh] overflow-hidden">

        {/* Left Side: PDF Preview */}
        <div className="w-2/3 bg-gray-100 flex flex-col relative">
          <div className="bg-white p-4 flex items-center justify-between shadow-sm z-10 border-b border-gray-200">
            <div>
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <TableProperties className="w-5 h-5 text-indigo-600" />
                Magic Box Extraction
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
                     {liteparseData ? "Rendering Page..." : "Analyzing Layout (LiteParse)..."}
                   </span>
                 </div>
              </div>
            )}

            {error ? (
               <div className="text-red-500 p-4 bg-red-50 rounded-lg">{error}</div>
            ) : (
               <div className="relative shadow-xl ring-1 ring-black/5 select-none" style={{ minWidth: 'max-content' }}>
                  <canvas ref={canvasRef} className="block pointer-events-none" />

                  {/* Drawing Overlay */}
                  <div
                    ref={overlayRef}
                    className="absolute top-0 left-0 w-full h-full cursor-crosshair z-30"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                  >
                    {isDrawing && (
                      <div
                        className="absolute border-2 border-indigo-500 bg-indigo-500/20"
                        style={{
                          left: Math.min(startPos.x, currentPos.x),
                          top: Math.min(startPos.y, currentPos.y),
                          width: Math.abs(currentPos.x - startPos.x),
                          height: Math.abs(currentPos.y - startPos.y)
                        }}
                      />
                    )}

                    {!isDrawing && selectionBox && (
                      <div
                        className="absolute border-2 border-green-500 bg-green-500/10"
                        style={{
                          left: selectionBox.x,
                          top: selectionBox.y,
                          width: selectionBox.w,
                          height: selectionBox.h
                        }}
                      />
                    )}
                  </div>
               </div>
            )}
          </div>

          <div className="bg-white border-t border-gray-200 p-3 flex justify-center items-center gap-4 z-10">
            <button disabled={currentPage <= 1 || isLoading} onClick={() => { setCurrentPage(p => p - 1); setSelectionBox(null); setExtractedTable(null); }} className="px-4 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors">
              Previous
            </button>
            <span className="text-sm font-medium text-gray-600 min-w-[5rem] text-center">{currentPage} / {totalPages}</span>
            <button disabled={currentPage >= totalPages || isLoading} onClick={() => { setCurrentPage(p => p + 1); setSelectionBox(null); setExtractedTable(null); }} className="px-4 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors">
              Next
            </button>
          </div>
        </div>

        {/* Right Side: Extraction Result */}
        <div className="w-1/3 bg-gray-50 flex flex-col border-l border-gray-200">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-white">
             <h3 className="font-bold text-gray-800">Extraction Result</h3>
             <div className="flex bg-gray-100 p-1 rounded-lg">
               <button
                 onClick={() => setFormat('csv')}
                 className={`px-3 py-1 rounded text-xs font-medium transition-colors ${format === 'csv' ? 'bg-white shadow-sm text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
               >
                 CSV
               </button>
               <button
                 onClick={() => setFormat('markdown')}
                 className={`px-3 py-1 rounded text-xs font-medium transition-colors ${format === 'markdown' ? 'bg-white shadow-sm text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
               >
                 Markdown
               </button>
             </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 bg-white">
            {!selectionBox ? (
              <div className="text-center py-12 px-4 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 h-full flex flex-col justify-center">
                <TableProperties className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-500">Draw a box around a table on the PDF to extract it instantly.</p>
              </div>
            ) : !extractedTable ? (
               <div className="text-center py-12 px-4 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 h-full flex flex-col justify-center text-gray-500 text-sm">
                  No text found in that region.
               </div>
            ) : (
              <pre className="text-xs p-4 bg-gray-50 border border-gray-200 rounded-lg overflow-x-auto whitespace-pre-wrap font-mono text-gray-800">
                 {extractedTable}
              </pre>
            )}
          </div>

          <div className="p-4 bg-white border-t border-gray-200 flex gap-3">
             <button
               onClick={handleCopy}
               disabled={!extractedTable}
               className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors"
             >
               {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
               {copied ? 'Copied!' : 'Copy'}
             </button>
             <button
               onClick={handleDownload}
               disabled={!extractedTable}
               className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
             >
               <Download className="w-4 h-4" />
               Save
             </button>
          </div>
        </div>

      </div>
    </div>
  );
}
