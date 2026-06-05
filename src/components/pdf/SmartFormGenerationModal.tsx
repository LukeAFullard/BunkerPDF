import { loadPdfDocument } from "../../lib/pdfHelper";
import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';
import { X, LayoutTemplate, ZoomIn, ZoomOut, Loader2, Check, AlertCircle } from 'lucide-react';
import { useFileStore } from '../../store/fileStore';
import { cleanupPdfResources } from '../../lib/pdfCleanup';
import { getConfiguredLiteParse } from '../../lib/liteparseEngine';


interface SmartFormGenerationModalProps {
  isOpen: boolean;
  docId: string | null;
  onClose: () => void;
  onApply: (bytes: Uint8Array) => void;
}

export function SmartFormGenerationModal({ isOpen, docId, onClose, onApply }: SmartFormGenerationModalProps) {
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
  const [detectedForms, setDetectedForms] = useState<{pageNum: number, x: number, y: number, width: number, height: number, label: string}[]>([]);
  const [selectedForms, setSelectedForms] = useState<Set<number>>(new Set());
  const [originalBytes, setOriginalBytes] = useState<Uint8Array | null>(null);

  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  useEffect(() => {
    if (!isOpen || !doc) return;
    setZoomLevel(1.0);
    setLiteparseData(null);
    setDetectedForms([]);
    setSelectedForms(new Set());
    setCurrentPage(1);
    setOriginalBytes(null);

    let isMounted = true;
    setIsLoading(true);

    const loadPdfAndLiteparse = async () => {
      try {
        const arrayBuffer = await doc.file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

        if (isMounted) setOriginalBytes(bytes);

        const loadingTask = loadPdfDocument(arrayBuffer);
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

          // Detect form fields
          const forms: {pageNum: number, x: number, y: number, width: number, height: number, label: string}[] = [];

          if (result.pages) {
            for (let i = 0; i < result.pages.length; i++) {
              const page = result.pages[i];
              if (!page.textItems) continue;

              const items = page.textItems;

              // We look for text that ends in a colon like "Name:" or has an underscore like "Name: ______"
              for (let j = 0; j < items.length; j++) {
                const item = items[j];
                const text = item.text.trim();

                if (text.endsWith(':')) {
                   // Label found. Check if the next item is on the same line and is an underscore or empty space
                   // We'll approximate an empty space by checking the gap to the next item, or assume standard width

                   // Estimate space next to the label
                   forms.push({
                     pageNum: i,
                     x: item.x + item.width + 5, // 5px padding
                     y: item.y,
                     width: 150, // Default width
                     height: item.height + 4,
                     label: text.replace(':', '').trim()
                   });
                } else if (text.includes('____')) {
                   // Underlines found. Convert these directly to form fields
                   forms.push({
                     pageNum: i,
                     x: item.x,
                     y: item.y,
                     width: item.width,
                     height: item.height + 4,
                     label: "Field " + (forms.length + 1)
                   });
                }
              }
            }
          }

          setDetectedForms(forms);
          // By default select all forms
          setSelectedForms(new Set(forms.map((_, i) => i)));

          setTimeout(() => {
            if (isMounted) renderPage(1, pdf, result);
          }, 0);
        }
      } catch (err) {
        console.error("Error loading PDF or LiteParse for forms", err);
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

  const toggleFormSelection = (idx: number) => {
    setSelectedForms(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const handleApply = async () => {
    if (!originalBytes || selectedForms.size === 0) return;
    setIsLoading(true);

    try {
      const { PDFDocument } = await import('pdf-lib');
      const pdfDoc = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
      const form = pdfDoc.getForm();
      const pages = pdfDoc.getPages();

      const formsToApply = detectedForms.filter((_, i) => selectedForms.has(i));

      for (const f of formsToApply) {
        const page = pages[f.pageNum];
        if (!page) continue;
        const { height } = page.getSize();

        // Convert to pdf-lib bottom-left coordinates
        const pdfLibY = height - f.y - f.height;

        const textField = form.createTextField(`field_${f.pageNum}_${f.x}_${f.y}`);
        textField.addToPage(page, {
          x: f.x,
          y: pdfLibY,
          width: f.width,
          height: f.height,
        });
      }

      const modifiedBytes = await pdfDoc.save();
      onApply(modifiedBytes);
    } catch (err) {
      console.error("Error applying forms", err);
      setError("Failed to apply form fields.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !doc) return null;

  const pageIdx = currentPage - 1;
  const pageForms = detectedForms.map((f, i) => ({...f, idx: i})).filter(f => f.pageNum === pageIdx);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl flex h-[90vh] overflow-hidden">

        {/* Left Side: PDF Preview */}
        <div className="w-2/3 bg-gray-100 flex flex-col relative">
          <div className="bg-white p-4 flex items-center justify-between shadow-sm z-10 border-b border-gray-200">
            <div>
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <LayoutTemplate className="w-5 h-5 text-indigo-600" />
                Smart Form Generation
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
                     {originalBytes ? "Applying Forms..." : liteparseData ? "Rendering Page..." : "Analyzing Document..."}
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
                     {/* Overlay Form Boxes */}
                     {!isLoading && overlayScale > 0 && pageForms.map((item) => {
                        const isSelected = selectedForms.has(item.idx);
                        return (
                           <div
                             key={item.idx}
                             onClick={() => toggleFormSelection(item.idx)}
                             className={`absolute cursor-pointer rounded-sm border-2 z-30 transition-colors ${
                               isSelected
                                 ? 'border-green-500 bg-green-500/20 hover:bg-green-500/40'
                                 : 'border-gray-400 border-dashed bg-gray-500/10 hover:bg-gray-500/30'
                             }`}
                             style={{
                               left: `${item.x * overlayScale}px`,
                               top: `${item.y * overlayScale}px`,
                               width: `${item.width * overlayScale}px`,
                               height: `${item.height * overlayScale}px`,
                             }}
                             title={`Form Field: ${item.label}`}
                           />
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

        {/* Right Side: Panel */}
        <div className="w-1/3 bg-gray-50 flex flex-col border-l border-gray-200">
          <div className="p-6 flex-1 overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Detected Fields</h3>
            <p className="text-sm text-gray-600 mb-6">
              Click the highlighted regions on the PDF to select which fillable fields to inject.
            </p>

            {detectedForms.length === 0 ? (
              <div className="text-center py-12 px-4 border-2 border-dashed border-gray-300 rounded-xl bg-white flex flex-col items-center">
                <AlertCircle className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-500">{isLoading ? 'Scanning document...' : 'No form anchors detected.'}</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-between items-center pb-2 border-b border-gray-200">
                   <span className="text-sm font-medium text-gray-700">{selectedForms.size} of {detectedForms.length} selected</span>
                   <div className="flex gap-2">
                      <button onClick={() => setSelectedForms(new Set(detectedForms.map((_, i) => i)))} className="text-xs text-indigo-600 hover:underline font-medium">Select All</button>
                      <button onClick={() => setSelectedForms(new Set())} className="text-xs text-indigo-600 hover:underline font-medium">Clear</button>
                   </div>
                </div>
                {detectedForms.map((f, idx) => (
                  <div key={idx} onClick={() => toggleFormSelection(idx)} className={`p-3 rounded-lg border shadow-sm flex items-center justify-between cursor-pointer transition-colors ${
                     selectedForms.has(idx) ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200 hover:bg-gray-50'
                  }`}>
                    <div className="flex flex-col overflow-hidden">
                       <span className="text-sm font-medium text-gray-800 truncate">{f.label}</span>
                       <span className="text-xs text-gray-500">Page {f.pageNum + 1}</span>
                    </div>
                    {selectedForms.has(idx) && <Check className="w-4 h-4 text-green-600 flex-shrink-0" />}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="p-6 bg-white border-t border-gray-200">
            <button
              onClick={handleApply}
              disabled={selectedForms.size === 0 || isLoading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow active:scale-[0.98]"
            >
              <Check className="w-5 h-5" />
              Apply Fillable Fields
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
