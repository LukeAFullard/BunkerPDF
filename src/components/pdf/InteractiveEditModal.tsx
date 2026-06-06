import { loadPdfDocument } from "../../lib/pdfHelper";
import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';
import { X, Check, Type, ZoomIn, ZoomOut, Loader2 } from 'lucide-react';
import { useFileStore } from '../../store/fileStore';
import { cleanupPdfResources } from '../../lib/pdfCleanup';
import { getConfiguredLiteParse } from '../../lib/liteparseEngine';


export interface EditBox {
  pageNum: number;
  x: number;
  y: number;
  width: number;
  height: number;
  newText: string;
  fontSize?: number;
  lineHeight?: number;
}

interface InteractiveEditModalProps {
  isOpen: boolean;
  docId: string | null;
  onClose: () => void;
  onApply: (edits: EditBox[]) => void;
}


// eslint-disable-next-line @typescript-eslint/no-explicit-any
function groupTextItemsIntoBlocks(textItems: any[]) {
  if (!textItems || textItems.length === 0) return [];

  const blocks: any[] = [];
  let currentBlock: any = null;
  let lastItem: any = null;

  for (const item of textItems) {
    if (!item.text.trim()) continue;

    if (!currentBlock) {
      currentBlock = {
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        text: item.text,
        fontSize: item.fontSize || 12
      };
      lastItem = item;
      continue;
    }

    const fontSize = item.fontSize || 12;
    const yDiff = Math.abs(item.y - lastItem.y);

    if (yDiff > fontSize * 1.5) {
      blocks.push(currentBlock);
      currentBlock = {
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        text: item.text,
        fontSize: item.fontSize || 12
      };
    } else {
      const isSameLine = yDiff < fontSize * 0.5;
      if (isSameLine) {
        const gap = item.x - (lastItem.x + lastItem.width);
        if (gap > fontSize * 0.2) {
          currentBlock.text += ' ';
        }
      } else {
        if (currentBlock.text.endsWith('-')) {
          currentBlock.text = currentBlock.text.slice(0, -1);
        } else if (!currentBlock.text.endsWith(' ')) {
          currentBlock.text += ' ';
        }
      }
      currentBlock.text += item.text;

      const minX = Math.min(currentBlock.x, item.x);
      const minY = Math.min(currentBlock.y, item.y);
      const maxX = Math.max(currentBlock.x + currentBlock.width, item.x + item.width);
      const maxY = Math.max(currentBlock.y + currentBlock.height, item.y + item.height);

      currentBlock.x = minX;
      currentBlock.y = minY;
      currentBlock.width = maxX - minX;
      currentBlock.height = maxY - minY;
      currentBlock.fontSize = Math.max(currentBlock.fontSize, item.fontSize || 12);
    }
    lastItem = item;
  }

  if (currentBlock) {
    blocks.push(currentBlock);
  }

  return blocks;
}

