import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { useUIStore } from '../../store/uiStore';

// We must specify the worker source for pdfjs-dist.
// Using the Vite worker pattern or pointing to the local minified worker.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

interface PDFThumbnailProps {
  file: File;
  width?: number;
  className?: string;
}

export function PDFThumbnail({ file, width = 200, className }: PDFThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const isDarkMode = useUIStore((state) => state.isDarkMode);

  useEffect(() => {
    let renderTask: pdfjsLib.RenderTask | null = null;
    let isMounted = true;

    const renderThumbnail = async () => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;

        // Render the first page
        const page = await pdf.getPage(1);

        // Calculate scale to match the requested width
        const unscaledViewport = page.getViewport({ scale: 1.0 });
        const scale = width / unscaledViewport.width;
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas || !isMounted) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        // Support high-DPI displays
        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = Math.floor(viewport.width) + "px";
        canvas.style.height = Math.floor(viewport.height) + "px";

        const transform = outputScale !== 1
          ? [outputScale, 0, 0, outputScale, 0, 0]
          : undefined;

        const renderContext: pdfjsLib.RenderParameters = {
          canvasContext: context,
          transform: transform as number[] | undefined,
          viewport: viewport,
        };

        renderTask = page.render(renderContext);
        await renderTask.promise;
      } catch (err) {
        console.error("Error rendering PDF thumbnail", err);
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
  }, [file, width]);

  if (error) {
    return (
      <div className={`w-full h-full min-h-[100px] flex items-center justify-center bg-gray-100 text-gray-400 text-sm rounded ${className || ''}`}>
        {error}
      </div>
    );
  }

  return (
    <div className={`w-full overflow-hidden bg-gray-100 flex items-center justify-center rounded ${className || ''}`}>
      <canvas
        ref={canvasRef}
        className="shadow-sm max-w-full max-h-full object-contain transition-all"
        style={isDarkMode ? { filter: 'invert(1) hue-rotate(180deg)' } : undefined}
      />
    </div>
  );
}