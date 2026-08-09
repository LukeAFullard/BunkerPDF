import { loadPdfDocument } from "../../lib/pdfHelper";
import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';
import { X, Type, ZoomIn, ZoomOut, Loader2, Copy, Check, Image as ImageIcon, ScanText, TableProperties, Settings, ChevronDown, Download } from 'lucide-react';
import { useFileStore } from '../../store/fileStore';
import { useUIStore } from '../../store/uiStore';
import { cleanupPdfResources } from '../../lib/pdfCleanup';
import { getConfiguredLiteParse, formatParagraphFromItems, formatMarkdownFromItems, recognizeTableStructure, isBackgroundColor } from '../../lib/liteparseEngine';
import type { LineItem } from '../../lib/liteparseEngine';
import type { PyodideWorkerMessage, PyodideWorkerResponse } from '../../workers/pyodideWorker';
import { createWorker, PSM } from 'tesseract.js';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { toWordMathML } from '../../lib/latexOcrEngine';

interface InteractiveCopyModalProps {
  isOpen: boolean;
  docId: string | null;
  onClose: () => void;
  defaultMode?: 'text' | 'handwriting' | 'equation' | 'table';
}

export function InteractiveCopyModal({ isOpen, docId, onClose, defaultMode = 'text' }: InteractiveCopyModalProps) {
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
  const [handwritingProgress, setHandwritingProgress] = useState<{name: string, loaded: number, total: number} | null>(null);
  const [extractionMode, setExtractionMode] = useState<'text' | 'handwriting' | 'equation' | 'table'>(defaultMode);
  const [extractedLatex, setExtractedLatex] = useState<string | null>(null);
  const [latexError, setLatexError] = useState<string | null>(null);
  const [handwritingError, setHandwritingError] = useState<string | null>(null);

  const handleModeChange = (newMode: 'text' | 'handwriting' | 'equation' | 'table') => {
    setExtractionMode(newMode);

    // Bump run IDs to invalidate stale responses
    ocrRunIdRef.current++;
    handwritingRunIdRef.current++;
    latexRunIdRef.current++;

    // Unblock UI immediately
    setIsOcrRunning(false);
    setIsHandwritingRunning(false);
    setIsLatexRunning(false);

    // Cancel in-flight worker tasks
    if (latexWorkerRef.current) {
        latexWorkerRef.current.postMessage({ type: 'CANCEL' });
    }
  };
  const [equationConfidence, setEquationConfidence] = useState<number | null>(null);
  const [handwritingConfidence, setHandwritingConfidence] = useState<number | null>(null);
  const [wasEquationEdited, setWasEquationEdited] = useState(false);
  const [wasTextEdited, setWasTextEdited] = useState(false);
  const [wasTableEdited, setWasTableEdited] = useState(false);

  // Table mode state (ported from InteractiveTableModal)
  const [extractedTable, setExtractedTable] = useState<string | null>(null);
  const [tableFormat, setTableFormat] = useState<'csv' | 'markdown' | 'html'>('csv');
  const [tableConfidence, setTableConfidence] = useState<number | null>(null);
  const [tableConfidenceReasons, setTableConfidenceReasons] = useState<string[]>([]);
  const [tableExtractionSource, setTableExtractionSource] = useState<'geometry' | 'vision-fallback' | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const {
    enableLineTracing, setEnableLineTracing,
    enableStyledSpanningLabel, setEnableStyledSpanningLabel,
    spanningLabelOverflowFactor, setSpanningLabelOverflowFactor,
    spanWidthFractionRow, setSpanWidthFractionRow,
    removeWatermarks, setRemoveWatermarks,
  } = useUIStore();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowSettings(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    if (isOpen && liteparseData && liteparseData.pages && liteparseData.pages[currentPage - 1]) {
      const lines: LineItem[] = [];
      const vectorGraphics = liteparseData.pages[currentPage - 1].vectorGraphics;
      if (vectorGraphics && vectorGraphics.lines) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vectorGraphics.lines.forEach((l: any) => {
          const x0 = Math.min(l.x1, l.x2);
          const y0 = Math.min(l.y1, l.y2);
          const x1 = Math.max(l.x1, l.x2);
          const y1 = Math.max(l.y1, l.y2);

          const opacity = l.opacity ?? l.strokeAlpha ?? 1;
          const strokeWidth = l.strokeWidth ?? l.width ?? 1;
          const color = l.strokeColor ?? l.color;
          const isNearWhite = color && isBackgroundColor(color);

          if (opacity < 0.05 || isNearWhite) return;

          if (Math.abs(y0 - y1) < 2) {
            lines.push({ x0, y0: (y0 + y1) / 2, x1, y1: (y0 + y1) / 2, type: 'horizontal', strokeWidth, opacity, color });
          } else if (Math.abs(x0 - x1) < 2) {
            lines.push({ x0: (x0 + x1) / 2, y0, x1: (x0 + x1) / 2, y1, type: 'vertical', strokeWidth, opacity, color });
          }
        });
      }
      setExtractedLines(lines);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentPage, liteparseData]);

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
      setHandwritingConfidence(null);
      setHandwritingError(null);
      setWasEquationEdited(false);
      setWasTextEdited(false);
      setWasTableEdited(false);
      setExtractedTable(null);
      setTableConfidence(null);
      setTableConfidenceReasons([]);
      setTableExtractionSource(null);
      setExtractionMode(defaultMode);
      setCurrentPage(1);
    }, 0);

    let isMounted = true;
    setTimeout(() => { if (isMounted) setIsLoading(true); }, 0);

    const loadPdfAndLiteparse = async () => {
      try {
        const arrayBuffer = await doc.file.arrayBuffer();

        const engine = await getConfiguredLiteParse({ outputFormat: "json", extractVectorGraphics: true });
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

  const preprocessImageForHandwriting = (imageData: ImageData, targetMinDim: number = 384): HTMLCanvasElement => {
    const { width, height, data } = imageData;
    const numPixels = width * height;

    // Grayscale and auto-invert
    let sumIntensity = 0;
    const grayscales = new Uint8ClampedArray(numPixels);
    for (let i = 0; i < numPixels; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        const gray = (r * 299 + g * 587 + b * 114) / 1000;
        grayscales[i] = gray;
        sumIntensity += gray;
    }
    const avgIntensity = sumIntensity / numPixels;

    if (avgIntensity < 127) {
        for (let i = 0; i < numPixels; i++) {
            grayscales[i] = 255 - grayscales[i];
        }
    }

    // Scale up so minimum dimension is `targetMinDim`
    const scale = Math.max(1, targetMinDim / Math.min(width, height));
    const newW = Math.round(width * scale);
    const newH = Math.round(height * scale);

    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = width;
    srcCanvas.height = height;
    const srcCtx = srcCanvas.getContext('2d')!;
    const processedImageData = srcCtx.createImageData(width, height);
    for (let i = 0; i < numPixels; i++) {
        const v = grayscales[i];
        processedImageData.data[i * 4] = v;
        processedImageData.data[i * 4 + 1] = v;
        processedImageData.data[i * 4 + 2] = v;
        processedImageData.data[i * 4 + 3] = 255;
    }
    srcCtx.putImageData(processedImageData, 0, 0);

    const dstCanvas = document.createElement('canvas');
    dstCanvas.width = newW;
    dstCanvas.height = newH;
    const dstCtx = dstCanvas.getContext('2d')!;
    dstCtx.imageSmoothingEnabled = true;
    dstCtx.imageSmoothingQuality = 'high';
    dstCtx.drawImage(srcCanvas, 0, 0, width, height, 0, 0, newW, newH);

    return dstCanvas;
  };

  const runHandwritingOnRegion = async (x: number, y: number, w: number, h: number) => {
    if (!canvasRef.current) return;
    setIsHandwritingRunning(true);
    setExtractedText(null);
    setHandwritingConfidence(null);
    setHandwritingError(null);
    setWasTextEdited(false);
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

      // Get preprocessed canvas for Tesseract and Handwriting
      const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
      const preprocessedCanvas = preprocessImageForHandwriting(imageData);

      // Initialize Tesseract worker if not cached
      if (!tesseractWorkerRef.current && !isInitializingWorkerRef.current) {
         isInitializingWorkerRef.current = true;
         try {
            const worker = await createWorker('eng');
            if (!document.body.contains(canvasRef.current)) {
                worker.terminate();
            } else {
                tesseractWorkerRef.current = worker;
            }
         } finally {
            isInitializingWorkerRef.current = false;
         }
      }

      while (isInitializingWorkerRef.current) {
         await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (!tesseractWorkerRef.current) {
          throw new Error('Failed to initialize Tesseract worker for handwriting segmentation');
      }

      // Configure Tesseract for line segmentation (SPARSE_TEXT)
      await tesseractWorkerRef.current.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      const tessResult = await tesseractWorkerRef.current.recognize(preprocessedCanvas.toDataURL('image/png'));

      // Reset Tesseract to default mode for standard text OCR
      await tesseractWorkerRef.current.setParameters({ tessedit_pageseg_mode: PSM.AUTO });

      // Extract line bounding boxes
      const lines = tessResult.data.lines || [];
      const lineBoxes = lines.map((line: any) => line.bbox);

      // Fallback if no lines found: use the whole image
      if (lineBoxes.length === 0) {
        lineBoxes.push({ x0: 0, y0: 0, x1: preprocessedCanvas.width, y1: preprocessedCanvas.height });
      }

      // Initialize Handwriting worker if not cached
      if (!handwritingWorkerRef.current && !isInitializingHandwritingRef.current) {
        isInitializingHandwritingRef.current = true;
        try {
          const worker = new Worker(new URL('../../workers/handwritingWorker.ts', import.meta.url), { type: 'module' });
          worker.postMessage({ type: 'INIT', jobId: 'init' });

          await new Promise<void>((resolve, reject) => {
            const handleInit = (e: MessageEvent) => {
              if (e.data.type === 'PROGRESS' && e.data.name && e.data.loaded !== undefined && e.data.total) {
                setHandwritingProgress({ name: e.data.name, loaded: e.data.loaded, total: e.data.total });
              } else if (e.data.jobId === 'init') {
                if (e.data.type === 'READY') {
                  setHandwritingProgress(null);
                  worker.removeEventListener('message', handleInit);
                  resolve();
                } else if (e.data.type === 'ERROR') {
                  setHandwritingProgress(null);
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


      let aggregatedText = "";
      let totalConfidence = 0;
      let lineCount = 0;

      for (const box of lineBoxes) {
         // Add some padding to the crop if possible
         const pad = 4;
         const cropX = Math.max(0, box.x0 - pad);
         const cropY = Math.max(0, box.y0 - pad);
         const cropW = Math.min(preprocessedCanvas.width - cropX, (box.x1 - box.x0) + pad * 2);
         const cropH = Math.min(preprocessedCanvas.height - cropY, (box.y1 - box.y0) + pad * 2);

         if (cropW <= 0 || cropH <= 0) continue;

         const cropCanvas = document.createElement('canvas');
         cropCanvas.width = cropW;
         cropCanvas.height = cropH;
         const cropCtx = cropCanvas.getContext('2d')!;
         cropCtx.drawImage(preprocessedCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

         const cropDataUrl = cropCanvas.toDataURL('image/png');
         const cropJobId = `handwriting-${Date.now()}-${Math.random()}`;

         const result = await new Promise<{text: string, confidence: number}>((resolve, reject) => {
           const handleResult = (e: MessageEvent) => {
             if (e.data.jobId === cropJobId) {
               handwritingWorkerRef.current?.removeEventListener('message', handleResult);
               if (e.data.type === 'RESULT') {
                 resolve({ text: e.data.text, confidence: e.data.confidence ?? 0 });
               } else if (e.data.type === 'ERROR') {
                 reject(new Error(e.data.error));
               }
             }
           };
           handwritingWorkerRef.current!.addEventListener('message', handleResult);
           handwritingWorkerRef.current!.postMessage({ type: 'RECOGNIZE', image: cropDataUrl, jobId: cropJobId });
         });

         if (result.text.trim().length > 0) {
             aggregatedText += (aggregatedText ? "\n" : "") + result.text.trim();
             totalConfidence += result.confidence;
             lineCount++;
         }
      }

      // Only process result if this is the most recent run and component is mounted
      if (runId === handwritingRunIdRef.current && canvasRef.current) {
        setExtractedText(aggregatedText);
        setHandwritingConfidence(lineCount > 0 ? totalConfidence / lineCount : 0);
      }
    } catch (err) {
      console.error("Handwriting recognition failed for the region:", err);
      if (runId === handwritingRunIdRef.current) {
        setHandwritingError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (runId === handwritingRunIdRef.current) {
         setIsHandwritingRunning(false);
      }
    }
  };

  const handleLineClick = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    setExtractedLines(lines => {
      const newLines = [...lines];
      newLines[index] = { ...newLines[index], disabled: !newLines[index].disabled };
      return newLines;
    });
  };

  const runTableExtractionOnRegion = async (x: number, y: number, w: number, h: number) => {
    if (!liteparseData || overlayScale <= 0 || !pdfDocRef.current) return;
    setWasTableEdited(false);

    const lpX = x / overlayScale;
    const lpY = y / overlayScale;
    const lpW = w / overlayScale;
    const lpH = h / overlayScale;
    const lpRight = lpX + lpW;
    const lpBottom = lpY + lpH;

    const pageIdx = currentPage - 1;
    const items = liteparseData.pages[pageIdx]?.textItems || [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const intersectingItems = items.filter((item: any) => {
      const itemRight = item.x + item.width;
      const itemBottom = item.y + item.height;
      return !(lpRight < item.x || lpX > itemRight || lpBottom < item.y || lpY > itemBottom);
    });

    const intersectingLines = extractedLines.filter((line) => {
      const lx0 = Math.min(line.x0, line.x1);
      const ly0 = Math.min(line.y0, line.y1);
      const lx1 = Math.max(line.x0, line.x1);
      const ly1 = Math.max(line.y0, line.y1);
      return !(lx1 < lpX || lx0 > lpRight || ly1 < lpY || ly0 > lpBottom);
    });

    if (intersectingItems.length > 0) {
      setIsExtracting(true);
      try {
        const pageProxy = await pdfDocRef.current.getPage(currentPage);
        const result = await recognizeTableStructure(
          pageProxy,
          intersectingItems,
          tableFormat,
          false,
          intersectingLines
        );
        setExtractedTable(result.text);
        setTableConfidence(result.confidence);
        setTableConfidenceReasons(result.confidenceReasons);
        setTableExtractionSource(result.source);
      } catch (err) {
        console.error("Table extraction error", err);
        setExtractedTable(null);
      } finally {
        setIsExtracting(false);
      }
    } else {
      setExtractedTable(null);
      setTableConfidence(null);
      setTableConfidenceReasons([]);
      setTableExtractionSource(null);
    }
  };

  useEffect(() => {
    if (extractionMode === 'table' && selectionBox && !wasTableEdited) {
      runTableExtractionOnRegion(selectionBox.x, selectionBox.y, selectionBox.w, selectionBox.h);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableFormat, extractedLines, enableLineTracing, enableStyledSpanningLabel, spanningLabelOverflowFactor, spanWidthFractionRow, removeWatermarks]);

  const runEquationOnRegion = async (x: number, y: number, w: number, h: number) => {
    if (!canvasRef.current) return;
    setIsLatexRunning(true);
    setExtractedText(null);
    setExtractedLatex(null);
    setLatexError(null);
    setEquationConfidence(null);
    setWasEquationEdited(false);
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
      } else if (extractionMode === 'table') {
        runTableExtractionOnRegion(x, y, w, h);
      } else {
        extractRegion(x, y, w, h);
      }
    } else {
      setSelectionBox(null);
      setExtractedText(null);
      setExtractedLatex(null);
      setLatexError(null);
      setEquationConfidence(null);
      setHandwritingConfidence(null);
      setHandwritingError(null);
      setWasEquationEdited(false);
      setWasTextEdited(false);
      setWasTableEdited(false);
      setExtractedTable(null);
      setTableConfidence(null);
      setTableConfidenceReasons([]);
      setTableExtractionSource(null);
    }
  };

  const extractRegion = async (x: number, y: number, w: number, h: number, customThreshold?: number, overrideWholeLine?: boolean, overrideFormat?: 'text' | 'markdown') => {
    if (!liteparseData || overlayScale <= 0) return;
    setWasTextEdited(false);

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
    setWasTextEdited(false);
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

  const handleTableCopy = () => {
    if (extractedTable) {
      navigator.clipboard.writeText(extractedTable);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleTableDownload = () => {
    if (extractedTable && doc) {
      const blob = new Blob([extractedTable], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc.name}_table_p${currentPage}.${tableFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
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
                    {extractionMode === 'table' && extractedLines.map((line, idx) => {
                      const isHoriz = line.type === 'horizontal';
                      let intersects = true;
                      if (selectionBox) {
                        const lpX = selectionBox.x / overlayScale;
                        const lpY = selectionBox.y / overlayScale;
                        const lpW = selectionBox.w / overlayScale;
                        const lpH = selectionBox.h / overlayScale;
                        const lx0 = Math.min(line.x0, line.x1);
                        const ly0 = Math.min(line.y0, line.y1);
                        const lx1 = Math.max(line.x0, line.x1);
                        const ly1 = Math.max(line.y0, line.y1);
                        intersects = !(lx1 < lpX || lx0 > lpX + lpW || ly1 < lpY || ly0 > lpY + lpH);
                      }
                      if (!intersects && selectionBox) return null;

                      return (
                        <div
                          key={`line-${idx}`}
                          onClick={(e) => handleLineClick(e, idx)}
                          className={`absolute cursor-pointer transition-colors ${line.disabled ? 'bg-red-400 opacity-30 hover:opacity-100' : 'bg-blue-500 opacity-60 hover:opacity-100'}`}
                          style={{
                            left: (Math.min(line.x0, line.x1) * overlayScale) + 'px',
                            top: (Math.min(line.y0, line.y1) * overlayScale) + 'px',
                            width: (isHoriz ? Math.abs(line.x1 - line.x0) * overlayScale : Math.max(4, (line.strokeWidth || 1) * overlayScale)) + 'px',
                            height: (!isHoriz ? Math.abs(line.y1 - line.y0) * overlayScale : Math.max(4, (line.strokeWidth || 1) * overlayScale)) + 'px',
                            transform: isHoriz ? 'translateY(-50%)' : 'translateX(-50%)',
                            zIndex: 40
                          }}
                          title={line.disabled ? "Click to enable line" : "Click to disable line"}
                        />
                      );
                    })}
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
            <button disabled={currentPage <= 1 || isLoading} onClick={() => { setCurrentPage(p => p - 1); setSelectionBox(null); setExtractedText(null); setExtractedTable(null); }} className="px-4 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors">
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
                    setExtractedTable(null);
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
            <button disabled={currentPage >= totalPages || isLoading} onClick={() => { setCurrentPage(p => p + 1); setSelectionBox(null); setExtractedText(null); setExtractedTable(null); }} className="px-4 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors">
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
                      onClick={() => handleModeChange('text')}
                    >Text</button>
                    <button
                      className={`px-2 py-1 text-xs rounded font-medium ${extractionMode === 'handwriting' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                      onClick={() => handleModeChange('handwriting')}
                    >Handwriting</button>
                    <button
                      className={`px-2 py-1 text-xs rounded font-medium ${extractionMode === 'equation' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                      onClick={() => handleModeChange('equation')}
                    >Equation</button>
                    <button
                      className={`px-2 py-1 text-xs rounded font-medium ${extractionMode === 'table' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                      onClick={() => handleModeChange('table')}
                    >Table</button>
                 </div>
             </div>
             {extractionMode === 'table' && (
               <div className="flex items-center justify-between">
                 <div className="relative" ref={settingsRef}>
                   <button
                     onClick={() => setShowSettings(!showSettings)}
                     className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-1"
                     title="Table Extraction Settings"
                   >
                     <Settings className="w-4 h-4" />
                     <ChevronDown className="w-3 h-3" />
                   </button>

                   {showSettings && (
                     <div className="absolute left-0 mt-2 w-72 rounded-lg shadow-lg py-3 z-50 border bg-white border-gray-200 text-gray-800">
                       <div className="px-4 pb-2 border-b border-gray-200 mb-3 font-semibold text-sm">
                         Advanced Table Extraction
                       </div>
                       <div className="px-4 space-y-4">
                         <label className="flex items-center gap-2 cursor-pointer">
                           <input
                             type="checkbox"
                             checked={removeWatermarks}
                             onChange={(e) => setRemoveWatermarks(e.target.checked)}
                             className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                           />
                           <span className="text-sm font-medium">Remove Watermarks</span>
                         </label>
                         <label className="flex items-center gap-2 cursor-pointer">
                           <input
                             type="checkbox"
                             checked={enableLineTracing}
                             onChange={(e) => setEnableLineTracing(e.target.checked)}
                             className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                           />
                           <span className="text-sm font-medium">Use Line Tracing</span>
                         </label>
                         <label className="flex items-center gap-2 cursor-pointer">
                           <input
                             type="checkbox"
                             checked={enableStyledSpanningLabel}
                             onChange={(e) => setEnableStyledSpanningLabel(e.target.checked)}
                             className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                           />
                           <span className="text-sm font-medium">Use Font Styles for Divider Labels</span>
                         </label>
                         <div>
                           <div className="flex justify-between items-center mb-1">
                             <span className="text-sm">Divider Label Threshold</span>
                             <span className="text-xs text-gray-500 font-mono">{spanningLabelOverflowFactor.toFixed(2)}x</span>
                           </div>
                           <input
                             type="range"
                             min="1.0"
                             max="3.0"
                             step="0.1"
                             value={spanningLabelOverflowFactor}
                             onChange={(e) => setSpanningLabelOverflowFactor(parseFloat(e.target.value))}
                             className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                           />
                           <p className="text-[10px] text-gray-500 mt-1 leading-tight">Lower if wide labels are missed. Raise if long data splits.</p>
                         </div>
                         <div>
                           <div className="flex justify-between items-center mb-1">
                             <span className="text-sm">Span Width Fraction</span>
                             <span className="text-xs text-gray-500 font-mono">{Math.round(spanWidthFractionRow * 100)}%</span>
                           </div>
                           <input
                             type="range"
                             min="0.3"
                             max="1.0"
                             step="0.05"
                             value={spanWidthFractionRow}
                             onChange={(e) => setSpanWidthFractionRow(parseFloat(e.target.value))}
                             className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                           />
                         </div>
                       </div>
                     </div>
                   )}
                 </div>
                 <div className="flex bg-gray-100 p-1 rounded-lg">
                   <button
                     onClick={() => setTableFormat('csv')}
                     className={`px-3 py-1 rounded text-xs font-medium transition-colors ${tableFormat === 'csv' ? 'bg-white shadow-sm text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
                   >CSV</button>
                   <button
                     onClick={() => setTableFormat('markdown')}
                     className={`px-3 py-1 rounded text-xs font-medium transition-colors ${tableFormat === 'markdown' ? 'bg-white shadow-sm text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
                   >Markdown</button>
                   <button
                     onClick={() => setTableFormat('html')}
                     className={`px-3 py-1 rounded text-xs font-medium transition-colors ${tableFormat === 'html' ? 'bg-white shadow-sm text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
                   >HTML</button>
                 </div>
               </div>
             )}

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
              extractionMode === 'table' ? (
                <div className="text-center py-12 px-4 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 h-full flex flex-col justify-center">
                  <TableProperties className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">Draw a box around a table on the PDF to extract it instantly.</p>
                </div>
              ) : (
                <div className="text-center py-12 px-4 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 h-full flex flex-col justify-center">
                  <Type className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">Draw a box around a paragraph or equation to copy it.</p>
                </div>
              )
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
            ) : isHandwritingRunning && handwritingProgress ? (
              <div className="text-center py-12 px-4 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 h-full flex flex-col justify-center items-center">
                 <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
                 <p className="text-sm font-medium text-gray-700 mb-1">Preparing Handwriting Model</p>
                 <p className="text-xs text-gray-500">Downloading {handwritingProgress.name} ({Math.round(handwritingProgress.loaded / 1024 / 1024)}MB {handwritingProgress.total > 0 ? `/ ${Math.round(handwritingProgress.total / 1024 / 1024)}MB` : ''})</p>
                 {handwritingProgress.total > 0 && (
                    <div className="w-48 h-1.5 bg-gray-200 rounded-full mt-3 overflow-hidden">
                       <div className="h-full bg-indigo-600" style={{ width: `${(handwritingProgress.loaded / handwritingProgress.total) * 100}%` }} />
                    </div>
                 )}
              </div>
            ) : (extractionMode === 'equation' && isLatexRunning) ||
                (extractionMode === 'handwriting' && isHandwritingRunning) ||
                (extractionMode === 'text' && isOcrRunning) ? (
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
            ) : extractionMode === 'table' && isExtracting ? (
               <div className="text-center py-12 px-4 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 h-full flex flex-col items-center justify-center text-gray-500">
                  <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-2" />
                  <p className="text-sm">Extracting table...</p>
               </div>
            ) : extractionMode === 'table' && !extractedTable ? (
               <div className="text-center py-12 px-4 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 h-full flex flex-col justify-center text-gray-500 text-sm">
                  No text found in that region.
               </div>
            ) : extractionMode === 'table' ? (
               <div className="flex flex-col gap-4">
                  {tableConfidence !== null && tableConfidence < 0.85 && (
                    <div className={`p-3 rounded border text-sm flex flex-col gap-1 ${tableConfidence < 0.6 && tableExtractionSource !== 'vision-fallback' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-yellow-50 border-yellow-200 text-yellow-800'}`}>
                       <div className="font-semibold">
                          {tableConfidence < 0.6 && tableExtractionSource !== 'vision-fallback' ? "Low Confidence Extraction" : "Extraction verify suggested"} ({(tableConfidence * 100).toFixed(0)}%)
                       </div>
                       {tableConfidenceReasons.length > 0 && (
                         <ul className="list-disc list-inside text-xs mt-1">
                           {tableConfidenceReasons.map((r, i) => <li key={i}>{r}</li>)}
                         </ul>
                       )}
                    </div>
                  )}
                  <div className="relative">
                    <textarea
                      value={extractedTable ?? ''}
                      onChange={(e) => {
                        setExtractedTable(e.target.value);
                        setWasTableEdited(true);
                        setTableConfidence(null);
                        setTableConfidenceReasons([]);
                      }}
                      className="text-xs p-4 bg-gray-50 border border-gray-200 rounded-lg font-mono text-gray-800 resize-none w-full outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      rows={10}
                      spellCheck={false}
                    />
                    {wasTableEdited && (
                      <div className="absolute top-2 right-2 flex items-center gap-1 bg-white px-2 py-1 rounded shadow-sm border border-gray-200 text-[10px] font-medium text-gray-500">
                        <Type className="w-3 h-3" />
                        Edited
                      </div>
                    )}
                  </div>
               </div>
            ) : handwritingError ? (
               <div className="text-center py-12 px-4 border-2 border-dashed border-red-300 rounded-xl bg-red-50 h-full flex flex-col justify-center text-red-600 text-sm">
                  Handwriting recognition failed: {handwritingError}
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
                           setWasEquationEdited(true);
                         }}
                         className="text-xs p-4 bg-gray-50 border border-gray-200 rounded-lg font-mono text-gray-800 resize-none w-full outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                         rows={4}
                         spellCheck={false}
                       />
                       {wasEquationEdited && (
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
                   <div className="flex flex-col gap-3">
                     {extractionMode === 'handwriting' && handwritingConfidence !== null && handwritingConfidence < 0.6 && (
                       <div className="p-3 rounded border text-sm font-semibold bg-yellow-50 border-yellow-200 text-yellow-800">
                         Low confidence — consider Force OCR fallback.
                       </div>
                     )}
                     <div className="relative">
                       <textarea
                         value={extractedText ?? ''}
                         onChange={(e) => {
                           setExtractedText(e.target.value);
                           setWasTextEdited(true);
                           if (extractionMode === 'handwriting') setHandwritingConfidence(null);
                         }}
                         className="text-sm p-4 bg-gray-50 border border-gray-200 rounded-lg font-sans text-gray-800 leading-relaxed resize-none w-full outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                         rows={8}
                         spellCheck={extractionMode === 'handwriting'}
                       />
                       {wasTextEdited && (
                         <div className="absolute top-2 right-2 flex items-center gap-1 bg-white px-2 py-1 rounded shadow-sm border border-gray-200 text-[10px] font-medium text-gray-500">
                           <Type className="w-3 h-3" />
                           Edited
                         </div>
                       )}
                     </div>
                   </div>
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
                     disabled={!selectionBox || isOcrRunning}
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
                     disabled={!selectionBox || isLatexRunning}
                     className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-gray-100 text-gray-700 border border-gray-300 rounded-xl font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors shadow-sm text-sm"
                   >
                     <ScanText className="w-4 h-4" />
                     Force Equation Recon.
                   </button>
                 </div>
             )}
             <div className="flex gap-3">
               {extractionMode === 'table' && extractedTable ? (
                 <>
                   <button
                     onClick={handleTableCopy}
                     className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm text-sm"
                   >
                     {copied ? <Check className="w-4 h-4 text-green-300" /> : <Copy className="w-4 h-4" />}
                     {copied ? 'Copied!' : 'Copy'}
                   </button>
                   <button
                     onClick={handleTableDownload}
                     className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-gray-100 text-gray-700 border border-gray-300 rounded-xl font-medium hover:bg-gray-200 transition-colors shadow-sm text-sm"
                   >
                     <Download className="w-4 h-4" />
                     Save
                   </button>
                 </>
               ) : extractionMode === 'equation' && extractedLatex ? (
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
               {extractionMode !== 'table' && (
                 <button
                   onClick={handleCopyImage}
                   disabled={!selectionBox || isCopyingImage}
                   className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-gray-600 text-white rounded-xl font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors shadow-sm text-sm"
                 >
                   {copiedImage ? <Check className="w-4 h-4 text-green-300" /> : isCopyingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                   {copiedImage ? 'Image Copied!' : isCopyingImage ? 'Copying...' : 'Copy Image'}
                 </button>
               )}
             </div>

          </div>
        </div>

      </div>
    </div>
  );
}
