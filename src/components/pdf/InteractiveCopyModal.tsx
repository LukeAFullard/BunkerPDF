import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';
import { X, Type, ZoomIn, ZoomOut, Loader2, Copy, Check, Image as ImageIcon } from 'lucide-react';
import { useFileStore } from '../../store/fileStore';
import { cleanupPdfResources } from '../../lib/pdfCleanup';
import { getConfiguredLiteParse, formatParagraphFromItems } from '../../lib/liteparseEngine';
import { createWorker } from 'tesseract.js';

interface InteractiveCopyModalProps {
  isOpen: boolean;
  docId: string | null;
  onClose: () => void;
}

export function InteractiveCopyModal({ isOpen, docId, onClose }: InteractiveCopyModalProps) {
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

  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [marginThresholdPercent, setMarginThresholdPercent] = useState(12);
  const [isOcrRunning, setIsOcrRunning] = useState(false);
  const [isHandwritingOcrRunning, setIsHandwritingOcrRunning] = useState(false);

  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tesseractWorkerRef = useRef<any>(null);
  const isInitializingWorkerRef = useRef<boolean>(false);
  const ocrRunIdRef = useRef<number>(0);

  const handwritingWorkerRef = useRef<Worker | null>(null);
  const isInitializingHandwritingWorkerRef = useRef<boolean>(false);
  const handwritingRunIdRef = useRef<number>(0);

  useEffect(() => {
    if (!isOpen || !doc) return;
    setZoomLevel(1.0);
    setLiteparseData(null);
    setSelectionBox(null);
    setExtractedText(null);
    setCurrentPage(1);

    let isMounted = true;
    setIsLoading(true);

    const loadPdfAndLiteparse = async () => {
      try {
        const arrayBuffer = await doc.file.arrayBuffer();

        const engine = await getConfiguredLiteParse({ outputFormat: "json" });
        const result = await engine.parse(new Uint8Array(arrayBuffer.slice(0)));

        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;

        if (!isMounted) {
           cleanupPdfResources(pdf);
           return;
        }

        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);

        if (isMounted) {
          setLiteparseData(result);
          setTimeout(() => {
            if (isMounted) renderPage(1, pdf);
          }, 0);
        }
      } catch (err) {
        console.error("Error loading PDF or LiteParse for interactive copy", err);
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
    return () => {
       if (tesseractWorkerRef.current) {
          tesseractWorkerRef.current.terminate();
          tesseractWorkerRef.current = null;
       }
       if (handwritingWorkerRef.current) {
          handwritingWorkerRef.current.terminate();
          handwritingWorkerRef.current = null;
       }
    };
  }, []);

  const renderPage = async (pageNum: number, pdf: pdfjsLib.PDFDocumentProxy) => {
    if (!canvasRef.current || !overlayRef.current) return;
    setIsLoading(true);

    try {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: zoomLevel * 1.5 });

      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const unzoomedViewport = page.getViewport({ scale: 1.0 });
      setOverlayScale(viewport.width / unzoomedViewport.width);

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      // @ts-expect-error Types mismatch in pdfjs-dist
      const renderTask = page.render(renderContext);
      renderTaskRef.current = renderTask;
      await renderTask.promise;
      setIsLoading(false);

    } catch (err) {
      if (err instanceof Error && err.name === 'RenderingCancelledException') {
        // Expected
      } else {
        console.error("Error rendering page:", err);
        setError("Error rendering PDF page.");
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    if (isOpen && pdfDocRef.current && liteparseData) {
      renderPage(currentPage, pdfDocRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, zoomLevel]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
      // Note: preventDefault can't be called on passive touch listeners in React without a ref or touch-action: none. We will use touch-none in CSS.
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    setStartPos({ x, y });
    setCurrentPos({ x, y });
    setIsDrawing(true);
    setSelectionBox(null);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!isDrawing) return;
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    setCurrentPos({ x, y });
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    const w = Math.abs(currentPos.x - startPos.x);
    const h = Math.abs(currentPos.y - startPos.y);
    const x = Math.min(startPos.x, currentPos.x);
    const y = Math.min(startPos.y, currentPos.y);

    if (w > 10 && h > 10) {
      setSelectionBox({ x, y, w, h });
      extractRegion(x, y, w, h);
    } else {
      setSelectionBox(null);
      setExtractedText(null);
    }
  };

  const extractRegion = (x: number, y: number, w: number, h: number, customThreshold?: number) => {
    if (!liteparseData || overlayScale <= 0) return;

    // Convert overlay pixels to LiteParse units (which are native PDF points usually)
    const lpX = x / overlayScale;
    const lpY = y / overlayScale;
    const lpRight = (x + w) / overlayScale;
    const lpBottom = (y + h) / overlayScale;

    const pageIdx = currentPage - 1;
    const items = liteparseData.pages[pageIdx]?.textItems || [];

    // Calculate page boundaries for header/footer filtering based on user threshold
    const pageHeight = liteparseData.pages[pageIdx]?.height || 0;
    const thresholdFraction = (customThreshold !== undefined ? customThreshold : marginThresholdPercent) / 100;
    const headerThreshold = pageHeight * thresholdFraction;
    const footerThreshold = pageHeight * (1 - thresholdFraction);

    // Filter items that intersect the drawn box
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const intersectingItems = items.filter((item: any) => {
      const itemRight = item.x + item.width;
      const itemBottom = item.y + item.height;
      const isHeader = pageHeight > 0 && item.y < headerThreshold;
      const isFooter = pageHeight > 0 && item.y > footerThreshold;

      if (isHeader || isFooter) return false; // Omit headers and footers

      return !(lpRight < item.x || lpX > itemRight || lpBottom < item.y || lpY > itemBottom);
    });

    if (intersectingItems.length > 0) {
      const textStr = formatParagraphFromItems(intersectingItems);
      setExtractedText(textStr);
    } else {
      setExtractedText(null);
      // Run OCR on the highlighted area
      runOcrOnRegion(x, y, w, h);
    }
  };

  const runOcrOnRegion = async (x: number, y: number, w: number, h: number) => {
    if (!canvasRef.current) return;
    setIsOcrRunning(true);
    setExtractedText(null);
    const runId = ++ocrRunIdRef.current;

    try {
      // Create a temporary canvas to extract the specific region
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) throw new Error('Could not get 2d context for temporary canvas');

      const scaleX = canvasRef.current.width / (canvasRef.current.clientWidth || 1);
      const scaleY = canvasRef.current.height / (canvasRef.current.clientHeight || 1);

      // Set canvas size to the native resolution of the selection region to preserve quality for OCR
      tempCanvas.width = w * scaleX;
      tempCanvas.height = h * scaleY;

      // Draw the selected region from the main canvas onto the temp canvas
      tempCtx.drawImage(
        canvasRef.current,
        x * scaleX, y * scaleY, w * scaleX, h * scaleY, // source (x, y, w, h)
        0, 0, w * scaleX, h * scaleY  // destination (x, y, w, h)
      );

      // Get the image data URL
      const dataUrl = tempCanvas.toDataURL('image/png');

      // Initialize Tesseract worker if not cached
      if (!tesseractWorkerRef.current && !isInitializingWorkerRef.current) {
         isInitializingWorkerRef.current = true;
         try {
            const worker = await createWorker('eng');
            // Check if unmounted during initialization
            if (!document.body.contains(canvasRef.current)) {
                worker.terminate();
            } else {
                tesseractWorkerRef.current = worker;
            }
         } finally {
            isInitializingWorkerRef.current = false;
         }
      }

      // Wait for initialization if another call triggered it
      while (isInitializingWorkerRef.current) {
         await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (!tesseractWorkerRef.current) {
          throw new Error('Failed to initialize Tesseract worker');
      }

      const result = await tesseractWorkerRef.current.recognize(dataUrl);

      // Only process result if this is the most recent run and component is mounted
      if (runId === ocrRunIdRef.current && canvasRef.current) {
        if (result.data && result.data.text) {
          setExtractedText(result.data.text.trim());
        }
      }
    } catch (err) {
      console.error("OCR failed for the region:", err);
      // We can fail silently or show an error
    } finally {
      if (runId === ocrRunIdRef.current) {
         setIsOcrRunning(false);
      }
    }
  };

  const handleCopy = () => {
    if (extractedText) {
      navigator.clipboard.writeText(extractedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const runHandwritingOcrOnRegion = async () => {
    if (!canvasRef.current || !selectionBox) return;
    setIsHandwritingOcrRunning(true);
    setExtractedText(null);
    const runId = ++handwritingRunIdRef.current;

    try {
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) throw new Error('Could not get 2d context for temporary canvas');

      const scaleX = canvasRef.current.width / (canvasRef.current.clientWidth || 1);
      const scaleY = canvasRef.current.height / (canvasRef.current.clientHeight || 1);

      tempCanvas.width = selectionBox.w * scaleX;
      tempCanvas.height = selectionBox.h * scaleY;

      tempCtx.drawImage(
        canvasRef.current,
        selectionBox.x * scaleX, selectionBox.y * scaleY, selectionBox.w * scaleX, selectionBox.h * scaleY,
        0, 0, selectionBox.w * scaleX, selectionBox.h * scaleY
      );

      const dataUrl = tempCanvas.toDataURL('image/png');

      // Initialize worker if needed
      if (!handwritingWorkerRef.current && !isInitializingHandwritingWorkerRef.current) {
        isInitializingHandwritingWorkerRef.current = true;
        try {
          const worker = new Worker(new URL('../../workers/handwritingWorker.ts', import.meta.url), {
            type: 'module'
          });

          await new Promise<void>((resolve, reject) => {
            worker.onmessage = (e) => {
              if (e.data.type === 'INIT_SUCCESS') resolve();
              else if (e.data.type === 'INIT_ERROR') reject(new Error(e.data.error));
            };
            worker.postMessage({ action: 'INIT' });
          });

          if (!document.body.contains(canvasRef.current)) {
             worker.terminate();
          } else {
             handwritingWorkerRef.current = worker;
          }
        } finally {
          isInitializingHandwritingWorkerRef.current = false;
        }
      }

      while (isInitializingHandwritingWorkerRef.current) {
         await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (!handwritingWorkerRef.current) throw new Error('Failed to init handwriting worker');

      const text = await new Promise<string>((resolve, reject) => {
        const handler = (e: MessageEvent) => {
          if (e.data.runId === runId) {
            handwritingWorkerRef.current?.removeEventListener('message', handler);
            if (e.data.type === 'RECOGNIZE_SUCCESS') resolve(e.data.text);
            else if (e.data.type === 'RECOGNIZE_ERROR') reject(new Error(e.data.error));
          }
        };
        handwritingWorkerRef.current!.addEventListener('message', handler);
        handwritingWorkerRef.current!.postMessage({ action: 'RECOGNIZE_HANDWRITING', runId, imageUrl: dataUrl });
      });

      if (runId === handwritingRunIdRef.current && canvasRef.current) {
        setExtractedText(text);
      }

    } catch (err) {
      console.error("Handwriting OCR failed:", err);
      if (runId === handwritingRunIdRef.current) {
        setExtractedText("Failed to recognize handwriting. It might be too complex or the model failed to load.");
      }
    } finally {
      if (runId === handwritingRunIdRef.current) {
         setIsHandwritingOcrRunning(false);
      }
    }
  };

  const handleCopyImage = async () => {
    if (!selectionBox || !canvasRef.current) return;
    try {
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) throw new Error('Could not get 2d context for temporary canvas');

      const scaleX = canvasRef.current.width / (canvasRef.current.clientWidth || 1);
      const scaleY = canvasRef.current.height / (canvasRef.current.clientHeight || 1);

      tempCanvas.width = selectionBox.w * scaleX;
      tempCanvas.height = selectionBox.h * scaleY;

      tempCtx.drawImage(
        canvasRef.current,
        selectionBox.x * scaleX, selectionBox.y * scaleY, selectionBox.w * scaleX, selectionBox.h * scaleY,
        0, 0, selectionBox.w * scaleX, selectionBox.h * scaleY
      );

      tempCanvas.toBlob(async (blob) => {
        if (blob) {
          try {
            await navigator.clipboard.write([
              new ClipboardItem({
                'image/png': blob
              })
            ]);
            setCopiedImage(true);
            setTimeout(() => setCopiedImage(false), 2000);
          } catch (err) {
            console.error('Failed to copy image to clipboard:', err);
          }
        }
      }, 'image/png');
    } catch (err) {
      console.error('Error copying image:', err);
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
                <Type className="w-5 h-5 text-indigo-600" />
                Magic Copy (Preserve Formatting)
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
                    className="absolute top-0 left-0 w-full h-full cursor-crosshair z-30 touch-none"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onTouchStart={handleMouseDown}
                    onTouchMove={handleMouseMove}
                    onTouchEnd={() => handleMouseUp()}
                    onTouchCancel={() => handleMouseUp()}
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
            <button disabled={currentPage <= 1 || isLoading} onClick={() => { setCurrentPage(p => p - 1); setSelectionBox(null); setExtractedText(null); }} className="px-4 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors">
              Previous
            </button>
            <span className="text-sm font-medium text-gray-600 min-w-[5rem] text-center">{currentPage} / {totalPages}</span>
            <button disabled={currentPage >= totalPages || isLoading} onClick={() => { setCurrentPage(p => p + 1); setSelectionBox(null); setExtractedText(null); }} className="px-4 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors">
              Next
            </button>
          </div>
        </div>

        {/* Right Side: Extraction Result */}
        <div className="w-1/3 bg-gray-50 flex flex-col border-l border-gray-200">
          <div className="p-4 border-b border-gray-200 flex flex-col gap-2 bg-white">
             <h3 className="font-bold text-gray-800">Formatting Preserved Copy</h3>
             <div className="flex items-center gap-2">
               <label className="text-xs font-medium text-gray-600 whitespace-nowrap">Header/Footer Omission Margin:</label>
               <input
                 type="range"
                 min="0"
                 max="30"
                 value={marginThresholdPercent}
                 onChange={(e) => {
                   const val = parseInt(e.target.value);
                   setMarginThresholdPercent(val);
                   if (selectionBox) {
                     extractRegion(selectionBox.x, selectionBox.y, selectionBox.w, selectionBox.h, val);
                   }
                 }}
                 className="flex-1 accent-indigo-600"
               />
               <span className="text-xs text-gray-500 font-mono w-6 text-right">{marginThresholdPercent}%</span>
             </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 bg-white">
            {!selectionBox ? (
              <div className="text-center py-12 px-4 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 h-full flex flex-col justify-center">
                <Type className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-500">Draw a box around a paragraph to copy it perfectly flowed, avoiding broken lines.</p>
              </div>
            ) : isOcrRunning || isHandwritingOcrRunning ? (
              <div className="text-center py-12 px-4 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 h-full flex flex-col justify-center items-center">
                 <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
                 <p className="text-sm text-gray-500">
                    {isHandwritingOcrRunning
                      ? "Running AI handwriting recognition (may take a moment)..."
                      : "No text detected. Running OCR on selected region..."}
                 </p>
              </div>
            ) : !extractedText ? (
               <div className="text-center py-12 px-4 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 h-full flex flex-col justify-center text-gray-500 text-sm">
                  No text found in that region.
               </div>
            ) : (
              <pre className="text-sm p-4 bg-gray-50 border border-gray-200 rounded-lg overflow-x-auto whitespace-pre-wrap font-sans text-gray-800 leading-relaxed">
                 {extractedText}
              </pre>
            )}
          </div>

          <div className="p-4 bg-white border-t border-gray-200 flex flex-col gap-3">
             <div className="flex gap-3">
               <button
                 onClick={handleCopy}
                 disabled={!extractedText || isHandwritingOcrRunning}
                 className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm text-sm"
               >
                 {copied ? <Check className="w-4 h-4 text-green-300" /> : <Copy className="w-4 h-4" />}
                 {copied ? 'Text Copied!' : 'Copy Text'}
               </button>
               <button
                 onClick={handleCopyImage}
                 disabled={!selectionBox || isHandwritingOcrRunning}
                 className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-gray-600 text-white rounded-xl font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors shadow-sm text-sm"
               >
                 {copiedImage ? <Check className="w-4 h-4 text-green-300" /> : <ImageIcon className="w-4 h-4" />}
                 {copiedImage ? 'Image Copied!' : 'Copy Image'}
               </button>
             </div>
             <button
               onClick={runHandwritingOcrOnRegion}
               disabled={!selectionBox || isHandwritingOcrRunning}
               className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-white border-2 border-indigo-100 text-indigo-700 rounded-xl font-medium hover:bg-indigo-50 hover:border-indigo-200 disabled:opacity-50 transition-colors shadow-sm text-xs"
             >
               {isHandwritingOcrRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Type className="w-4 h-4" />}
               {isHandwritingOcrRunning ? 'Recognizing...' : 'AI Handwriting Recognition'}
             </button>
          </div>
        </div>

      </div>
    </div>
  );
}
