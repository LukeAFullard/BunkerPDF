import { useUIStore } from "../../store/uiStore";
import { useState, useCallback } from "react";
import { PDFThumbnail } from "./PDFThumbnail";
import { useMobile } from "../../lib/useMobile";
import { type PDFDocument, useFileStore } from "../../store/fileStore";
import { useEffect } from "react";
import { getSmartOutputName } from "../../lib/utils";
import { ErrorModal } from "../ui/ErrorModal";
import { useProcessingStore } from "../../store/processingStore";
import { ContextMenu } from "../ui/ContextMenu";
import { decodeBarcodesFromPdf } from "../../lib/barcodeDecoder";
import { useAuditStore } from "../../store/auditStore";
import { BookmarkModal, type Bookmark } from "../ui/BookmarkModal";

interface DocumentCardProps {
  doc: PDFDocument;
  onRemove: (id: string) => void;
  onSplit: (doc: PDFDocument) => void;
  onOcr?: (doc: PDFDocument) => void;
  onRotate?: (doc: PDFDocument) => void;
  onWatermark?: (doc: PDFDocument) => void;
  onOptimize?: (doc: PDFDocument) => void;
  onDeletePages?: (doc: PDFDocument) => void;
  onReorderPages?: (doc: PDFDocument) => void;
  onAddPageNumbers?: (doc: PDFDocument) => void;
  onBatesNumbering?: (doc: PDFDocument) => void;
  onResizePages?: (doc: PDFDocument) => void;
  onEncrypt?: (doc: PDFDocument) => void;
  onSanitize?: (doc: PDFDocument) => void;
  onFlatten?: (doc: PDFDocument) => void;
  onShare?: (doc: PDFDocument) => void;
  onHighlight?: (doc: PDFDocument) => void;
  onSign?: (doc: PDFDocument) => void;
  onAudit?: (doc: PDFDocument) => void;
  onVerifySignature?: (doc: PDFDocument) => void;
  onReadAloud?: (doc: PDFDocument) => void;
  extractText: (bytes: Uint8Array) => Promise<string>;
  extractEntities: (text: string) => Promise<string[]>;
  extractTables?: (docFile: File) => Promise<Uint8Array>;
  extractMarkdown?: (bytes: Uint8Array) => Promise<string>;
  extractHtml?: (bytes: Uint8Array) => Promise<string>;
  extractImages?: (bytes: Uint8Array) => Promise<Uint8Array>;
  extractLinks?: (bytes: Uint8Array) => Promise<string>;
  extractBookmarks?: (bytes: Uint8Array) => Promise<string>;
  editBookmarks?: (bytes: Uint8Array, bookmarks: Bookmark[]) => Promise<Uint8Array>;
  redactPdf: (bytes: Uint8Array, redactions: string[]) => Promise<Uint8Array>;
  convertPdfToDocx?: (bytes: Uint8Array) => Promise<Uint8Array>;
  exportPdfToDark?: (bytes: Uint8Array) => Promise<Uint8Array>;
  updateDocumentFile: (
    id: string,
    newFile: File,
    newPageCount?: number,
  ) => void;
  onScanPii?: (doc: PDFDocument) => void;
}

