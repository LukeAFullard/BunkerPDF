import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { X, Lock, Unlock } from 'lucide-react';
import { useFileStore } from '../../store/fileStore';
import { cleanupPdfResources } from '../../lib/pdfCleanup';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

interface SideBySideViewerModalProps {
  onClose: () => void;
}

export function SideBySideViewerModal({ onClose }: SideBySideViewerModalProps) {
  const documents = useFileStore(state => state.documents);
  const [doc1Id, setDoc1Id] = useState<string>(documents.length >= 1 ? documents[0].id : '');
  const [doc2Id, setDoc2Id] = useState<string>(documents.length >= 2 ? documents[1].id : (documents.length === 1 ? documents[0].id : ''));
  const [isLocked, setIsLocked] = useState(false);
  const [scale, setScale] = useState(1.0);

  const pane1Ref = useRef<HTMLDivElement>(null);
  const pane2Ref = useRef<HTMLDivElement>(null);
  const isSyncingLeft = useRef(false);
  const isSyncingRight = useRef(false);
  const lockState = useRef({ locked: false, offset1: 0, offset2: 0 });

  useEffect(() => {
    if (isLocked) {
      lockState.current = {
        locked: true,
        offset1: pane1Ref.current?.scrollTop || 0,
        offset2: pane2Ref.current?.scrollTop || 0,
      };
    } else {
      lockState.current.locked = false;
    }
  }, [isLocked]);

  const handleScroll1 = () => {
    if (!lockState.current.locked) return;
    if (isSyncingLeft.current) {
      isSyncingLeft.current = false;
      return;
    }
    isSyncingRight.current = true;
    if (pane1Ref.current && pane2Ref.current) {
      const delta = pane1Ref.current.scrollTop - lockState.current.offset1;
      pane2Ref.current.scrollTop = lockState.current.offset2 + delta;
    }
  };

  const handleScroll2 = () => {
    if (!lockState.current.locked) return;
    if (isSyncingRight.current) {
      isSyncingRight.current = false;
      return;
    }
    isSyncingLeft.current = true;
    if (pane1Ref.current && pane2Ref.current) {
      const delta = pane2Ref.current.scrollTop - lockState.current.offset2;
      pane1Ref.current.scrollTop = lockState.current.offset1 + delta;
    }
  };

  const doc1 = documents.find(d => d.id === doc1Id);
  const doc2 = documents.find(d => d.id === doc2Id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full h-full max-h-[95vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Side-by-Side Viewer</h2>
            <button
              onClick={() => setIsLocked(!isLocked)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isLocked
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
              }`}
            >
              {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
              {isLocked ? 'Scrolling Locked' : 'Lock Scrolling'}
            </button>
            <div className="flex items-center gap-2 ml-4">
              <span className="text-sm text-gray-500">Zoom:</span>
              <button onClick={() => setScale(s => Math.max(0.5, s - 0.25))} className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">-</button>
              <span className="text-sm w-12 text-center">{Math.round(scale * 100)}%</span>
              <button onClick={() => setScale(s => Math.min(3.0, s + 0.25))} className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">+</button>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden bg-gray-100 dark:bg-gray-900">
          {/* Pane 1 */}
          <div className="flex-1 flex flex-col border-r border-gray-300 dark:border-gray-700 relative">
            <div className="p-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm z-10">
              <select
                value={doc1Id}
                onChange={e => setDoc1Id(e.target.value)}
                className="w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-sm outline-none"
              >
                <option value="">Select document...</option>
                {documents.map(doc => (
                  <option key={doc.id} value={doc.id}>{doc.name}</option>
                ))}
              </select>
            </div>
            <div
              ref={pane1Ref}
              onScroll={handleScroll1}
              className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col items-center gap-6"
            >
              {doc1 && <PDFDocumentView file={doc1.file} scale={scale} />}
            </div>
          </div>

          {/* Pane 2 */}
          <div className="flex-1 flex flex-col relative">
            <div className="p-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm z-10">
              <select
                value={doc2Id}
                onChange={e => setDoc2Id(e.target.value)}
                className="w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-sm outline-none"
              >
                <option value="">Select document...</option>
                {documents.map(doc => (
                  <option key={doc.id} value={doc.id}>{doc.name}</option>
                ))}
              </select>
            </div>
            <div
              ref={pane2Ref}
              onScroll={handleScroll2}
              className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col items-center gap-6"
            >
              {doc2 && <PDFDocumentView file={doc2.file} scale={scale} />}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function PDFDocumentView({ file, scale }: { file: File; scale: number }) {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    let isMounted = true;
    let pdf: pdfjsLib.PDFDocumentProxy | null = null;

    const loadPdf = async () => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        pdf = await loadingTask.promise;
        if (isMounted) {
          setPdfDoc(pdf);
          setPageCount(pdf.numPages);
        }
      } catch (err) {
        console.error("Failed to load PDF in viewer", err);
      }
    };

    loadPdf();

    return () => {
      isMounted = false;
      if (pdf) cleanupPdfResources(pdf);
    };
  }, [file]);

  if (!pdfDoc) return <div className="text-gray-500 py-10">Loading...</div>;

  return (
    <>
      {Array.from({ length: pageCount }, (_, i) => (
        <PDFPageView key={`${file.name}-${i}`} pdfDoc={pdfDoc} pageNumber={i + 1} scale={scale} />
      ))}
    </>
  );
}

function PDFPageView({ pdfDoc, pageNumber, scale }: { pdfDoc: pdfjsLib.PDFDocumentProxy; pageNumber: number; scale: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isRendered, setIsRendered] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { rootMargin: '300px' }
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || isRendered) return;

    let isMounted = true;
    let renderTask: pdfjsLib.RenderTask | null = null;

    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || !isMounted) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = Math.floor(viewport.width) + "px";
        canvas.style.height = Math.floor(viewport.height) + "px";

        // Set container dimensions to avoid layout shift when unrendered but visible
        container.style.width = Math.floor(viewport.width) + "px";
        container.style.height = Math.floor(viewport.height) + "px";

        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const renderContext: any = {
          canvasContext: context,
          transform,
          viewport,
        };

        renderTask = page.render(renderContext);
        await renderTask.promise;

        if (isMounted) setIsRendered(true);
      } catch (err) {
        if (isMounted) console.error("Error rendering page", err);
      }
    };

    renderPage();

    return () => {
      isMounted = false;
      if (renderTask) renderTask.cancel();
    };
  }, [isVisible, pdfDoc, pageNumber, scale, isRendered]);

  const [currentScale, setCurrentScale] = useState(scale);
  if (currentScale !== scale) {
    setCurrentScale(scale);
    setIsRendered(false);
  }

  return (
    <div
      ref={containerRef}
      className="bg-white shadow-md relative min-h-[500px] flex justify-center items-center"
      style={{ minWidth: '300px' }}
    >
       {!isRendered && <div className="absolute text-gray-400 text-sm">Loading page {pageNumber}...</div>}
       <canvas ref={canvasRef} className={`block transition-opacity duration-300 ${isRendered ? 'opacity-100' : 'opacity-0'}`} />
    </div>
  );
}
