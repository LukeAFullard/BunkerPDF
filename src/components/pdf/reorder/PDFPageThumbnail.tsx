import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { useUIStore } from '../../../store/uiStore';
import { useFileStore } from '../../../store/fileStore';
import { cleanupPdfResources } from '../../../lib/pdfCleanup';

interface PDFPageThumbnailProps {
  docId: string;
  pageNumber: number;
  width?: number;
  className?: string;
  thumbnailCache: Record<string, string>;
  setThumbnailCache: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

export function PDFPageThumbnail({ docId, pageNumber, width = 100, className = '', thumbnailCache, setThumbnailCache }: PDFPageThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const isDarkMode = useUIStore((state) => state.isDarkMode);
  const documents = useFileStore((state) => state.documents);

  const cacheKey = `${docId}-${pageNumber}-${width}`;
  const cachedDataUrl = thumbnailCache[cacheKey];

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '50px' }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || cachedDataUrl) return;

    let isMounted = true;
    let renderTask: pdfjsLib.RenderTask | null = null;
    let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;

    const renderThumbnail = async () => {
      try {
        const doc = documents.find(d => d.id === docId);
        if (!doc) return;

        const arrayBuffer = await doc.file.arrayBuffer();
        pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        if (!isMounted) return;

        const page = await pdfDoc.getPage(pageNumber);

        const unscaledViewport = page.getViewport({ scale: 1.0 });
        const scale = width / unscaledViewport.width;
        const viewport = page.getViewport({ scale });

        // Create an offscreen canvas to render
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) return;

        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);

        const transform = outputScale !== 1
          ? [outputScale, 0, 0, outputScale, 0, 0]
          : undefined;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const renderContext: any = {
          canvasContext: context,
          transform: transform as number[] | undefined,
          viewport: viewport,
        };

        renderTask = page.render(renderContext);
        await renderTask.promise;

        if (isMounted) {
          const dataUrl = canvas.toDataURL();
          setThumbnailCache(prev => ({ ...prev, [cacheKey]: dataUrl }));
        }

      } catch (err) {
        console.error("Error rendering PDF page thumbnail", err);
        if (isMounted) setError("Preview unavailable");
      } finally {
        if (pdfDoc) {
          cleanupPdfResources(pdfDoc);
        }
      }
    };

    renderThumbnail();

    return () => {
      isMounted = false;
      if (renderTask) {
        renderTask.cancel();
      }
      if (pdfDoc) {
         cleanupPdfResources(pdfDoc);
      }
    };
  }, [docId, pageNumber, width, isVisible, cachedDataUrl, documents, setThumbnailCache, cacheKey]);

  if (error) {
    return (
      <div className={`w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 text-xs rounded ${className}`}>
        {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`w-full overflow-hidden bg-gray-100 flex items-center justify-center rounded min-h-[150px] ${className}`}
      style={{ width }}
    >
      {cachedDataUrl ? (
        <img
          src={cachedDataUrl}
          alt={`Page ${pageNumber}`}
          className="shadow-sm max-w-full max-h-full object-contain transition-all"
          style={isDarkMode ? { filter: 'invert(1) hue-rotate(180deg)' } : undefined}
          draggable={false}
        />
      ) : (
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      )}
    </div>
  );
}