export function DocumentCard({
  doc,
  onRemove,
  onSplit,
  onOcr,
  onRotate,
  onWatermark,
  onOptimize,
  onDeletePages,
  onReorderPages,
  onAddPageNumbers,
  onBatesNumbering,
  onResizePages,
  onEncrypt,
  onSanitize,
  onFlatten,
  onShare,
  onHighlight,
  onSign,
  onAudit,
  onVerifySignature,
  onReadAloud,
  onScanPii,
  extractText,
  extractEntities,
  extractTables,
  extractMarkdown,
  extractHtml,
  extractImages,
  extractLinks,
  extractBookmarks,
  editBookmarks,
  redactPdf,
  updateDocumentFile,
  convertPdfToDocx,
  exportPdfToDark,
}: DocumentCardProps) {
  const isMobile = useMobile();
  const { complexityMode, setComplexityMode, activeTool, setActiveTool } = useUIStore();
  const [detectedEntities, setDetectedEntities] = useState<string[] | null>(
    null,
  );
  const [selectedEntities, setSelectedEntities] = useState<Set<string>>(
    new Set(),
  );
  const [detectedCodes, setDetectedCodes] = useState<string[] | null>(null);
  const [errorState, setErrorState] = useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
  }>({ isOpen: false, title: "", message: "" });

  const {
    startProcessing,
    updateStage,
    stopProcessing,
    isActive: isProcessing,
  } = useProcessingStore();
  const undo = useFileStore((state) => state.undo);
  const redo = useFileStore((state) => state.redo);

  const canUndo = (doc.history?.past?.length ?? 0) > 0;
  const canRedo = (doc.history?.future?.length ?? 0) > 0;

  const activeDocumentId = useFileStore((state) => state.activeDocumentId);
  const isActive = activeDocumentId === doc.id;
  const addLog = useAuditStore((state) => state.addLog);
  const isDarkMode = useUIStore((state) => state.isDarkMode);

  const handleScan = useCallback(async () => {
    setDetectedEntities(null);
    setSelectedEntities(new Set());

    let isCancelled = false;
    startProcessing("Extracting text...", true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {
      const buffer = await doc.file.arrayBuffer();
      const pdfBytes = new Uint8Array(buffer);

      const text = await extractText(pdfBytes);
      if (isCancelled) return;

      if (!text || text.trim() === "") {
        setDetectedEntities([]);
        return;
      }

      updateStage("Scanning for PII...");
      const entities = await extractEntities(text);
      if (isCancelled) return;

      setDetectedEntities(entities);
      setSelectedEntities(new Set(entities)); // pre-select all
    } catch (err) {
      if (isCancelled) return;
      console.error(err);
      setErrorState({
        isOpen: true,
        title: "Scan Error",
        message: "An error occurred while scanning the document.",
      });
    } finally {
      if (!isCancelled) stopProcessing();
    }
  }, [doc.file, extractEntities, extractText, startProcessing, stopProcessing, updateStage]);

  useEffect(() => {
    if (isActive && activeTool) {
      setTimeout(() => {
        switch (activeTool) {
          case 'redact':
            if (onScanPii) onScanPii(doc);
            else handleScan();
            break;
          case 'extract-tables':
            // Instead of calling handleExtractTables before declaration, we do the logic inline or via an effect dep
            if (extractTables) {
              const doExtract = async () => {
                let isCancelled = false;
                startProcessing("Extracting tables...", true, () => {
                  isCancelled = true;
                  stopProcessing();
                });
                try {
                  const excelBytes = await extractTables(doc.file);
                  if (isCancelled) return;
                  const standardBuffer = new Uint8Array(excelBytes.length);
                  standardBuffer.set(excelBytes);
                  const blob = new Blob([standardBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = doc.name.replace(/\.pdf$/i, "-tables.xlsx");
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                  addLog("Extract Tables", "Extracted tables to Excel format.", doc.name);
                  useUIStore.getState().showFeedbackPrompt("Extract Tables");
                } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
                  if (isCancelled) return;
                  console.error(err);
                  setErrorState({ isOpen: true, title: "Extraction Error", message: err.message || "Failed to extract tables." });
                } finally {
                  if (!isCancelled) stopProcessing();
                }
              };
              doExtract();
            }
            break;
          case 'watermark':
            onWatermark?.(doc);
            break;
          case 'split':
            onSplit?.(doc);
            break;
          case 'merge':
            // Merge is a workspace tool, handle via App context? Or just ignore here.
            break;
        }
        setActiveTool(null);
      }, 500); // small delay to allow UI to settle
    }

  }, [isActive, activeTool, setActiveTool, doc, onScanPii, onWatermark, onSplit, extractTables, startProcessing, stopProcessing, addLog, handleScan]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isActive) return;

      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        if (e.shiftKey) {
          e.preventDefault();
          if (canRedo) redo(doc.id);
        } else {
          e.preventDefault();
          if (canUndo) undo(doc.id);
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key === "y") {
        e.preventDefault();
        if (canRedo) redo(doc.id);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [doc.id, canUndo, canRedo, undo, redo, isActive]);

  const handleDownload = () => {
    const url = URL.createObjectURL(doc.file);
    const a = document.createElement("a");
    a.href = url;
    a.download = getSmartOutputName(doc.name, "saved");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  const [contextMenuState, setContextMenuState] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [bookmarkModalState, setBookmarkModalState] = useState<{
    isOpen: boolean;
    bookmarks: Bookmark[];
  }>({ isOpen: false, bookmarks: [] });

  const handleEditBookmarks = async () => {
    if (!extractBookmarks) return;
    let isCancelled = false;
    startProcessing("Extracting bookmarks...", true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {
      const buffer = await doc.file.arrayBuffer();
      const pdfBytes = new Uint8Array(buffer);
      const jsonBookmarks = await extractBookmarks(pdfBytes);
      if (isCancelled) return;

      const bookmarks = JSON.parse(jsonBookmarks) as Bookmark[];

      setBookmarkModalState({ isOpen: true, bookmarks });

    } catch (e) {
      if (isCancelled) return;
      console.error(e);
      setErrorState({
        isOpen: true,
        title: "Bookmark Extraction Error",
        message: "Failed to extract bookmarks from this document.",
      });
    } finally {
      if (!isCancelled) stopProcessing();
    }
  };

  const handleSaveBookmarks = async (bookmarks: Bookmark[]) => {
    setBookmarkModalState({ isOpen: false, bookmarks: [] });
    if (!editBookmarks) return;

    let isCancelled = false;
    startProcessing("Saving bookmarks...", true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {
      const buffer = await doc.file.arrayBuffer();
      const pdfBytes = new Uint8Array(buffer);
      const newBytes = await editBookmarks(pdfBytes, bookmarks);
      if (isCancelled) return;

      // Need to convert to a regular array to avoid SharedArrayBuffer issues with File constructor
      const standardBuffer = new Uint8Array(newBytes.length);
      standardBuffer.set(newBytes);
      const newFile = new File([standardBuffer], doc.name, {
        type: "application/pdf",
      });
      updateDocumentFile(doc.id, newFile);
      addLog("Edit Bookmarks", "Updated document bookmarks (TOC)", doc.name);
    } catch (e) {
      if (isCancelled) return;
      console.error(e);
      setErrorState({
        isOpen: true,
        title: "Save Bookmarks Error",
        message: "Failed to save bookmarks to this document.",
      });
    } finally {
      if (!isCancelled) stopProcessing();
    }
  };


  const handleExtractMarkdown = async () => {
    if (!extractMarkdown) return;
    let isCancelled = false;
    startProcessing("Extracting markdown...", true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {
      const buffer = await doc.file.arrayBuffer();
      const pdfBytes = new Uint8Array(buffer);
      const markdown = await extractMarkdown(pdfBytes);
      if (isCancelled) return;

      const blob = new Blob([markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.name.replace(/\.pdf$/i, ".md");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addLog("Extract Markdown", "Extracted document to structured Markdown notes.", doc.name);
      useUIStore.getState().showFeedbackPrompt("Extract Notes");
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (isCancelled) return;
      console.error(err);
      setErrorState({
        isOpen: true,
        title: "Extraction Error",
        message: err.message || "An error occurred while extracting markdown.",
      });
    } finally {
      if (!isCancelled) stopProcessing();
    }
  };


  const handleExportDark = async () => {
    if (!exportPdfToDark) return;
    let isCancelled = false;
    startProcessing("Exporting to True Dark PDF...", true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {
      const buffer = await doc.file.arrayBuffer();
      const pdfBytes = new Uint8Array(buffer);
      const newPdfBytes = await exportPdfToDark(pdfBytes);
      if (isCancelled) return;

      const standardBuffer = new Uint8Array(newPdfBytes.length);
      standardBuffer.set(newPdfBytes);

      const blob = new Blob([standardBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.name.replace(/\.pdf$/i, "-dark.pdf");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addLog("Export Dark", "Exported document to True Dark Mode.", doc.name);
      useUIStore.getState().showFeedbackPrompt("Export Dark");
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (isCancelled) return;
      console.error(err);
      setErrorState({
        isOpen: true,
        title: "Export Error",
        message: err.message || "An error occurred while exporting Dark PDF.",
      });
    } finally {
      if (!isCancelled) stopProcessing();
    }
  };

  const handleExportDocx = async () => {
    if (!convertPdfToDocx) return;
    let isCancelled = false;
    startProcessing("Exporting to DOCX...", true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {
      const buffer = await doc.file.arrayBuffer();
      const pdfBytes = new Uint8Array(buffer);
      const docxBytes = await convertPdfToDocx(pdfBytes);
      if (isCancelled) return;

      const standardBuffer = new Uint8Array(docxBytes.length);
      standardBuffer.set(docxBytes);

      const blob = new Blob([standardBuffer], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.name.replace(/\.pdf$/i, ".docx");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addLog("Export DOCX", "Exported document to DOCX format.", doc.name);
      useUIStore.getState().showFeedbackPrompt("Export DOCX");
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (isCancelled) return;
      console.error(err);
      setErrorState({
        isOpen: true,
        title: "Export Error",
        message: err.message || "An error occurred while exporting DOCX.",
      });
    } finally {
      if (!isCancelled) stopProcessing();
    }
  };

  const handleExtractHtml = async () => {
    if (!extractHtml) return;
    let isCancelled = false;
    startProcessing("Extracting HTML...", true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {
      const buffer = await doc.file.arrayBuffer();
      const pdfBytes = new Uint8Array(buffer);
      const html = await extractHtml(pdfBytes);
      if (isCancelled) return;

      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.name.replace(/\.pdf$/i, ".html");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addLog("Extract HTML", "Extracted document to HTML format.", doc.name);
      useUIStore.getState().showFeedbackPrompt("Extract Web");
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (isCancelled) return;
      console.error(err);
      setErrorState({
        isOpen: true,
        title: "Extraction Error",
        message: err.message || "An error occurred while extracting HTML.",
      });
    } finally {
      if (!isCancelled) stopProcessing();
    }
  };

  const handleExtractTables = async () => {
    if (!extractTables) return;
    let isCancelled = false;
    startProcessing("Extracting tables...", true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {
      const excelBytes = await extractTables(doc.file);
      if (isCancelled) return;

      const standardBuffer = new Uint8Array(excelBytes.length);
      standardBuffer.set(excelBytes);

      const blob = new Blob([standardBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.name.replace(/\.pdf$/i, "-tables.xlsx");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addLog("Extract Tables", "Extracted tables to Excel format.", doc.name);
      useUIStore.getState().showFeedbackPrompt("Extract Tables");
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (isCancelled) return;
      console.error(err);
      setErrorState({
        isOpen: true,
        title: "Extraction Error",
        message: err.message || "An error occurred while extracting tables.",
      });
    } finally {
      if (!isCancelled) stopProcessing();
    }
  };


  const handleExtractLinks = async () => {
    if (!extractLinks) return;
    let isCancelled = false;
    startProcessing("Extracting links...", true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {
      const buffer = await doc.file.arrayBuffer();
      const pdfBytes = new Uint8Array(buffer);
      const jsonLinks = await extractLinks(pdfBytes);
      if (isCancelled) return;

      const links = JSON.parse(jsonLinks) as { page: number; uri: string }[];

      if (links.length === 0) {
        throw new Error("No links found in the document.");
      }

      // Convert to CSV
      const csvRows = ["Page,URI"];
      for (const link of links) {
        const escapedUri = link.uri.replace(/"/g, '""');
        csvRows.push(`${link.page},"${escapedUri}"`);
      }
      const csvString = csvRows.join("\n");

      const blob = new Blob([csvString], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = getSmartOutputName(doc.name, "links").replace(/\.pdf$/i, ".csv");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addLog("Extract Links", `Extracted ${links.length} links to CSV.`, doc.name);
      useUIStore.getState().showFeedbackPrompt("Extract Links");
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (isCancelled) return;
      console.error(err);
      setErrorState({
        isOpen: true,
        title: "Extraction Error",
        message: err.message || "An error occurred while extracting links.",
      });
    } finally {
      if (!isCancelled) stopProcessing();
    }
  };

  const handleExtractImages = async () => {
    let isCancelled = false;
    startProcessing("Initializing Pyodide (First load takes longer)...", true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {

      const pdfBytes = await doc.file.arrayBuffer();

      if (!extractImages) throw new Error("extractImages function not provided.");
      const result = await extractImages(new Uint8Array(pdfBytes));

      if (isCancelled) return;


      const standardBuffer = new Uint8Array(result.length);
      standardBuffer.set(result);
      const blob = new Blob([standardBuffer], { type: "application/zip" });

      if (blob.size <= 22) {
        throw new Error("No images found in the document.");
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = getSmartOutputName(doc.name, "images").replace(/\.pdf$/i, ".zip");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addLog("Extract Images", "Extracted images to ZIP format.", doc.name);
      useUIStore.getState().showFeedbackPrompt("Extract Images");
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (isCancelled) return;
      console.error(err);
      setErrorState({
        isOpen: true,
        title: "Extraction Error",
        message: err.message || "An error occurred while extracting images.",
      });
    } finally {
      if (!isCancelled) stopProcessing();
    }
  };

  const handleScanCodes = async () => {
    setDetectedCodes(null);

    let isCancelled = false;
    startProcessing("Scanning for barcodes...", true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {
      const codes = await decodeBarcodesFromPdf(doc.file);
      if (isCancelled) return;

      setDetectedCodes(codes);
      if (codes.length === 0) {
        setErrorState({
          isOpen: true,
          title: "Scan Complete",
          message: "No readable barcodes or QR codes were found in this document.",
        });
      }
    } catch (err) {
      if (isCancelled) return;
      console.error(err);
      setErrorState({
        isOpen: true,
        title: "Scan Error",
        message: "An error occurred while scanning for barcodes.",
      });
    } finally {
      if (!isCancelled) stopProcessing();
    }
  };

  const handleRedact = async () => {
    if (selectedEntities.size === 0) return;

    let isCancelled = false;
    startProcessing("Redacting document...", true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {
      const buffer = await doc.file.arrayBuffer();
      const pdfBytes = new Uint8Array(buffer);
      const redactions = Array.from(selectedEntities);

      const redactedBytes = await redactPdf(pdfBytes, redactions);
      if (isCancelled) return;

      // Need standard array buffer without TS complaints for shared buffer
      const standardBuffer = new Uint8Array(redactedBytes.length);
      standardBuffer.set(redactedBytes);

      const newFile = new File([standardBuffer], doc.name, {
        type: "application/pdf",
      });
      updateDocumentFile(doc.id, newFile);

      setDetectedEntities(null); // Clear sidebar after redaction
      useUIStore.getState().showFeedbackPrompt("Redact");
    } catch (err) {
      if (isCancelled) return;
      console.error(err);
      setErrorState({
        isOpen: true,
        title: "Redaction Error",
        message: "An error occurred while redacting the document.",
      });
    } finally {
      if (!isCancelled) stopProcessing();
    }
  };

  const toggleEntity = (entity: string) => {
    setSelectedEntities((prev) => {
      const next = new Set(prev);
      if (next.has(entity)) {
        next.delete(entity);
      } else {
        next.add(entity);
      }
      return next;
    });
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent default browser context menu
    setContextMenuState({ x: e.clientX, y: e.clientY });
  };

  return (
    <div className={`rounded-xl border shadow-sm flex flex-col hover:shadow-md transition-shadow relative ${isDarkMode ? "bg-gray-800 border-gray-700 text-gray-100" : "bg-white border-gray-200 text-gray-900"}`}>
      {contextMenuState && (
        <ContextMenu
          x={contextMenuState.x}
          y={contextMenuState.y}
          onClose={() => setContextMenuState(null)}
items={[
            { label: "Extract / Split (~Instant)", onClick: () => onSplit(doc) },
            { label: "Rotate 90° (~Instant)", onClick: () => onRotate?.(doc) },
            { variant: "separator" },
            { label: "Add Watermark (~1s)", onClick: () => onWatermark?.(doc) },
            { label: "Highlight Text (~2s)", onClick: () => onHighlight?.(doc) },
            { label: "Sign Document (~2s)", onClick: () => onSign?.(doc) },
            { variant: "separator" },
            (!isMobile ? { label: "Extract Tables (Excel) (~10s)", onClick: handleExtractTables } : null),
            (!isMobile ? { label: "Extract Notes (MD) (~5s)", onClick: handleExtractMarkdown } : null),
            (!isMobile ? { label: "Extract Web (HTML) (~5s)", onClick: handleExtractHtml } : null),
            (!isMobile ? { label: "Export DOCX (~10s)", onClick: handleExportDocx } : null),
            (!isMobile ? { label: "Export True Dark (~10s)", onClick: handleExportDark } : null),
            (!isMobile ? { label: "Extract Links (CSV) (~2s)", onClick: handleExtractLinks } : null),
            { variant: "separator" },
            { label: "Optimize (Compress) (~5s)", onClick: () => onOptimize?.(doc) },
            { label: "Delete Pages (~1s)", onClick: () => onDeletePages?.(doc) },
            { label: "Reorder Pages (~1s)", onClick: () => onReorderPages?.(doc) },
            { label: "Add Page Numbers (~2s)", onClick: () => onAddPageNumbers?.(doc) },
            { label: "Bates Numbering (~2s)", onClick: () => onBatesNumbering?.(doc) },
            { label: "Resize to A4/Letter (~2s)", onClick: () => onResizePages?.(doc) },
            (!isMobile ? { label: "Edit Bookmarks/Outline (~2s)", onClick: handleEditBookmarks } : null),
            { variant: "separator" },
            (!isMobile ? { label: "Protect (Password) (~2s)", onClick: () => onEncrypt?.(doc) } : null),
            (!isMobile ? { label: "Sanitize & Send (~Instant)", onClick: () => onSanitize?.(doc) } : null),
            { label: "Flatten Forms (~1s)", onClick: () => onFlatten?.(doc) },
            { variant: "separator" },
            (!isMobile ? { label: "Audit Redactions (~5s)", onClick: () => onAudit?.(doc) } : null),
            (!isMobile ? { label: "Verify Signatures (~2s)", onClick: () => onVerifySignature?.(doc) } : null),
            (!isMobile ? { label: "Read Aloud (TTS) (~15s/pg)", onClick: () => onReadAloud?.(doc) } : null),
            { variant: "separator" },
            { label: "Share (URL, <64KB only)", onClick: () => onShare?.(doc) },
            {
              label: "Remove File",
              variant: "danger",
              onClick: () => onRemove(doc.id),
            },
          ].filter(Boolean) as any} // eslint-disable-line @typescript-eslint/no-explicit-any
        />
      )}
      <BookmarkModal
        isOpen={bookmarkModalState.isOpen}
        bookmarks={bookmarkModalState.bookmarks}
        maxPages={doc.pageCount || 1}
        onClose={() => setBookmarkModalState((prev) => ({ ...prev, isOpen: false }))}
        onSave={handleSaveBookmarks}
      />
      <ErrorModal
        isOpen={errorState.isOpen}
        title={errorState.title}
        message={errorState.message}
        onClose={() => setErrorState((prev) => ({ ...prev, isOpen: false }))}
      />
      <div className="p-4 flex flex-col justify-between flex-1">
        <div
          className="mb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          onContextMenu={handleContextMenu}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              // Trigger context menu manually for keyboard users
              const rect = e.currentTarget.getBoundingClientRect();
              setContextMenuState({
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
              });
            }
          }}
          tabIndex={0}
          role="button"
          aria-label={`Open context menu for ${doc.name}`}
        >
          <PDFThumbnail file={doc.file} />
        </div>
        <div>
          <h3 className="font-semibold text-lg truncate" title={doc.name}>
            {doc.name}
          </h3>
          <div className={`text-sm mt-1 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
            <p>Size: {(doc.size / 1024 / 1024).toFixed(2)} MB</p>
            <p>
              Pages:{" "}
              {doc.pageCount !== undefined ? doc.pageCount : "Loading..."}
            </p>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => undo(doc.id)}
              disabled={isProcessing || !canUndo}
              className="text-gray-600 hover:text-gray-800 text-sm font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 rounded px-1"
              title="Undo (Cmd+Z)"
            >
              Undo
            </button>
            <button
              onClick={() => redo(doc.id)}
              disabled={isProcessing || !canRedo}
              className="text-gray-600 hover:text-gray-800 text-sm font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 rounded px-1"
              title="Redo (Cmd+Shift+Z)"
            >
              Redo
            </button>
            <button
              onClick={handleDownload}
              disabled={isProcessing}
              className="text-green-600 hover:text-green-800 text-sm font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 rounded px-1 ml-auto"
            >
              Download
            </button>
            <button
              onClick={() => onRemove(doc.id)}
              disabled={isProcessing}
              className="text-red-500 hover:text-red-700 text-sm font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded px-1"
            >
              Remove
            </button>
          </div>

          <details className="mb-2">
            <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 select-none">Extract & Export</summary>
            <div className="flex flex-wrap gap-2 mt-2">
              <button onClick={() => onSplit(doc)} disabled={isProcessing} className="text-blue-600 hover:text-blue-800 text-sm font-medium disabled:opacity-50">Split</button>
              {!isMobile && (
                <>
                  <button onClick={handleExtractTables} disabled={isProcessing} className="text-green-600 hover:text-green-800 text-sm font-medium disabled:opacity-50">Extract Tables</button>
                  <button onClick={handleExtractMarkdown} disabled={isProcessing} className="text-fuchsia-600 hover:text-fuchsia-800 text-sm font-medium disabled:opacity-50">Extract Notes</button>
                  <button onClick={handleExtractHtml} disabled={isProcessing} className="text-orange-600 hover:text-orange-800 text-sm font-medium disabled:opacity-50">Extract Web</button>
                  <button onClick={handleExportDocx} disabled={isProcessing} className="text-blue-600 hover:text-blue-800 text-sm font-medium disabled:opacity-50">Export DOCX</button>
                  <button onClick={handleExportDark} disabled={isProcessing} className="text-gray-900 dark:text-gray-100 hover:text-gray-600 text-sm font-medium disabled:opacity-50">Export Dark</button>
                  <button onClick={handleExtractImages} disabled={isProcessing} className="text-cyan-600 hover:text-cyan-800 text-sm font-medium disabled:opacity-50">Extract Images</button>
                  <button onClick={handleExtractLinks} disabled={isProcessing} className="text-amber-600 hover:text-amber-800 text-sm font-medium disabled:opacity-50">Extract Links</button>
                </>
              )}
            </div>
          </details>

          <details className="mb-2">
            <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 select-none">Modify & Secure</summary>
            <div className="flex flex-wrap gap-2 mt-2">
              {!isMobile && (
                <>
                  <button onClick={() => onFlatten?.(doc)} disabled={isProcessing} className="text-stone-600 hover:text-stone-800 text-sm font-medium disabled:opacity-50">Flatten</button>
                  <button onClick={() => onSanitize?.(doc)} disabled={isProcessing} className="text-indigo-600 hover:text-indigo-800 text-sm font-medium disabled:opacity-50">Sanitize</button>
                  <button onClick={() => onHighlight?.(doc)} disabled={isProcessing} className="text-teal-600 hover:text-teal-800 text-sm font-medium disabled:opacity-50">Highlight</button>
                  <button onClick={() => onSign?.(doc)} disabled={isProcessing} className="text-pink-600 hover:text-pink-800 text-sm font-medium disabled:opacity-50">Sign</button>
                  <button onClick={() => onResizePages?.(doc)} disabled={isProcessing} className="text-emerald-600 hover:text-emerald-800 text-sm font-medium disabled:opacity-50">Resize</button>
                  <button onClick={() => onAudit?.(doc)} disabled={isProcessing} className="text-yellow-600 hover:text-yellow-800 text-sm font-medium disabled:opacity-50">Audit</button>
                  <button onClick={() => onVerifySignature?.(doc)} disabled={isProcessing} className="text-blue-500 hover:text-blue-700 text-sm font-medium disabled:opacity-50">Verify Sigs</button>
                </>
              )}
            </div>
          </details>

          <details>
            <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 select-none">Analyze (AI)</summary>
            <div className="flex flex-wrap gap-2 mt-2">
              {!isMobile && (
                <>
                  <button onClick={handleScan} disabled={isProcessing} className="text-purple-600 hover:text-purple-800 text-sm font-medium disabled:opacity-50">Scan PII</button>
                  <button onClick={handleScanCodes} disabled={isProcessing} className="text-orange-600 hover:text-orange-800 text-sm font-medium disabled:opacity-50">Scan Codes</button>
                  <button onClick={() => { if (complexityMode === 'simple') setComplexityMode('professional'); onOcr?.(doc); }} disabled={isProcessing} className="text-orange-600 hover:text-orange-800 text-sm font-medium disabled:opacity-50">OCR</button>
                  <button onClick={() => onReadAloud?.(doc)} disabled={isProcessing} className="text-blue-600 hover:text-blue-800 text-sm font-medium disabled:opacity-50">Read Aloud</button>
                </>
              )}
            </div>
          </details>

          {isMobile && (
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded block mt-2">Mobile Utility Mode</span>
          )}
        </div>
      </div>

      {/* PII Sidebar / Overlay */}
      {detectedEntities !== null && (
        <div className="absolute top-0 right-0 lg:left-full lg:ml-4 w-64 bg-white border border-gray-200 rounded-xl shadow-lg p-4 z-20">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-semibold text-gray-800">Detected PII</h4>
            <button
              onClick={() => setDetectedEntities(null)}
              className="text-gray-400 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 rounded"
              aria-label="Close PII panel"
            >
              ×
            </button>
          </div>

          {detectedEntities.length === 0 ? (
            <p className="text-sm text-gray-500">
              No sensitive information found.
            </p>
          ) : (
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
              {detectedEntities.map((entity, i) => (
                <label
                  key={i}
                  className="flex items-start gap-2 text-sm cursor-pointer hover:bg-gray-50 p-1 rounded"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selectedEntities.has(entity)}
                    onChange={() => toggleEntity(entity)}
                  />
                  <span className="break-all">{entity}</span>
                </label>
              ))}
            </div>
          )}

          {detectedEntities.length > 0 && (
            <button
              onClick={handleRedact}
              disabled={isProcessing || selectedEntities.size === 0}
              className="w-full mt-4 bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1"
            >
              Redact {selectedEntities.size} items
            </button>
          )}
        </div>
      )}

      {/* Barcode Scanner Sidebar / Overlay */}
      {detectedCodes !== null && detectedCodes.length > 0 && (
        <div className="absolute top-0 right-full mr-4 w-64 bg-white border border-gray-200 rounded-xl shadow-lg p-4 z-10">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-semibold text-gray-800">Detected Codes</h4>
            <button
              onClick={() => setDetectedCodes(null)}
              className="text-gray-400 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 rounded"
              aria-label="Close barcode panel"
            >
              ×
            </button>
          </div>

          <div className="flex flex-col gap-3 max-h-64 overflow-y-auto">
            {detectedCodes.map((code, i) => (
              <div key={i} className="flex flex-col gap-1 p-2 bg-gray-50 rounded text-sm border border-gray-100">
                <span className="break-all font-mono text-xs">{code}</span>
                {(code.startsWith("http://") || code.startsWith("https://")) && (
                  <a
                    href={code}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline text-xs"
                  >
                    Open Link
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
