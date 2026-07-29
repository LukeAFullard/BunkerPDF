import { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import HTMLFlipBook from 'react-pageflip-enhanced';
import { X, Loader2, Maximize2, Minimize2, Download, Settings } from "lucide-react";
import JSZip from 'jszip';
import { useFileStore } from '../../../store/fileStore';
import { loadPdfDocument } from '../../../lib/pdfHelper';

// Provide partial type for HTMLFlipBook to avoid @ts-expect-error
type HTMLFlipBookProps = {
  width: number;
  height: number;
  size?: 'fixed' | 'stretch';
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  maxShadowOpacity?: number;
  showCover?: boolean;
  usePortrait?: boolean;
  drawShadow?: boolean;
  mobileScrollSupport?: boolean;
  className?: string;
  onFlip?: (e: { data: number }) => void;
  children: React.ReactNode;
};

// Cast HTMLFlipBook to include the properties we need
const FlipBook = HTMLFlipBook as unknown as React.ForwardRefExoticComponent<HTMLFlipBookProps & React.RefAttributes<unknown>>;

interface FlipbookViewerProps {
  isOpen: boolean;
  docId: string | null;
  onClose: () => void;
}

export function FlipbookViewer({ isOpen, docId, onClose }: FlipbookViewerProps) {
  const documents = useFileStore(state => state.documents);
  const doc = documents.find(d => d.id === docId);

  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Track rendered images by 0-indexed page number
  const [pageImages, setPageImages] = useState<Record<number, string>>({});
  const [currentPage, setCurrentPage] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isSinglePage, setIsSinglePage] = useState(false);
  const [showCover, setShowCover] = useState(true);
  const [drawShadow, setDrawShadow] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flipBookRef = useRef<any>(null);

  // Keep track of active render tasks to cancel them
  const renderTasksRef = useRef<Record<number, { cancel: () => void }>>({});

  // 1. Load the document structure first
  useEffect(() => {
    if (!isOpen || !doc) return;

    let isMounted = true;
    let currentPdf: pdfjsLib.PDFDocumentProxy | null = null;

    // Clear previous state


    // Cancel any stray renders
    Object.values(renderTasksRef.current).forEach(task => {
      try { task.cancel(); } catch { /* ignore */ }
    });
    renderTasksRef.current = {};

    const initDoc = async () => {
      setPageImages({});
      setCurrentPage(0);
      setPdfDoc(null);
      setNumPages(0);
      setIsLoading(true);
      try {
        const arrayBuffer = await doc.file.arrayBuffer();
        const loadedPdf = await loadPdfDocument(arrayBuffer).promise;
        currentPdf = loadedPdf;

        if (!isMounted) {
          loadedPdf.destroy();
          return;
        }

        setPdfDoc(loadedPdf);
        setNumPages(loadedPdf.numPages);
        setIsLoading(false);

      } catch (err) {
        console.error("Error loading PDF for flipbook:", err);
        if (isMounted) setIsLoading(false);
      }
    };

    initDoc();

    return () => {
      isMounted = false;
      if (currentPdf) {
        currentPdf.destroy();
      }

      // Cancel renders on unmount
      Object.values(renderTasksRef.current).forEach(task => {
        try { task.cancel(); } catch { /* ignore */ }
      });
      renderTasksRef.current = {};
    };
  }, [isOpen, docId, doc]);


  // 2. Render pages near the current page
  const renderPage = useCallback(async (pdf: pdfjsLib.PDFDocumentProxy, pageIndex: number) => {
    // pageIndex is 0-based, PDF.js uses 1-based
    const pdfPageNum = pageIndex + 1;
    if (pdfPageNum < 1 || pdfPageNum > pdf.numPages) return;

    // Already rendering or rendered
    if (renderTasksRef.current[pageIndex]) return;

    try {
      // Mark as rendering with a dummy task to prevent duplicate concurrent calls
      renderTasksRef.current[pageIndex] = { cancel: () => {} };

      const page = await pdf.getPage(pdfPageNum);

      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: 1.5 * dpr });

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { willReadFrequently: true });

      if (!context) {
        delete renderTasksRef.current[pageIndex];
        return;
      }

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: context,
        canvas: canvas,
        viewport: viewport
      };

      const renderTask = page.render(renderContext);
      renderTasksRef.current[pageIndex] = renderTask;

      await renderTask.promise;

      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

      setPageImages(prev => ({
        ...prev,
        [pageIndex]: dataUrl
      }));

    } catch (err: unknown) {
      // Ignore cancellation errors
      if ((err as Error)?.name !== 'RenderingCancelledException') {
        console.error(`Error rendering page ${pdfPageNum}:`, err);
      }
    } finally {
      // Only remove if it's still this task (might have been overwritten on remount)
      if (renderTasksRef.current[pageIndex]) {
        delete renderTasksRef.current[pageIndex];
      }
    }
  }, []);

  // Update visible pages when currentPage or pdfDoc changes
  useEffect(() => {
    if (!pdfDoc || !isOpen) return;

    const PREFETCH_WINDOW = 2; // ±2 pages

    // Evict old pages outside a slightly larger window to save memory
    const EVICTION_WINDOW = 4;

    setPageImages(prev => {
      const next = { ...prev };
      let changed = false;

      for (const key of Object.keys(next)) {
        const p = parseInt(key, 10);
        if (Math.abs(p - currentPage) > EVICTION_WINDOW) {
           delete next[p];
           changed = true;

           // Also cancel if it's currently rendering
           if (renderTasksRef.current[p]) {
             try { renderTasksRef.current[p].cancel(); } catch { /* ignore */ }
             delete renderTasksRef.current[p];
           }
        }
      }
      return changed ? next : prev;
    });

    // Render current and adjacent pages
    for (let i = Math.max(0, currentPage - PREFETCH_WINDOW); i <= Math.min(numPages - 1, currentPage + PREFETCH_WINDOW); i++) {
      if (!pageImages[i] && !renderTasksRef.current[i]) {
        renderPage(pdfDoc, i);
      }
    }

  }, [currentPage, pdfDoc, isOpen, numPages, renderPage, pageImages]);


  const handleExport = async () => {
    if (!doc || !pdfDoc || isExporting) return;

    setIsExporting(true);
    try {
      const zip = new JSZip();
      const imgFolder = zip.folder("images");
      if (!imgFolder) throw new Error("Could not create images folder in ZIP");

      const imagePaths: string[] = [];

      // Render all pages to blobs and add to zip
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) continue;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({
          canvasContext: context,
          canvas: canvas,
          viewport: viewport
        }).promise;

        // Convert canvas to blob directly to save memory
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
        if (blob) {
          const fileName = `page_${i.toString().padStart(3, '0')}.jpg`;
          imgFolder.file(fileName, blob);
          imagePaths.push(`images/${fileName}`);
        }
      }

      // Generate the HTML boilerplate
      const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${doc.name} - Flipbook</title>
    <style>
        body { margin: 0; padding: 0; background-color: #1e293b; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; font-family: sans-serif; }
        .flipbook-container { width: 90vw; max-width: 1000px; height: 85vh; background: #0f172a; padding: 2rem; border-radius: 12px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); display: flex; justify-content: center; align-items: center; }
        .page { background-color: white; box-shadow: inset 0 0 20px rgba(0,0,0,0.1); overflow: hidden; }
        .page img { width: 100%; height: 100%; object-fit: contain; }
        .loading { color: white; text-align: center; }
    </style>
</head>
<body>
    <div class="flipbook-container" id="container">
        <div class="loading">Loading Flipbook...</div>
    </div>

    <!-- Use the vanilla page-flip library (not the react wrapper) via CDN -->
    <script src="https://cdn.jsdelivr.net/npm/page-flip@2.0.7/dist/js/page-flip.browser.min.js"></script>
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            const container = document.getElementById('container');
            container.innerHTML = ''; // Clear loading text

            // Create DOM elements for pages
            const imagePaths = ${JSON.stringify(imagePaths)};

            imagePaths.forEach((path, i) => {
                const div = document.createElement('div');
                div.className = 'page';
                const img = document.createElement('img');
                img.src = path;
                img.alt = 'Page ' + (i + 1);
                div.appendChild(img);
                container.appendChild(div);
            });

            // Initialize PageFlip
            const pageFlip = new St.PageFlip(container, {
                width: 400,
                height: 550,
                size: "stretch",
                minWidth: 315,
                maxWidth: 1000,
                minHeight: 400,
                maxHeight: 1533,
                maxShadowOpacity: 0.5,
                showCover: ${showCover},
                drawShadow: ${drawShadow},
                usePortrait: ${isSinglePage},
                mobileScrollSupport: true
            });

            pageFlip.loadFromHTML(document.querySelectorAll('.page'));
        });
    </script>
