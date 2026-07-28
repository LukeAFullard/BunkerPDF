import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import HTMLFlipBook from 'react-pageflip';
import { X, Loader2, Maximize2, Minimize2 } from 'lucide-react';
import { useFileStore } from '../../../store/fileStore';
import { loadPdfDocument } from '../../../lib/pdfHelper';

interface FlipbookViewerProps {
  isOpen: boolean;
  docId: string | null;
  onClose: () => void;
}

export function FlipbookViewer({ isOpen, docId, onClose }: FlipbookViewerProps) {
  const documents = useFileStore(state => state.documents);
  const doc = documents.find(d => d.id === docId);

  const [numPages, setNumPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !doc) return;

    let isMounted = true;

    let currentPdf: pdfjsLib.PDFDocumentProxy | null = null;
    const loadDoc = async () => {
      setIsLoading(true);
      setPageImages([]);
      try {
        const arrayBuffer = await doc.file.arrayBuffer();
        const loadedPdf = await loadPdfDocument(arrayBuffer).promise;
        currentPdf = loadedPdf;
        if (!isMounted) return;

        setNumPages(loadedPdf.numPages);

        const images: string[] = [];

        for (let i = 1; i <= Math.min(loadedPdf.numPages, 10); i++) {
          if (!isMounted) break;
          const page = await loadedPdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 });

          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d', { willReadFrequently: true });

          if (!context) continue;

          canvas.height = viewport.height;
          canvas.width = viewport.width;

          await page.render({
            canvasContext: context,
            canvas: canvas,
            viewport: viewport
          }).promise;

          images.push(canvas.toDataURL('image/jpeg', 0.8));
          if (isMounted) {
            setPageImages([...images]);
          }
        }

        if (isMounted) {
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Error loading PDF for flipbook:", err);
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadDoc();

    return () => {
      isMounted = false;
      if (currentPdf) {
        currentPdf.destroy();
      }
    };
  }, [isOpen, docId, doc]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

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
            <button
              onClick={toggleFullscreen}
              className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-full transition-colors"
              title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            >
              {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 dark:text-slate-400 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 relative bg-slate-100 dark:bg-slate-950 overflow-hidden flex items-center justify-center p-4 sm:p-8">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 dark:text-slate-400">
              <Loader2 className="w-12 h-12 animate-spin mb-4 text-indigo-500" />
              <p className="text-lg font-medium">Generating flipbook ({pageImages.length}/{Math.min(numPages, 10) || '?'})...</p>
              {numPages > 10 && <p className="text-sm text-amber-500 mt-2 text-center max-w-sm">Note: Preview limited to first 10 pages to preserve browser memory.</p>}
            </div>
          ) : pageImages.length > 0 ? (
            <div className="w-full h-full flex items-center justify-center">
              {/* @ts-expect-error - HTMLFlipBook types are tricky */}
              <HTMLFlipBook
                width={400}
                height={550}
                size="stretch"
                minWidth={315}
                maxWidth={1000}
                minHeight={400}
                maxHeight={1533}
                maxShadowOpacity={0.5}
                showCover={true}
                mobileScrollSupport={true}
                className="shadow-2xl"
              >
                {pageImages.map((src, index) => (
                  <div key={index} className="bg-white">
                    <img
                      src={src}
                      alt={`Page ${index + 1}`}
                      className="w-full h-full object-contain"
                    />
                  </div>
                ))}
              </HTMLFlipBook>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-red-500">
              <p className="text-lg font-medium">Failed to generate flipbook</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}