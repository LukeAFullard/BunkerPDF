import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { useUIStore } from '../../../store/uiStore';

interface PDFPageThumbnailProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  width?: number;
  className?: string;
}

export function PDFPageThumbnail({ pdfDoc, pageNumber, width = 100, className = '' }: PDFPageThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const isDarkMode = useUIStore((state) => state.isDarkMode);

  useEffect(() => {
    let renderTask: pdfjsLib.RenderTask | null = null;
    let isMounted = true;

    const renderThumbnail = async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);

        const unscaledViewport = page.getViewport({ scale: 1.0 });
        const scale = width / unscaledViewport.width;
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas || !isMounted) return;

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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const renderContext: any = {
          canvasContext: context,
          transform: transform as number[] | undefined,
          viewport: viewport,
        };

        renderTask = page.render(renderContext);
        await renderTask.promise;
      } catch (err) {
        console.error("Error rendering PDF page thumbnail", err);
        if (isMounted) setError("Preview unavailable");
      }
    };

    renderThumbnail();

    return () => {
      isMounted = false;
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [pdfDoc, pageNumber, width]);

  if (error) {
    return (
      <div className={`w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 text-xs rounded ${className}`}>
        {error}
      </div>
    );
  }

  return (
    <div className={`w-full overflow-hidden bg-gray-100 flex items-center justify-center rounded ${className}`}>
      <canvas
        ref={canvasRef}
        className="shadow-sm max-w-full max-h-full object-contain transition-all"
        style={isDarkMode ? { filter: 'invert(1) hue-rotate(180deg)' } : undefined}
      />
    </div>
  );
}