</body>
</html>`;

      zip.file("index.html", htmlContent);

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc.name.replace(/\.[^/.]+$/, "")}_flipbook.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } catch (err) {
      console.error("Error exporting flipbook:", err);
      alert("Failed to export flipbook. The document might be too large.");
    } finally {
      setIsExporting(false);
    }
  };

  const toggleFullscreen = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const el = containerRef.current as any;
      if (el?.requestFullscreen) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        el.requestFullscreen().catch((err: any) => console.error(err));
      } else if (el?.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } else if ((document as any).webkitExitFullscreen) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (document as any).webkitExitFullscreen();
      }
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setIsFullscreen(!!(document.fullscreenElement || (document as any).webkitFullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        if (flipBookRef.current?.pageFlip) {
          flipBookRef.current.pageFlip().flipPrev();
        }
      } else if (e.key === 'ArrowRight') {
        if (flipBookRef.current?.pageFlip) {
          flipBookRef.current.pageFlip().flipNext();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);


  const onFlip = (e: { data: number }) => {
    setCurrentPage(e.data);
  };

  if (!isOpen || !doc) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div
        ref={containerRef}
        className={`bg-white dark:bg-slate-900 rounded-xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ${
          isFullscreen ? 'w-full h-full rounded-none' : 'w-[90vw] max-w-6xl h-[85vh]'
        }`}
      >
        <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white truncate pr-4">
            Flipbook: {doc.name}
          </h2>
          <div className="flex items-center gap-2">
                        <div className="relative">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 dark:text-slate-400 rounded-full transition-colors flex items-center"
                title="Flipbook Settings"
                aria-label="Flipbook Settings"
              >
                <Settings className="w-5 h-5" />
              </button>
              {showSettings && (
                <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 p-4 z-10 flex flex-col gap-3">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-700 pb-2 mb-1">Flipbook Settings</h3>

                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm text-slate-700 dark:text-slate-300">Single Page Mode</span>
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={isSinglePage}
                      onChange={(e) => setIsSinglePage(e.target.checked)}
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-500 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-500"></div>
                  </label>

                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm text-slate-700 dark:text-slate-300">Show Cover</span>
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={showCover}
                      onChange={(e) => setShowCover(e.target.checked)}
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-500 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-500"></div>
                  </label>

                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm text-slate-700 dark:text-slate-300">Draw Shadows</span>
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={drawShadow}
                      onChange={(e) => setDrawShadow(e.target.checked)}
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-500 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-500"></div>
                  </label>
                </div>
              )}
            </div>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 dark:text-slate-400 rounded-full transition-colors flex items-center disabled:opacity-50"
              title="Download HTML5 Flipbook"
              aria-label="Download HTML5 Flipbook"
            >
              {isExporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-full transition-colors"
              title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
              aria-label={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            >
              {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 dark:text-slate-400 rounded-full transition-colors"
              aria-label="Close Flipbook"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 relative bg-slate-100 dark:bg-slate-950 overflow-hidden flex items-center justify-center p-4 sm:p-8">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 dark:text-slate-400">
              <Loader2 className="w-12 h-12 animate-spin mb-4 text-indigo-500" />
              <p className="text-lg font-medium">Initializing flipbook...</p>
            </div>
          ) : numPages > 0 ? (
            <div className="w-full h-full flex items-center justify-center">
              <FlipBook
                ref={flipBookRef}
                width={400}
                height={550}
                size="stretch"
                minWidth={315}
                maxWidth={1000}
                minHeight={400}
                maxHeight={1533}
                maxShadowOpacity={0.5}
                showCover={showCover}
                drawShadow={drawShadow}
                usePortrait={isSinglePage}
                mobileScrollSupport={true}
                className="shadow-2xl"
                onFlip={onFlip}
              >
                {Array.from({ length: numPages }).map((_, index) => (
                  <div key={index} className="bg-white flex items-center justify-center h-full w-full">
                    {pageImages[index] ? (
                      <img
                        src={pageImages[index]}
                        alt={`Page ${index + 1}`}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full w-full bg-slate-50 text-slate-400">
                        <Loader2 className="w-8 h-8 animate-spin mb-2" />
                        <span className="text-sm">Loading Page {index + 1}</span>
                      </div>
                    )}
                  </div>
                ))}
              </FlipBook>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-red-500">
              <p className="text-lg font-medium">Failed to load PDF</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
