import { loadPdfDocument } from "../../lib/pdfHelper";
import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';
import { X, Table2, ZoomIn, ZoomOut, Loader2, Save, Calculator } from 'lucide-react';
import { useFileStore } from '../../store/fileStore';
import { cleanupPdfResources } from '../../lib/pdfCleanup';
import { getConfiguredLiteParse } from '../../lib/liteparseEngine';


interface TableRegion {
  pageNum: number;
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  grid: { text: string; x: number; y: number; width: number; height: number; originalText: string }[][];
}

interface SmartTableReflowModalProps {
  isOpen: boolean;
  docId: string | null;
  onClose: () => void;
  onApplyEdits: (edits: { pageNum: number; x: number; y: number; width: number; height: number; newText: string }[]) => void;
}

export function SmartTableReflowModal({ isOpen, docId, onClose, onApplyEdits }: SmartTableReflowModalProps) {
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

  const [tables, setTables] = useState<TableRegion[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [editedGrid, setEditedGrid] = useState<TableRegion['grid'] | null>(null);

  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  useEffect(() => {
    if (!isOpen || !doc) return;
    setZoomLevel(1.0);
    setCurrentPage(1);
    setTables([]);
    setSelectedTableId(null);
    setEditedGrid(null);

    let isMounted = true;
    setIsLoading(true);

    const loadPdfAndLiteparse = async () => {
      try {
        const arrayBuffer = await doc.file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

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
          const detectedTables: TableRegion[] = [];

          if (result.pages) {
            result.pages.forEach((page: any, pageIdx: number) => {
              if (page.textItems && page.textItems.length > 0) {
                 // Group by Y
                 const rowTolerance = 5;
                 const rows: { items: any[], y: number }[] = [];
                 for (const item of page.textItems) {
                    let foundRow = false;
                    for (const row of rows) {
                      if (Math.abs(row.y - item.y) < rowTolerance) {
                        row.items.push(item);
                        foundRow = true;
                        break;
                      }
                    }
                    if (!foundRow) rows.push({ items: [item], y: item.y });
                 }
                 rows.sort((a, b) => a.y - b.y);

                 // Identify tables: contiguous blocks of rows with multiple items (multi-column)
                 let currentTableRows: typeof rows = [];
                 const rawTables: (typeof rows)[] = [];

                 // Heuristic: A table must have at least 2 rows and most rows must have >1 item
                 for(let i=0; i<rows.length; i++) {
                     if (rows[i].items.length > 1) {
                         currentTableRows.push(rows[i]);
                     } else {
                         // Gap or single item row breaks the table
                         if (currentTableRows.length >= 2) {
                             rawTables.push(currentTableRows);
                         }
                         currentTableRows = [];
                     }
                 }
                 if (currentTableRows.length >= 2) rawTables.push(currentTableRows);

                 // Convert to grid
                 rawTables.forEach((rawTable, tableIdx) => {
                    const xPositions: number[] = [];
                    for (const row of rawTable) {
                      for (const item of row.items) {
                        if (!xPositions.some(x => Math.abs(x - item.x) < 10)) {
                          xPositions.push(item.x);
                        }
                      }
                    }
                    xPositions.sort((a, b) => a - b);

                    const grid: TableRegion['grid'] = [];
                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

                    for (const row of rawTable) {
                      // Init empty row
                      const gridRow: { text: string; x: number; y: number; width: number; height: number; originalText: string }[] =
                          Array(xPositions.length).fill({ text: '', x: 0, y: 0, width: 0, height: 0, originalText: '' });

                      for (const item of row.items) {
                        minX = Math.min(minX, item.x);
                        minY = Math.min(minY, item.y);
                        maxX = Math.max(maxX, item.x + item.width);
                        maxY = Math.max(maxY, item.y + item.height);

                        let minDiff = Infinity;
                        let colIndex = 0;
                        for (let i = 0; i < xPositions.length; i++) {
                          const diff = Math.abs(xPositions[i] - item.x);
                          if (diff < minDiff) {
                            minDiff = diff;
                            colIndex = i;
                          }
                        }
                        gridRow[colIndex] = {
                            text: item.text,
                            x: item.x,
                            y: item.y,
                            width: item.width,
                            height: item.height,
                            originalText: item.text
                        };
                      }
                      grid.push(gridRow);
                    }

                    detectedTables.push({
                        pageNum: pageIdx,
                        id: `${pageIdx}-${tableIdx}`,
                        x: minX,
                        y: minY,
                        width: maxX - minX,
                        height: maxY - minY,
                        grid
                    });
                 });
              }
            });
          }

          setTables(detectedTables);

          setTimeout(() => {
            if (isMounted) renderPage(1, pdf);
          }, 0);
        }
      } catch (err) {
        console.error("Error loading PDF or LiteParse for Smart Table", err);
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
  }, [isOpen, doc]);

  const renderPage = async (pageNum: number, pdf: pdfjsLib.PDFDocumentProxy) => {
    setIsLoading(true);
    try {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }

      const page = await pdf.getPage(pageNum);
      const canvas = canvasRef.current;
      const overlayDiv = overlayRef.current;
      if (!canvas || !overlayDiv) return;

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

      const renderContext: any = {
        canvasContext: context,
        transform: transform as number[] | undefined,
        viewport: viewport,
      };

      renderTaskRef.current = page.render(renderContext);
      await renderTaskRef.current.promise;

      overlayDiv.style.width = `${canvas.style.width}`;
      overlayDiv.style.height = `${canvas.style.height}`;
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

  useEffect(() => {
    if (isOpen && pdfDocRef.current) {
      renderPage(currentPage, pdfDocRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, zoomLevel]);

  const handleTableClick = (table: TableRegion) => {
      setSelectedTableId(table.id);
      // Deep copy grid
      setEditedGrid(JSON.parse(JSON.stringify(table.grid)));
  };

  const handleCellEdit = (rIdx: number, cIdx: number, newText: string) => {
      if (!editedGrid) return;
      const newGrid = [...editedGrid];
      newGrid[rIdx][cIdx].text = newText;
      setEditedGrid(newGrid);
  };

  const handleApplyEdits = () => {
      if (!editedGrid || !selectedTableId) return;
      const edits: { pageNum: number; x: number; y: number; width: number; height: number; newText: string }[] = [];
      const table = tables.find(t => t.id === selectedTableId);
      if(!table) return;

      for (let r = 0; r < editedGrid.length; r++) {
          for (let c = 0; c < editedGrid[r].length; c++) {
              const cell = editedGrid[r][c];
              if (cell.text !== cell.originalText && cell.width > 0) {
                  edits.push({
                      pageNum: table.pageNum,
                      x: cell.x,
                      y: cell.y,
                      width: cell.width,
                      height: cell.height,
                      newText: cell.text
                  });
              }
          }
      }
      onApplyEdits(edits);
  };

  const handleSumColumn = (cIdx: number) => {
      if (!editedGrid) return;
      let sum = 0;
      for (let r = 0; r < editedGrid.length; r++) {
          const val = parseFloat(editedGrid[r][cIdx].text.replace(/[^0-9.-]+/g,""));
          if (!isNaN(val)) sum += val;
      }
      alert(`Sum of column ${cIdx + 1}: ${sum}`);
  };

  if (!isOpen || !doc) return null;

  const pageIdx = currentPage - 1;
  const currentPageTables = tables.filter(t => t.pageNum === pageIdx);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl flex h-[90vh] overflow-hidden">

        {/* Left Side: PDF Preview */}
        <div className="w-1/2 bg-gray-100 flex flex-col relative">
          <div className="bg-white p-4 flex items-center justify-between shadow-sm z-10 border-b border-gray-200">
            <div>
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Table2 className="w-5 h-5 text-emerald-600" />
                Smart Table Re-flow
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
            </div>
          </div>

          <div className="flex-1 overflow-auto relative flex justify-center items-start p-8">
            {isLoading && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/50 backdrop-blur-sm">
                 <div className="flex flex-col items-center gap-3">
                   <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
                   <span className="text-sm font-medium text-gray-600">
                     Rendering Page...
                   </span>
                 </div>
              </div>
            )}

            {error ? (
               <div className="text-red-500 p-4 bg-red-50 rounded-lg">{error}</div>
            ) : (
               <div className="relative shadow-xl ring-1 ring-black/5" style={{ minWidth: 'max-content' }}>
                  <canvas ref={canvasRef} className="block pointer-events-none" />

                  <div
                     ref={overlayRef}
                     className="absolute top-0 left-0"
                  >
                     {!isLoading && overlayScale > 0 && currentPageTables.map((table) => {
                        const isSelected = selectedTableId === table.id;
                        return (
                           <div
                             key={table.id}
                             onClick={() => handleTableClick(table)}
                             className={`absolute cursor-pointer rounded border-2 z-30 transition-all ${
                                 isSelected
                                 ? 'border-emerald-500 bg-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.5)] ring-2 ring-emerald-300'
                                 : 'border-emerald-400 border-dashed bg-emerald-400/10 hover:bg-emerald-400/30'
                             }`}
                             style={{
                               left: `${table.x * overlayScale - 4}px`,
                               top: `${table.y * overlayScale - 4}px`,
                               width: `${table.width * overlayScale + 8}px`,
                               height: `${table.height * overlayScale + 8}px`,
                             }}
                           >
                               {isSelected && (
                                   <div className="absolute -top-6 left-0 bg-emerald-600 text-white text-xs px-2 py-1 rounded shadow">
                                       Table Selected
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

        {/* Right Side: Spreadsheet View */}
        <div className="w-1/2 bg-white flex flex-col relative border-l border-gray-200">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
             <div>
                <h3 className="text-lg font-bold text-gray-800">Interactive Spreadsheet</h3>
                <p className="text-xs text-gray-500">Edit cells to modify the PDF</p>
             </div>
             <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-200 rounded-full transition-colors">
               <X className="w-5 h-5" />
             </button>
          </div>

          <div className="flex-1 overflow-auto p-4 bg-gray-50/50">
             {!selectedTableId ? (
                 <div className="h-full flex flex-col items-center justify-center text-gray-400">
                     <Table2 className="w-12 h-12 mb-4 opacity-50" />
                     <p>Select a highlighted table on the left</p>
                 </div>
             ) : (
                 <div className="overflow-x-auto shadow ring-1 ring-gray-200 rounded-lg bg-white">
                     <table className="min-w-full divide-y divide-gray-200 text-sm">
                         <thead className="bg-gray-100 sticky top-0 z-10">
                             <tr>
                                 {editedGrid?.[0]?.map((_, cIdx) => (
                                     <th key={cIdx} className="px-3 py-2 text-left font-semibold text-gray-600 border-x border-gray-200 group relative">
                                         Col {cIdx + 1}
                                         <button
                                             onClick={() => handleSumColumn(cIdx)}
                                             className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded hidden group-hover:block transition-colors"
                                             title="Sum Column"
                                         >
                                             <Calculator className="w-3.5 h-3.5" />
                                         </button>
                                     </th>
                                 ))}
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-gray-200 bg-white">
                             {editedGrid?.map((row, rIdx) => (
                                 <tr key={rIdx} className="hover:bg-gray-50 transition-colors">
                                     {row.map((cell, cIdx) => (
                                         <td key={cIdx} className="p-0 border-x border-gray-200">
                                             <input
                                                 type="text"
                                                 value={cell.text}
                                                 onChange={(e) => handleCellEdit(rIdx, cIdx, e.target.value)}
                                                 className={`w-full px-3 py-2 focus:outline-none focus:ring-inset focus:ring-2 focus:ring-emerald-500 bg-transparent ${cell.text !== cell.originalText ? 'font-medium text-emerald-700 bg-emerald-50/50' : 'text-gray-700'}`}
                                                 disabled={cell.width === 0} // Disable empty filler cells
                                             />
                                         </td>
                                     ))}
                                 </tr>
                             ))}
                         </tbody>
                     </table>
                 </div>
             )}
          </div>

          <div className="p-4 border-t border-gray-200 bg-white flex justify-end gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20">
             <button
                disabled={!selectedTableId}
                onClick={() => setEditedGrid(JSON.parse(JSON.stringify(tables.find(t=>t.id===selectedTableId)?.grid)))}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
             >
                Discard Edits
             </button>
             <button
                disabled={!selectedTableId}
                onClick={handleApplyEdits}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 shadow-sm"
             >
                <Save className="w-4 h-4" />
                Apply to PDF
             </button>
          </div>
        </div>

      </div>
    </div>
  );
}