export function InteractiveEditModal({ isOpen, docId, onClose, onApply }: InteractiveEditModalProps) {
  const documents = useFileStore(state => state.documents);
  const doc = documents.find(d => d.id === docId);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [overlayScale, setOverlayScale] = useState(1.0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [liteparseData, setLiteparseData] = useState<any>(null);
  const [edits, setEdits] = useState<EditBox[]>([]);
  const [activeEditBox, setActiveEditBox] = useState<number | null>(null);

  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  useEffect(() => {
    if (!isOpen || !doc) return;
    setZoomLevel(1.0);
    setLiteparseData(null);
    setEdits([]);
    setCurrentPage(1);

    let isMounted = true;
    setIsLoading(true);

    const loadPdfAndLiteparse = async () => {
      try {
        const arrayBuffer = await doc.file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer.slice(0));

        const loadingTask = loadPdfDocument(arrayBuffer.slice(0));
        const pdf = await loadingTask.promise;

        if (!isMounted) {
           cleanupPdfResources(pdf);
           return;
        }

        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);

        const engine = await getConfiguredLiteParse({ outputFormat: "json" });
        const result = await engine.parse(bytes);

        if (isMounted) {
          setLiteparseData(result);
          setTimeout(() => {
            if (isMounted) renderPage(1, pdf);
          }, 0);
        }
      } catch (err) {
        console.error("Error loading PDF or LiteParse for interactive edit", err);
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
    if (isOpen && pdfDocRef.current && liteparseData) {
      renderPage(currentPage, pdfDocRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, zoomLevel]);

  const renderPage = async (pageNum: number, pdf: pdfjsLib.PDFDocumentProxy) => {
    setIsLoading(true);
    try {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }

      const page = await pdf.getPage(pageNum);
      const canvas = canvasRef.current;

      if (!canvas) return;

      const context = canvas.getContext('2d');
      if (!context) return;

      const viewportHeight = window.innerHeight * 0.6;
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const baseScale = viewportHeight / unscaledViewport.height;
      const scale = baseScale * zoomLevel;
      const viewport = page.getViewport({ scale });

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

      renderTaskRef.current = page.render(renderContext);
      await renderTaskRef.current.promise;

      setOverlayScale(scale);
      setIsLoading(false);

    } catch (err) {
      if (err instanceof pdfjsLib.RenderingCancelledException) {
        // Expected
      } else {
        console.error("Error rendering page", err);
        setIsLoading(false);
      }
    }
  };


  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleItemClick = (block: any, pageIdx: number, _idx: number) => {
    // Convert to edit box
    const editExists = edits.findIndex(e => e.pageNum === pageIdx && e.x === block.x && e.y === block.y);
    if (editExists === -1) {
       setEdits(prev => [...prev, {
          pageNum: pageIdx,
          x: block.x,
          y: block.y,
          width: block.width,
          height: block.height,
          newText: block.text, // init with original
          fontSize: block.fontSize
       }]);
       setActiveEditBox(edits.length); // will be the new index
    } else {
       setActiveEditBox(editExists);
    }
  };

  const updateEditBox = (index: number, newText: string) => {
    setEdits(prev => {
      const next = [...prev];
      next[index].newText = newText;
      return next;
    });
  };

  const removeEditBox = (index: number) => {
    setEdits(prev => prev.filter((_, i) => i !== index));
    if (activeEditBox === index) setActiveEditBox(null);
  };

  const handleApply = () => {
    if (edits.length > 0) {
      onApply(edits);
    }
  };

  if (!isOpen || !doc) return null;

  const pageIdx = currentPage - 1;
  const currentLpPage = liteparseData?.pages?.[pageIdx];
  const blocks = currentLpPage?.textItems ? groupTextItemsIntoBlocks(currentLpPage.textItems) : [];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl flex h-[90vh] overflow-hidden">

        {/* Left Side: PDF Preview */}
        <div className="w-2/3 bg-gray-100 flex flex-col relative">
          <div className="bg-white p-4 flex items-center justify-between shadow-sm z-10 border-b border-gray-200">
            <div>
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Type className="w-5 h-5 text-indigo-600" />
                Hover to Edit
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
               <div className="relative shadow-xl ring-1 ring-black/5" style={{ minWidth: 'max-content' }}>
                  <canvas ref={canvasRef} className="block pointer-events-none" />
                  <div className="absolute top-0 left-0 w-full h-full">
                     {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                     {!isLoading && blocks.length > 0 && overlayScale > 0 && blocks.map((block: any, idx: number) => {
                        const editIndex = edits.findIndex(e => e.pageNum === pageIdx && e.x === block.x && e.y === block.y);
                        const isEdited = editIndex !== -1;
                        const isEditing = activeEditBox === editIndex;

                        if (isEditing && isEdited) {
                           return (
                              <textarea
                                key={idx}
                                autoFocus
                                value={edits[editIndex].newText}
                                onChange={(e) => updateEditBox(editIndex, e.target.value)}
                                onBlur={() => setActiveEditBox(null)}
                                className="absolute bg-white border-2 border-indigo-500 shadow-lg px-1 outline-none font-sans text-sm z-50 text-black resize-none"
                                style={{
                                   left: `${block.x * overlayScale}px`,
                                   top: `${block.y * overlayScale - 4}px`, // slightly offset for visual clarity
                                   minWidth: `${Math.max(block.width * overlayScale, 150)}px`,
                                   height: `${Math.max(block.height * overlayScale + 8, 40)}px`,
                                }}
                              />
                           );
                        }

                        return (
                           <div
                             key={idx}
                             onClick={() => handleItemClick(block, pageIdx, idx)}
                             className={`absolute cursor-pointer rounded-sm border ${
                               isEdited
                                 ? 'bg-indigo-100 border-indigo-400 opacity-90'
                                 : 'border-transparent hover:bg-indigo-500/20 hover:border-indigo-600/50'
                             }`}
                             style={{
                               left: `${block.x * overlayScale}px`,
                               top: `${block.y * overlayScale}px`,
                               width: `${block.width * overlayScale}px`,
                               height: `${block.height * overlayScale}px`,
                             }}
                             title="Click to edit"
                           >
                             {isEdited && (
                                <div className="absolute inset-0 p-0.5 overflow-hidden text-xs text-indigo-900 leading-tight">
                                   {edits[editIndex].newText}
                                </div>
                             )}
                           </div>
                        );
                     })}
                  </div>
               </div>
            )}
          </div>

          <div className="bg-white border-t border-gray-200 p-3 flex justify-center items-center gap-4 z-10">
            <button disabled={currentPage <= 1 || isLoading} onClick={() => setCurrentPage(p => p - 1)} className="px-4 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors">
              Previous
            </button>
            <span className="text-sm font-medium text-gray-600 min-w-[5rem] text-center">{currentPage} / {totalPages}</span>
            <button disabled={currentPage >= totalPages || isLoading} onClick={() => setCurrentPage(p => p + 1)} className="px-4 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors">
              Next
            </button>
          </div>
        </div>

        {/* Right Side: Pending Edits */}
        <div className="w-1/3 bg-gray-50 flex flex-col border-l border-gray-200">
          <div className="p-6 flex-1 overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Pending Edits</h3>
            <p className="text-sm text-gray-600 mb-6">
              Hover over text and click to overwrite it inline. Note: Layout formatting is best-effort.
            </p>

            {edits.length === 0 ? (
              <div className="text-center py-12 px-4 border-2 border-dashed border-gray-300 rounded-xl bg-white">
                <Type className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-500">No edits made.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {edits.map((edit, idx) => (
                  <div key={idx} className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-1 relative group">
                    <button
                      onClick={() => removeEditBox(idx)}
                      className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-2">
                       <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium">Page {edit.pageNum + 1}</span>
                    </div>
                    <p className="text-sm text-gray-800 font-medium">
                       {edit.newText || <span className="text-gray-400 italic">Empty</span>}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-6 bg-white border-t border-gray-200">
            <button
              onClick={handleApply}
              disabled={edits.length === 0}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              <Check className="w-5 h-5" />
              Apply {edits.length} Edits
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
