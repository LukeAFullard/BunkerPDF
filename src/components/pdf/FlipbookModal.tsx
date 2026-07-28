import React, { useState, useEffect } from 'react';
import HTMLFlipBook from 'react-pageflip';
import * as pdfjsLib from 'pdfjs-dist';
import { type PDFDocumentProxy } from 'pdfjs-dist';

// Ensure the worker is set up
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface FlipbookModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfFile: File | null;
}

const Page = React.forwardRef<HTMLDivElement, { pageNumber: number, pdfDoc: PDFDocumentProxy }>((props, ref) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let renderTask: any;
    const renderPage = async () => {
      if (!props.pdfDoc || !canvasRef.current) return;
      try {
        const page = await props.pdfDoc.getPage(props.pageNumber);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          canvas: canvas,
        };

        renderTask = page.render(renderContext);
        await renderTask.promise;
      } catch (err) {
        // Handle cancel or error
        console.error("Flipbook render error", err);
      }
    };
    renderPage();
    return () => {
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [props.pageNumber, props.pdfDoc]);

  return (
    <div ref={ref} className="bg-white flex items-center justify-center overflow-hidden">
      <canvas ref={canvasRef} className="max-w-full max-h-full" />
    </div>
  );
});
Page.displayName = 'Page';

export function FlipbookModal({ isOpen, onClose, pdfFile }: FlipbookModalProps) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState<number>(0);

  useEffect(() => {
    if (pdfFile && isOpen) {
      const loadPdf = async () => {
        const arrayBuffer = await pdfFile.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument(new Uint8Array(arrayBuffer));
        const doc = await loadingTask.promise;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
      };
      loadPdf();
    } else {
      setPdfDoc(null);
      setNumPages(0);
    }
  }, [pdfFile, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-6xl h-[80vh] flex flex-col bg-gray-900 rounded-xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Flipbook Viewer</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded-lg text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400">
             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center overflow-hidden p-8">
           {pdfDoc && numPages > 0 ? (
             // @ts-ignore - types are missing for react-pageflip
             <HTMLFlipBook
                width={400}
                height={600}
                size="stretch"
                minWidth={300}
                maxWidth={800}
                minHeight={400}
                maxHeight={1000}
                maxShadowOpacity={0.5}
                showCover={true}
                mobileScrollSupport={true}
                className="test-flipbook"
             >
                {Array.from(new Array(numPages), (_, index) => (
                  <Page key={`page_${index + 1}`} pageNumber={index + 1} pdfDoc={pdfDoc} />
                ))}
             </HTMLFlipBook>
           ) : (
             <div className="text-white flex items-center gap-2">
                 <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                   <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                   <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                 </svg>
                 Loading PDF...
             </div>
           )}
        </div>
      </div>
    </div>
  );
}
