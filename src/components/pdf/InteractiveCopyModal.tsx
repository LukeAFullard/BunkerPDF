import { loadPdfDocument } from "../../lib/pdfHelper";
import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';
import { X, Type, ZoomIn, ZoomOut, Loader2, Copy, Check, Image as ImageIcon, ScanText } from 'lucide-react';
import { useFileStore } from '../../store/fileStore';
import { cleanupPdfResources } from '../../lib/pdfCleanup';
import { getConfiguredLiteParse, formatParagraphFromItems, formatMarkdownFromItems } from '../../lib/liteparseEngine';
import type { LineItem } from '../../lib/liteparseEngine';
import type { PyodideWorkerMessage, PyodideWorkerResponse } from '../../workers/pyodideWorker';
import { createWorker } from 'tesseract.js';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { toWordMathML } from '../../lib/latexOcrEngine';

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
  const [imageCopyQuality, setImageCopyQuality] = useState(2);
  const [isCopyingImage, setIsCopyingImage] = useState(false);
  const [marginThresholdPercent, setMarginThresholdPercent] = useState(12);
  const [selectWholeLine, setSelectWholeLine] = useState(false);
  const [copyFormat, setCopyFormat] = useState<'text' | 'markdown'>('text');
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(false);
  const [showExtractedLines, setShowExtractedLines] = useState(false);
  const [extractedLines, setExtractedLines] = useState<LineItem[]>([]);
  const [isOcrRunning, setIsOcrRunning] = useState(false);
  const [isHandwritingRunning, setIsHandwritingRunning] = useState(false);
  const [isLatexRunning, setIsLatexRunning] = useState(false);
  const [latexProgress, setLatexProgress] = useState<{name: string, loaded: number, total: number} | null>(null);
  const [extractionMode, setExtractionMode] = useState<'text' | 'handwriting' | 'equation'>('text');
  const [extractedLatex, setExtractedLatex] = useState<string | null>(null);
  const [latexError, setLatexError] = useState<string | null>(null);
  const [equationConfidence, setEquationConfidence] = useState<number | null>(null);
  const [wasEdited, setWasEdited] = useState(false);

  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tesseractWorkerRef = useRef<any>(null);
  const isInitializingWorkerRef = useRef<boolean>(false);
  const ocrRunIdRef = useRef<number>(0);
  const pyWorkerRef = useRef<Worker | null>(null);

  const handwritingWorkerRef = useRef<Worker | null>(null);
  const isInitializingHandwritingRef = useRef<boolean>(false);
  const handwritingRunIdRef = useRef<number>(0);

  const latexWorkerRef = useRef<Worker | null>(null);
  const isInitializingLatexRef = useRef<boolean>(false);
  const latexRunIdRef = useRef<number>(0);


  useEffect(() => {
    if (!isOpen || !doc) return;
    setTimeout(() => {
      setZoomLevel(1.0);
      setLiteparseData(null);
      setSelectionBox(null);
      setExtractedText(null);
      setExtractedLatex(null);
      setLatexError(null);
      setEquationConfidence(null);
      setWasEdited(false);
      setCurrentPage(1);
    }, 0);

    let isMounted = true;
    setTimeout(() => { if (isMounted) setIsLoading(true); }, 0);

    const loadPdfAndLiteparse = async () => {
      try {
        const arrayBuffer = await doc.file.arrayBuffer();

        const engine = await getConfiguredLiteParse({ outputFormat: "json" });
        const result = await engine.parse(new Uint8Array(arrayBuffer.slice(0)));

        const loadingTask = loadPdfDocument(arrayBuffer.slice(0));
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
       if (pyWorkerRef.current) {
          pyWorkerRef.current.terminate();
          pyWorkerRef.current = null;
       }
       if (latexWorkerRef.current) {
          latexWorkerRef.current.terminate();
          latexWorkerRef.current = null;
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

      const viewportHeight = window.innerHeight * 0.6;
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const baseScale = viewportHeight / unscaledViewport.height;
      const scale = baseScale * zoomLevel;
      const viewport = page.getViewport({ scale });

      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) return;

      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = Math.floor(viewport.width) + "px";
      canvas.style.height = Math.floor(viewport.height) + "px";

      const transform = outputScale !== 1
        ? [outputScale, 0, 0, outputScale, 0, 0]
        : undefined;

      setOverlayScale(scale);

      const renderContext = {
        canvasContext: context,
        transform: transform,
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

  const runHandwritingOnRegion = async (x: number, y: number, w: number, h: number) => {
    if (!canvasRef.current) return;
    setIsHandwritingRunning(true);
    setExtractedText(null);
    const runId = ++handwritingRunIdRef.current;

    try {
      // Create a temporary canvas to extract the specific region
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) throw new Error('Could not get 2d context for temporary canvas');

      const scaleX = canvasRef.current.width / (canvasRef.current.clientWidth || 1);
      const scaleY = canvasRef.current.height / (canvasRef.current.clientHeight || 1);

      // Set canvas size to the native resolution of the selection region
      tempCanvas.width = w * scaleX;
      tempCanvas.height = h * scaleY;

      // Draw the selected region from the main canvas onto the temp canvas
      tempCtx.drawImage(
        canvasRef.current,
        x * scaleX, y * scaleY, w * scaleX, h * scaleY,
        0, 0, w * scaleX, h * scaleY
      );

      const dataUrl = tempCanvas.toDataURL('image/png');

      // Initialize worker if not cached
      if (!handwritingWorkerRef.current && !isInitializingHandwritingRef.current) {
        isInitializingHandwritingRef.current = true;
        try {
          const worker = new Worker(new URL('../../workers/handwritingWorker.ts', import.meta.url), { type: 'module' });
          worker.postMessage({ type: 'INIT', jobId: 'init' });

          await new Promise<void>((resolve, reject) => {
            const handleInit = (e: MessageEvent) => {
              if (e.data.jobId === 'init') {
                if (e.data.type === 'READY') {
                  worker.removeEventListener('message', handleInit);
                  resolve();
                } else if (e.data.type === 'ERROR') {
                  worker.removeEventListener('message', handleInit);
                  reject(new Error(e.data.error));
                }
              }
            };
            worker.addEventListener('message', handleInit);
          });

          // Check if unmounted during initialization
          if (!document.body.contains(canvasRef.current)) {
              worker.terminate();
          } else {
              handwritingWorkerRef.current = worker;
          }
        } finally {
          isInitializingHandwritingRef.current = false;
        }
      }

      // Wait for initialization if another call triggered it
      while (isInitializingHandwritingRef.current) {
         await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (!handwritingWorkerRef.current) {
          throw new Error('Failed to initialize Handwriting worker');
      }

      const jobId = `handwriting-${Date.now()}`;

      const result = await new Promise<string>((resolve, reject) => {
        const handleResult = (e: MessageEvent) => {
          if (e.data.jobId === jobId) {
            handwritingWorkerRef.current?.removeEventListener('message', handleResult);
            if (e.data.type === 'RESULT') {
              resolve(e.data.text);
            } else if (e.data.type === 'ERROR') {
              reject(new Error(e.data.error));
            }
          }
        };
        handwritingWorkerRef.current!.addEventListener('message', handleResult);
        handwritingWorkerRef.current!.postMessage({ type: 'RECOGNIZE', image: dataUrl, jobId });
      });

      // Only process result if this is the most recent run and component is mounted
      if (runId === handwritingRunIdRef.current && canvasRef.current) {
        setExtractedText(result.trim());
      }
    } catch (err) {
      console.error("Handwriting recognition failed for the region:", err);
    } finally {
      if (runId === handwritingRunIdRef.current) {
         setIsHandwritingRunning(false);
      }
    }
  };

  const runEquationOnRegion = async (x: number, y: number, w: number, h: number) => {
    if (!canvasRef.current) return;
    setIsLatexRunning(true);
    setExtractedText(null);
    setExtractedLatex(null);
    setLatexError(null);
    setEquationConfidence(null);
    setWasEdited(false);
    const runId = ++latexRunIdRef.current;

    try {
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) throw new Error('Could not get 2d context for temporary canvas');

      const scaleX = canvasRef.current.width / (canvasRef.current.clientWidth || 1);
      const scaleY = canvasRef.current.height / (canvasRef.current.clientHeight || 1);

      tempCanvas.width = w * scaleX;
      tempCanvas.height = h * scaleY;

      tempCtx.drawImage(
        canvasRef.current,
        x * scaleX, y * scaleY, w * scaleX, h * scaleY,
        0, 0, w * scaleX, h * scaleY
      );

      const dataUrl = tempCanvas.toDataURL('image/png');

      if (!latexWorkerRef.current && !isInitializingLatexRef.current) {
        isInitializingLatexRef.current = true;
        try {
          const worker = new Worker(new URL('../../workers/latexWorker.ts', import.meta.url), { type: 'module' });

          worker.addEventListener('message', (e) => {
             if (e.data.type === 'PROGRESS') {
                setLatexProgress({ name: e.data.name, loaded: e.data.loaded, total: e.data.total });
             }
          });

          worker.postMessage({ type: 'INIT' });

          try {
            await new Promise<void>((resolve, reject) => {
              const handleInit = (e: MessageEvent) => {
                if (e.data.type === 'READY') {
                  worker.removeEventListener('message', handleInit);
                  resolve();
                } else if (e.data.type === 'ERROR') {
                  worker.removeEventListener('message', handleInit);
                  reject(new Error(e.data.error));
                }
              };
              worker.addEventListener('message', handleInit);
            });
          } catch (initErr) {
            worker.terminate();
            throw initErr;
          }

          if (!document.body.contains(canvasRef.current)) {
              worker.terminate();
          } else {
              latexWorkerRef.current = worker;
          }
        } finally {
          isInitializingLatexRef.current = false;
          setLatexProgress(null);
        }
      }

      while (isInitializingLatexRef.current) {
         await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (!latexWorkerRef.current) {
          throw new Error('Failed to initialize Latex worker');
      }

      const result = await new Promise<{ text: string, confidence: number }>((resolve, reject) => {
        const handleResult = (e: MessageEvent) => {
          if (e.data.runId === runId) {
            latexWorkerRef.current?.removeEventListener('message', handleResult);
            if (e.data.type === 'RESULT') {
              resolve({ text: e.data.text, confidence: e.data.confidence });
            } else if (e.data.type === 'ERROR') {
              reject(new Error(e.data.error));
            }
          }
        };
        latexWorkerRef.current!.addEventListener('message', handleResult);
        latexWorkerRef.current!.postMessage({ type: 'RECOGNIZE', payload: { dataUrl, runId } });
      });

      if (runId === latexRunIdRef.current && canvasRef.current) {
        setExtractedLatex(result.text.trim());
        setExtractedText(result.text.trim());
        setEquationConfidence(result.confidence);
      }
    } catch (err) {
      console.error("Equation recognition failed for the region:", err);
      setLatexError(err instanceof Error ? err.message : String(err));
    } finally {
      if (runId === latexRunIdRef.current) {
         setIsLatexRunning(false);
      }
    }
  };

  useEffect(() => {
    if (isOpen && pdfDocRef.current && liteparseData) {
      renderPage(currentPage, pdfDocRef.current);

      // Extract lines for the current page
      if (doc) {
        if (!pyWorkerRef.current) {
          pyWorkerRef.current = new Worker(new URL('../../workers/pyodideWorker.ts', import.meta.url), { type: 'module' });
        }

        const jobId = `lines-${doc.id}-${currentPage}`;

        const handleWorkerMessage = (e: MessageEvent) => {
          const response = e.data as PyodideWorkerResponse;
          if (response.jobId === jobId) {
            if (response.type === 'RESULT') {
              setExtractedLines(response.result as LineItem[]);
            }
            pyWorkerRef.current?.removeEventListener('message', handleWorkerMessage);
          }
        };

        pyWorkerRef.current.addEventListener('message', handleWorkerMessage);

        doc.file.arrayBuffer().then(buffer => {
          pyWorkerRef.current?.postMessage({
            type: 'EXTRACT_LINES',
            jobId,
            pdfBytes: new Uint8Array(buffer),
            pageNum: currentPage
          } as PyodideWorkerMessage);
        });
      }
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

  const handleMouseUp = async () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    const w = Math.abs(currentPos.x - startPos.x);
    const h = Math.abs(currentPos.y - startPos.y);
    const x = Math.min(startPos.x, currentPos.x);
    const y = Math.min(startPos.y, currentPos.y);

    if (w > 10 && h > 10) {
      setSelectionBox({ x, y, w, h });
      if (extractionMode === 'equation') {
        runEquationOnRegion(x, y, w, h);
      } else if (extractionMode === 'handwriting') {
        runHandwritingOnRegion(x, y, w, h);
      } else {
        extractRegion(x, y, w, h);
      }
    } else {
      setSelectionBox(null);
      setExtractedText(null);
      setExtractedLatex(null);
      setLatexError(null);
      setEquationConfidence(null);
      setWasEdited(false);
    }
  };

  const extractRegion = async (x: number, y: number, w: number, h: number, customThreshold?: number, overrideWholeLine?: boolean, overrideFormat?: 'text' | 'markdown') => {
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
    let intersectingItems = items.filter((item: any) => {
      const isHeader = pageHeight > 0 && item.y < headerThreshold;
      const isFooter = pageHeight > 0 && item.y > footerThreshold;

      if (isHeader || isFooter) return false; // Omit headers and footers

      // Only include items whose center falls within the drawn box for precise copying
      const itemCenterX = item.x + item.width / 2;
      const itemCenterY = item.y + item.height / 2;

      return (
        itemCenterX >= lpX &&
        itemCenterX <= lpRight &&
        itemCenterY >= lpY &&
        itemCenterY <= lpBottom
      );
    });

    const isWholeLine = overrideWholeLine !== undefined ? overrideWholeLine : selectWholeLine;

    if (isWholeLine && intersectingItems.length > 0) {
      const rowTolerance = 5;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const expandedItems = items.filter((item: any) => {
         const isHeader = pageHeight > 0 && item.y < headerThreshold;
         const isFooter = pageHeight > 0 && item.y > footerThreshold;
         if (isHeader || isFooter) return false;

         // eslint-disable-next-line @typescript-eslint/no-explicit-any
         return intersectingItems.some((intersectedItem: any) => {
             return Math.abs(intersectedItem.y - item.y) < rowTolerance;
         });
      });
      intersectingItems = expandedItems;
    }

    if (intersectingItems.length > 0) {
      const currentFormat = overrideFormat !== undefined ? overrideFormat : copyFormat;
      const textStr = currentFormat === 'markdown'
        ? formatMarkdownFromItems(intersectingItems, extractedLines)
        : formatParagraphFromItems(intersectingItems);

      // Show text immediately so UX is not blocked
      setExtractedText(textStr);

      // Extract intersecting images using Pyodide
      const startTime = performance.now();

      const doc = useFileStore.getState().documents.find((d: any) => d.id === docId);
      if (doc) {
         try {
             // Use existing engine worker mechanism or at least handle errors and cleanup properly
             // For this proof-of-concept, we'll use a temporary worker but add error handling
             if (!pyWorkerRef.current) {
                 pyWorkerRef.current = new Worker(new URL('../../workers/pyodideWorker.ts', import.meta.url), { type: 'module' });
             }
             const pyWorker = pyWorkerRef.current;
             const jobId = Math.random().toString(36).substring(7);

             pyWorker.onmessage = (e) => {
                 if (e.data.type === "EXTRACT_INTERSECTING_IMAGES_COMPLETE" && e.data.jobId === jobId) {
                     const images = e.data.data;
                     const endTime = performance.now();
                     console.log(`[Image Extraction Timer] PyMuPDF took ${(endTime - startTime).toFixed(2)}ms to find and extract ${images.length} intersecting images.`);

                     if (images.length > 0) {
                         let updatedText = textStr;
                         for (let i = 0; i < images.length; i++) {
                             const img = images[i];
                             const mdImage = `\n\n![Extracted Figure ${i+1}](${img.data})\n\n`;
                             updatedText += mdImage;
                         }
                         setExtractedText(updatedText);
                     }
                     // Do not terminate, keep the worker cached for next selection
                 }
             };

             pyWorker.onerror = (err) => {
                 console.error("Pyodide worker failed:", err);
             };

             pyWorker.postMessage({
                 type: "EXTRACT_INTERSECTING_IMAGES",
                 jobId,
                 pdfBytes: new Uint8Array(await doc.file.arrayBuffer()),
                 pageNum: pageIdx,
                 box: { x: lpX, y: lpY, w: lpRight - lpX, h: lpBottom - lpY }
             });

         } catch (err) {
             console.error("Failed to query Pyodide for images:", err);
         }
      }

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
    setExtractedLatex(null);
    setLatexError(null);
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

  const handleCopyImage = async () => {
    if (!selectionBox || !pdfDocRef.current) return;
    setIsCopyingImage(true);
    try {
      const page = await pdfDocRef.current.getPage(currentPage);

      // Calculate coordinates in unscaled PDF points
      const unscaledX = selectionBox.x / overlayScale;
      const unscaledY = selectionBox.y / overlayScale;
      const unscaledW = selectionBox.w / overlayScale;
      const unscaledH = selectionBox.h / overlayScale;

      const scale = imageCopyQuality;
      const viewport = page.getViewport({ scale });

      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) throw new Error('Could not get 2d context for temporary canvas');

      const outputWidth = Math.ceil(unscaledW * scale);
      const outputHeight = Math.ceil(unscaledH * scale);

      tempCanvas.width = outputWidth;
      tempCanvas.height = outputHeight;

      // Translate context so that (unscaledX, unscaledY) becomes (0, 0)
      const transform = [1, 0, 0, 1, -unscaledX * scale, -unscaledY * scale];

      const renderContext = {
        canvasContext: tempCtx,
        transform: transform,
        viewport: viewport,
      };

      // @ts-expect-error Types mismatch in pdfjs-dist
      await page.render(renderContext).promise;

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
        setIsCopyingImage(false);
      }, 'image/png');
    } catch (err) {
      console.error('Error copying image:', err);
      setIsCopyingImage(false);
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
                 <button onClick={() => setZoomLevel(z => Math.min(5.0, z + 0.2))} className="p-1.5 hover:bg-white rounded shadow-sm text-gray-600 transition-colors">
                   <ZoomIn className="w-4 h-4" />
                 </button>
              </div>
              <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          <div className={`flex-1 overflow-auto relative flex ${zoomLevel > 1.0 ? 'justify-start' : 'justify-center'} items-start p-8`}>
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

                    {showBoundingBoxes && liteparseData?.pages[currentPage - 1]?.textItems?.map((item: any, idx: number) => (
                      <div
                        key={idx}
                        className="absolute border border-blue-400 bg-blue-400/10 pointer-events-none"
                        style={{
                          left: item.x * overlayScale,
                          top: item.y * overlayScale,
                          width: item.width * overlayScale,
                          height: item.height * overlayScale
                        }}
                      />
                    ))}

                    {showExtractedLines && extractedLines.map((line, idx) => {
                      const isHorizontal = line.type === 'horizontal';
                      return (
                        <div
                          key={`line-${idx}`}
                          className="absolute bg-red-500 pointer-events-none"
                          style={{
                            left: line.x0 * overlayScale,
                            top: line.y0 * overlayScale,
                            width: isHorizontal ? Math.max(1, (line.x1 - line.x0) * overlayScale) : 2,
                            height: isHorizontal ? 2 : Math.max(1, (line.y1 - line.y0) * overlayScale)
                          }}
                        />
                      );
                    })}
                  </div>
               </div>
            )}
          </div>

          <div className="bg-white border-t border-gray-200 p-3 flex justify-center items-center gap-4 z-10">
            <button disabled={currentPage <= 1 || isLoading} onClick={() => { setCurrentPage(p => p - 1); setSelectionBox(null); setExtractedText(null); }} className="px-4 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors">
              Previous
            </button>
            <div className="flex items-center gap-2">
              <input
                key={`page-input-${currentPage}`}
                type="number"
                min={1}
                max={totalPages}
                defaultValue={currentPage}
                onBlur={(e) => {
                  let val = parseInt(e.target.value);
                  if (isNaN(val)) {
                    e.target.value = currentPage.toString();
                    return;
                  }
                  if (val < 1) val = 1;
                  if (val > totalPages) val = totalPages;
                  if (val !== currentPage) {
                    setCurrentPage(val);
                    setSelectionBox(null);
                    setExtractedText(null);
                  } else {
                    e.target.value = currentPage.toString();
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  }
                }}
                className="w-16 px-1 py-1 text-center text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
              <span className="text-sm font-medium text-gray-600">/ {totalPages}</span>
            </div>
            <button disabled={currentPage >= totalPages || isLoading} onClick={() => { setCurrentPage(p => p + 1); setSelectionBox(null); setExtractedText(null); }} className="px-4 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors">
              Next
            </button>
          </div>
        </div>

        {/* Right Side: Extraction Result */}
        <div className="w-1/3 bg-gray-50 flex flex-col border-l border-gray-200">
          <div className="p-4 border-b border-gray-200 flex flex-col gap-2 bg-white">
             <div className="flex items-center justify-between mb-2">
                 <h3 className="font-bold text-gray-800">Formatting Preserved Copy</h3>
                 <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                    <button
                      className={`px-2 py-1 text-xs rounded font-medium ${extractionMode === 'text' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                      onClick={() => setExtractionMode('text')}
                    >Text</button>
                    <button
                      className={`px-2 py-1 text-xs rounded font-medium ${extractionMode === 'handwriting' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                      onClick={() => setExtractionMode('handwriting')}
                    >Handwriting</button>
                    <button
                      className={`px-2 py-1 text-xs rounded font-medium ${extractionMode === 'equation' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                      onClick={() => setExtractionMode('equation')}
                    >Equation</button>
                 </div>
             </div>

             {extractionMode === 'text' && (
               <>
             <div className="flex items-center gap-2 justify-between">
               <label className="text-xs font-medium text-gray-600 whitespace-nowrap">Image Copy Quality:</label>
               <select
                 value={imageCopyQuality}
                 onChange={(e) => setImageCopyQuality(parseInt(e.target.value))}
                 className="text-xs border border-gray-300 rounded px-2 py-1 text-gray-700 bg-white"
               >
                 <option value={1}>1x (Standard)</option>
                 <option value={2}>2x (High)</option>
                 <option value={3}>3x (Ultra)</option>
                 <option value={4}>4x (Maximum)</option>
               </select>
             </div>
             <div className="flex items-center gap-2 mt-1">
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
                     extractRegion(selectionBox.x, selectionBox.y, selectionBox.w, selectionBox.h, val, selectWholeLine, copyFormat);
                   }
                 }}
                 className="flex-1 accent-indigo-600"
               />
               <span className="text-xs text-gray-500 font-mono w-6 text-right">{marginThresholdPercent}%</span>
             </div>
             <div className="flex items-center gap-2 mt-1">
                <input
                  type="checkbox"
                  id="wholeLineToggle"
                  checked={selectWholeLine}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setSelectWholeLine(checked);
                    if (selectionBox) {
                      extractRegion(selectionBox.x, selectionBox.y, selectionBox.w, selectionBox.h, marginThresholdPercent, checked, copyFormat);
                    }
                  }}
                  className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                />
                <label htmlFor="wholeLineToggle" className="text-xs font-medium text-gray-600 cursor-pointer">
                  Select whole line(s) automatically
                </label>
             </div>
             <div className="flex items-center gap-2 mt-1">
                <input
                  type="checkbox"
                  id="markdownToggle"
                  checked={copyFormat === 'markdown'}
                  onChange={(e) => {
                    const format = e.target.checked ? 'markdown' : 'text';
                    setCopyFormat(format);
                    if (selectionBox) {
                      extractRegion(selectionBox.x, selectionBox.y, selectionBox.w, selectionBox.h, marginThresholdPercent, selectWholeLine, format);
                    }
                  }}
                  className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                />
                <label htmlFor="markdownToggle" className="text-xs font-medium text-gray-600 cursor-pointer">
                  Copy as Markdown
                </label>
             </div>
             <div className="flex items-center gap-2 mt-1">
                <input
                  type="checkbox"
                  id="boundingBoxesToggle"
                  checked={showBoundingBoxes}
                  onChange={(e) => setShowBoundingBoxes(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                />
                <label htmlFor="boundingBoxesToggle" className="text-xs font-medium text-gray-600 cursor-pointer">
                  Show Bounding Boxes
                </label>
             </div>
             <div className="flex items-center gap-2 mt-1">
                <input
                  type="checkbox"
                  id="extractedLinesToggle"
                  checked={showExtractedLines}
                  onChange={(e) => setShowExtractedLines(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                />
                <label htmlFor="extractedLinesToggle" className="text-xs font-medium text-gray-600 cursor-pointer">
                  Show Extracted Lines
                </label>
             </div>
               </>
             )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 bg-white">
            {!selectionBox ? (
              <div className="text-center py-12 px-4 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 h-full flex flex-col justify-center">
                <Type className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-500">Draw a box around a paragraph or equation to copy it.</p>
              </div>
            ) : isLatexRunning && latexProgress ? (
              <div className="text-center py-12 px-4 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 h-full flex flex-col justify-center items-center">
                 <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
                 <p className="text-sm font-medium text-gray-700 mb-1">Preparing Equation Model</p>
                 <p className="text-xs text-gray-500">Downloading {latexProgress.name} ({Math.round(latexProgress.loaded / 1024 / 1024)}MB {latexProgress.total > 0 ? `/ ${Math.round(latexProgress.total / 1024 / 1024)}MB` : ''})</p>
                 {latexProgress.total > 0 && (
                    <div className="w-48 h-1.5 bg-gray-200 rounded-full mt-3 overflow-hidden">
                       <div className="h-full bg-indigo-600" style={{ width: `${(latexProgress.loaded / latexProgress.total) * 100}%` }} />
                    </div>
                 )}
              </div>
            ) : isOcrRunning || isHandwritingRunning || isLatexRunning ? (
              <div className="text-center py-12 px-4 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 h-full flex flex-col justify-center items-center">
                 <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
                 <p className="text-sm text-gray-500">
                    {isHandwritingRunning ? 'Recognizing handwriting...' : isLatexRunning ? 'Recognizing equation...' : 'Running OCR on selected region...'}
                 </p>
              </div>
            ) : latexError ? (
              <div className="text-center py-12 px-4 border-2 border-dashed border-red-300 rounded-xl bg-red-50 h-full flex flex-col justify-center text-red-600 text-sm break-words">
                 Equation recognition failed: {latexError}
              </div>
            ) : !extractedText && !extractedLatex ? (
               <div className="text-center py-12 px-4 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 h-full flex flex-col justify-center text-gray-500 text-sm">
                  No text found in that region.
               </div>
            ) : (
              <div className="flex flex-col gap-4">
                 {extractionMode === 'equation' && extractedLatex ? (
                   <div className="flex flex-col gap-3">
                     {equationConfidence !== null && equationConfidence < 0.85 && (
                       <div className={`p-3 rounded border text-sm font-semibold ${
                         equationConfidence < 0.6 ? 'bg-red-50 border-red-200 text-red-800' : 'bg-yellow-50 border-yellow-200 text-yellow-800'
                       }`}>
                         {equationConfidence < 0.6 ? 'Low Confidence Extraction' : 'Verify Suggested'} ({(equationConfidence * 100).toFixed(0)}%)
                       </div>
                     )}
                     <div className="relative">
                       <textarea
                         value={extractedLatex}
                         onChange={(e) => {
                           setExtractedLatex(e.target.value);
                           setEquationConfidence(null);
                           setWasEdited(true);
                         }}
                         className="text-xs p-4 bg-gray-50 border border-gray-200 rounded-lg font-mono text-gray-800 resize-none w-full outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                         rows={4}
                         spellCheck={false}
                       />
                       {wasEdited && (
                         <div className="absolute top-2 right-2 flex items-center gap-1 bg-white px-2 py-1 rounded shadow-sm border border-gray-200 text-[10px] font-medium text-gray-500">
                           <Type className="w-3 h-3" />
                           Edited
                         </div>
                       )}
                     </div>
                     <div className="p-4 bg-white border border-gray-200 rounded-lg flex justify-center overflow-x-auto min-h-[100px] items-center">
                        <div dangerouslySetInnerHTML={{
                          __html: (() => {
                            try {
                                return katex.renderToString(extractedLatex, { displayMode: true, throwOnError: false });
                            } catch {
                                return "<p class='text-red-500'>KaTeX preview error</p>";
                            }
                          })()
                        }} />
                     </div>
                   </div>
                 ) : (
                   <pre className="text-sm p-4 bg-gray-50 border border-gray-200 rounded-lg overflow-x-auto whitespace-pre-wrap font-sans text-gray-800 leading-relaxed">
                     {extractedText}
                   </pre>
                 )}
              </div>
            )}
          </div>

          <div className="p-4 bg-white border-t border-gray-200 flex flex-col gap-3">
             {extractionMode === 'text' && (
                 <div className="flex gap-3">
                   <button
                     onClick={() => {
                       if (selectionBox) {
                         runOcrOnRegion(selectionBox.x, selectionBox.y, selectionBox.w, selectionBox.h);
                       }
                     }}
                     disabled={!selectionBox || isOcrRunning || isHandwritingRunning || isLatexRunning}
                     className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-gray-100 text-gray-700 border border-gray-300 rounded-xl font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors shadow-sm text-sm"
                   >
                     <ScanText className="w-4 h-4" />
                     Force OCR on Selection
                   </button>
                 </div>
             )}
             {extractionMode === 'equation' && (
                 <div className="flex gap-3">
                   <button
                     onClick={() => {
                       if (selectionBox) {
                         runEquationOnRegion(selectionBox.x, selectionBox.y, selectionBox.w, selectionBox.h);
                       }
                     }}
                     disabled={!selectionBox || isOcrRunning || isHandwritingRunning || isLatexRunning}
                     className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-gray-100 text-gray-700 border border-gray-300 rounded-xl font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors shadow-sm text-sm"
                   >
                     <ScanText className="w-4 h-4" />
                     Force Equation Recon.
                   </button>
                 </div>
             )}
             <div className="flex gap-3">
               {extractionMode === 'equation' && extractedLatex ? (
                 <>
                   <button
                     onClick={() => {
                       navigator.clipboard.writeText(extractedLatex);
                       setCopied(true);
                       setTimeout(() => setCopied(false), 2000);
                     }}
                     className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 border border-gray-300 rounded-xl font-medium hover:bg-gray-200 text-sm"
                   >
                     Copy LaTeX
                   </button>
                   <button
                     onClick={() => {
                       navigator.clipboard.writeText(toWordMathML(extractedLatex));
                       setCopied(true);
                       setTimeout(() => setCopied(false), 2000);
                     }}
                     className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 border border-gray-300 rounded-xl font-medium hover:bg-gray-200 text-sm"
                   >
                     Copy for Word
                   </button>
                 </>
               ) : (
                 <button
                   onClick={handleCopy}
                   disabled={!extractedText }
                   className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm text-sm"
                 >
                   {copied ? <Check className="w-4 h-4 text-green-300" /> : <Copy className="w-4 h-4" />}
                   {copied ? 'Text Copied!' : 'Copy Text'}
                 </button>
               )}
               <button
                 onClick={handleCopyImage}
                 disabled={!selectionBox || isCopyingImage}
                 className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-gray-600 text-white rounded-xl font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors shadow-sm text-sm"
               >
                 {copiedImage ? <Check className="w-4 h-4 text-green-300" /> : isCopyingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                 {copiedImage ? 'Image Copied!' : isCopyingImage ? 'Copying...' : 'Copy Image'}
               </button>
             </div>

          </div>
        </div>

      </div>
    </div>
  );
}
