import { useUIStore } from "../../store/uiStore";
import React from "react";
import { PDFThumbnail } from "./PDFThumbnail";
import { useMobile } from "../../lib/useMobile";
import { type PDFDocument, useFileStore } from "../../store/fileStore";
import { getSmartOutputName } from "../../lib/utils";
import { ErrorModal } from "../ui/ErrorModal";
import { useProcessingStore } from "../../store/processingStore";
import { decodeBarcodesFromPdf } from "../../lib/barcodeDecoder";
import { useAuditStore } from "../../store/auditStore";
import { BookmarkModal, type Bookmark } from "../ui/BookmarkModal";
import { DocumentHealthPanel } from './DocumentHealthPanel';
import { analyzeDocumentHealth } from '../../lib/healthChecks';
import { ParagraphEditModal } from './ParagraphEditModal';
import { TableExtractionModal } from './TableExtractionModal';
import { ToolsModal } from './ToolsModal';

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
  onUnlock?: (doc: PDFDocument) => void;
  onSanitize?: (doc: PDFDocument) => void;
  onFlatten?: (doc: PDFDocument) => void;
  onShare?: (doc: PDFDocument) => void;
  onHighlight?: (doc: PDFDocument) => void;
  onSign?: (doc: PDFDocument) => void;
  onAudit?: (doc: PDFDocument) => void;
  onVerifySignature?: (doc: PDFDocument) => void;
  onReadAloud?: (doc: PDFDocument) => void;
  extractText: (bytes: Uint8Array) => Promise<string>;
  extractEntities: (text: string, customPatterns?: string[]) => Promise<string[]>;
  extractTables?: (docFile: File, format?: 'excel' | 'csv' | 'markdown' | 'latex') => Promise<{ data: Uint8Array, extension: string }>;
  extractMarkdown?: (bytes: Uint8Array) => Promise<string>;
  extractHtml?: (bytes: Uint8Array) => Promise<string>;
  extractImages?: (bytes: Uint8Array) => Promise<Uint8Array>;
  extractLinks?: (bytes: Uint8Array) => Promise<string>;
  extractAnnotations?: (bytes: Uint8Array) => Promise<string>;
  extractMetadata?: (bytes: Uint8Array) => Promise<string>;
  editParagraph?: (bytes: Uint8Array, searchText: string, replacementText: string) => Promise<Uint8Array>;
  onViewMetadata?: (doc: PDFDocument, metadata: { standard: Record<string, string>; xmp: string }) => void;
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
  onInteractiveRedact?: (doc: PDFDocument) => void;
  onAutoRedactLayout?: (doc: PDFDocument) => void;
  onInteractiveEdit?: (doc: PDFDocument) => void;
  onInteractiveTable?: (doc: PDFDocument) => void;
  onSmartTableReflow?: (doc: PDFDocument) => void;
  onInteractiveCopy?: (doc: PDFDocument) => void;
  onInteractiveKnowledgeGraph?: (doc: PDFDocument) => void;
  onInteractiveFontSizeNormalizer?: (doc: PDFDocument) => void;
  onInteractiveDataDictionary?: (doc: PDFDocument) => void;
  onInteractiveAutoLinker?: (doc: PDFDocument) => void;
  onSmartForm?: (doc: PDFDocument) => void;
  onSmartCrop?: (doc: PDFDocument) => void;
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
  onUnlock,
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
  extractAnnotations,
  extractMetadata,
  editParagraph,
  onViewMetadata,
  extractBookmarks,
  editBookmarks,
  redactPdf,
  updateDocumentFile,
  convertPdfToDocx,
  exportPdfToDark,
  onInteractiveRedact,
  onAutoRedactLayout,
  onInteractiveEdit,
  onInteractiveTable,
  onSmartTableReflow,
  onInteractiveCopy,
  onInteractiveKnowledgeGraph,
  onInteractiveFontSizeNormalizer,
  onInteractiveDataDictionary,
  onInteractiveAutoLinker,
  onSmartForm,
  onSmartCrop,
}: DocumentCardProps) {
  const isMobile = useMobile();
  const { activeTool, setActiveTool } = useUIStore();
  const [detectedEntities, setDetectedEntities] = React.useState<string[] | null>(null);
  const [selectedEntities, setSelectedEntities] = React.useState<Set<string>>(new Set());
  const [customPatternInput, setCustomPatternInput] = React.useState("");
  const [customPatterns, setCustomPatterns] = React.useState<string[]>([]);
  const [detectedCodes, setDetectedCodes] = React.useState<{text: string; page: number}[] | null>(null);
  const [errorState, setErrorState] = React.useState<{
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

  const canUndo = (doc.operationIndex ?? -1) > 0;
  const canRedo = (doc.operationIndex ?? -1) < ((doc.operations?.length ?? 0) - 1);

  const activeDocumentId = useFileStore((state) => state.activeDocumentId);
  const isActive = activeDocumentId === doc.id;
  const addLog = useAuditStore((state) => state.addLog);
  const isDarkMode = useUIStore((state) => state.isDarkMode);

  const [healthData, setHealthData] = React.useState<{
    needsOcr: boolean;
    hasSelectableText: boolean;
    hasForms: boolean;
  } | null>(null);
  const [analyzedFileKey, setAnalyzedFileKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isActive) return;

    // Create stable key from file metadata
    const fileKey = `${doc.name}-${doc.size}-${doc.lastModified}`;

    // Only analyze if this is a genuinely new file
    if (fileKey === analyzedFileKey) return;

    let isMounted = true;
    analyzeDocumentHealth(doc.file).then(data => {
      if (isMounted) {
        setHealthData(data);
        setAnalyzedFileKey(fileKey);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isActive, doc.name, doc.size, doc.lastModified, analyzedFileKey, doc.file]);

  const handleScan = React.useCallback(async (currentCustomPatterns: string[] = []) => {
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
      const entities = await extractEntities(text, currentCustomPatterns);
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

  React.useEffect(() => {
    if (isActive && activeTool) {
      setTimeout(() => {
        switch (activeTool) {
          case 'redact':
            if (onScanPii) onScanPii(doc);
            else handleScan();
            break;
          case 'extract-tables':
            setIsTableExtractionModalOpen(true);
            setActiveTool(null);
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

  React.useEffect(() => {
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

  const [isToolsModalOpen, setIsToolsModalOpen] = React.useState(false);

  const [bookmarkModalState, setBookmarkModalState] = React.useState<{
    isOpen: boolean;
    bookmarks: Bookmark[];
  }>({ isOpen: false, bookmarks: [] });
  const [isParagraphEditModalOpen, setIsParagraphEditModalOpen] = React.useState(false);
  const [isTableExtractionModalOpen, setIsTableExtractionModalOpen] = React.useState(false);

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


  const handleEditParagraph = async (docToEdit: PDFDocument, searchText: string, replacementText: string) => {
    if (!editParagraph) return;
    let isCancelled = false;
    startProcessing("Editing paragraph...", true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {
      const buffer = await docToEdit.file.arrayBuffer();
      const newBytes = await editParagraph(new Uint8Array(buffer), searchText, replacementText);
      if (isCancelled) return;

      const standardBuffer = new Uint8Array(newBytes.length);
      standardBuffer.set(newBytes);
      const newFile = new File([standardBuffer], docToEdit.file.name, { type: 'application/pdf' });
      await updateDocumentFile(docToEdit.id, newFile);
      addLog("Edit Paragraph", "Replaced paragraph text.", docToEdit.name);
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (isCancelled) return;
      console.error(err);
      setErrorState({ isOpen: true, title: "Edit Error", message: err.message || "Failed to edit paragraph." });
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

  const handleExtractTables = async (docToExtract: PDFDocument, format: 'excel' | 'csv' | 'markdown' | 'latex') => {
    if (!extractTables) return;
    let isCancelled = false;
    startProcessing("Extracting tables...", true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {
      const result = await extractTables(docToExtract.file, format);
      if (isCancelled) return;

      const standardBuffer = new Uint8Array(result.data.length);
      standardBuffer.set(result.data);

      const mimeType = result.extension.includes('.md') ? "text/markdown" : result.extension.includes('.csv') ? "text/csv" : result.extension.includes('.tex') ? "text/plain" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      const blob = new Blob([standardBuffer], {
        type: mimeType,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.name.replace(/\.pdf$/i, `-tables${result.extension}`);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addLog("Extract Tables", `Extracted tables to ${format.toUpperCase()} format.`, doc.name);
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

  const handleExtractAnnotations = async () => {
    if (!extractAnnotations) return;
    let isCancelled = false;
    startProcessing("Extracting annotations...", true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {
      const buffer = await doc.file.arrayBuffer();
      const pdfBytes = new Uint8Array(buffer);
      const jsonAnnotations = await extractAnnotations(pdfBytes);
      if (isCancelled) return;

      const annotations = JSON.parse(jsonAnnotations) as { page: number; type: string; content: string }[];

      if (annotations.length === 0) {
        throw new Error("No annotations found in the document.");
      }

      // Convert to CSV
      const csvRows = ["Page,Type,Content"];
      for (const annot of annotations) {
        const escapedContent = annot.content.replace(/"/g, '""');
        csvRows.push(`${annot.page},"${annot.type}","${escapedContent}"`);
      }
      const csvString = csvRows.join("\n");

      const blob = new Blob([csvString], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = getSmartOutputName(doc.name, "annotations").replace(/\.pdf$/i, ".csv");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addLog("Extract Annotations", `Extracted ${annotations.length} annotations to CSV.`, doc.name);
      useUIStore.getState().showFeedbackPrompt("Extract Annotations");
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (isCancelled) return;
      console.error(err);
      setErrorState({
        isOpen: true,
        title: "Extraction Error",
        message: err.message || "An error occurred while extracting annotations.",
      });
    } finally {
      if (!isCancelled) stopProcessing();
    }
  };


  const handleViewMetadataLocal = async () => {
    if (!extractMetadata || !onViewMetadata) return;
    let isCancelled = false;
    startProcessing("Extracting metadata...", true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {
      const buffer = await doc.file.arrayBuffer();
      const pdfBytes = new Uint8Array(buffer);
      const jsonMetadata = await extractMetadata(pdfBytes);
      if (isCancelled) return;

      const metadata = JSON.parse(jsonMetadata);
      onViewMetadata(doc, metadata);
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (isCancelled) return;
      console.error(err);
      setErrorState({
        isOpen: true,
        title: "Metadata Error",
        message: err.message || "An error occurred while extracting metadata.",
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

  const toolsItems = [
    { category: "Page Modification", label: "Extract / Split (~Instant)", onClick: () => onSplit(doc) },
    { category: "Page Modification", label: "Rotate 90° (~Instant)", onClick: () => onRotate?.(doc) },
    { category: "Page Modification", label: "Delete Pages (~1s)", onClick: () => onDeletePages?.(doc) },
    { category: "Page Modification", label: "Reorder Pages (~1s)", onClick: () => onReorderPages?.(doc) },
    { category: "Page Modification", label: "Resize to A4/Letter/Custom (~2s)", onClick: () => onResizePages?.(doc) },

    { category: "Content & Marks", label: "Add Watermark (~1s)", onClick: () => onWatermark?.(doc) },
    { category: "Content & Marks", label: "Smart Highlight Text (~Instant)", onClick: () => onHighlight?.(doc) },
    { category: "Content & Marks", label: "Sign Document (~2s)", onClick: () => onSign?.(doc) },
    { category: "Content & Marks", label: "Edit Text (Beta) (~3s)", onClick: () => setIsParagraphEditModalOpen(true) },
    { category: "Content & Marks", label: "Add Page Numbers (~2s)", onClick: () => onAddPageNumbers?.(doc) },
    { category: "Content & Marks", label: "Bates Numbering (~2s)", onClick: () => onBatesNumbering?.(doc) },
    { category: "Content & Marks", label: "Flatten Forms (~1s)", onClick: () => onFlatten?.(doc) },

    { category: "Extract & Export", ...(!isMobile ? { label: "Extract Tables (~10s)", onClick: () => setIsTableExtractionModalOpen(true) } : {}) },
    { category: "Extract & Export", label: "Extract Notes (MD) (~5s)", onClick: handleExtractMarkdown },
    { category: "Extract & Export", label: "Extract Web (HTML) (~5s)", onClick: handleExtractHtml },
    { category: "Extract & Export", ...(!isMobile ? { label: "Export DOCX (~10s)", onClick: handleExportDocx } : {}) },
    { category: "Extract & Export", label: "Export True Dark (~10s)", onClick: handleExportDark },
    { category: "Extract & Export", ...(!isMobile ? { label: "Extract Images (~10s)", onClick: handleExtractImages } : {}) },
    { category: "Extract & Export", label: "Extract Links (CSV) (~2s)", onClick: handleExtractLinks },
    { category: "Extract & Export", label: "Extract Annotations (CSV) (~2s)", onClick: handleExtractAnnotations },

    { category: "Interactive Tools", label: "Hover to Edit (~Instant)", onClick: () => onInteractiveEdit?.(doc) },
    { category: "Interactive Tools", label: "Magic Box Table (~Instant)", onClick: () => onInteractiveTable?.(doc) },
    { category: "Interactive Tools", label: "Smart Table Re-flow (~Instant)", onClick: () => onSmartTableReflow?.(doc) },
    { category: "Interactive Tools", label: "Magic Copy (~Instant)", onClick: () => onInteractiveCopy?.(doc) },
    { category: "Interactive Tools", label: "Knowledge Graph (~Instant)", onClick: () => onInteractiveKnowledgeGraph?.(doc) },
    { category: "Interactive Tools", label: "Font-Size Normalizer (~Instant)", onClick: () => onInteractiveFontSizeNormalizer?.(doc) },
    { category: "Interactive Tools", label: "Data Dictionary Extraction (~Instant)", onClick: () => onInteractiveDataDictionary?.(doc) },
    { category: "Interactive Tools", label: "Auto-Linker (~Instant)", onClick: () => onInteractiveAutoLinker?.(doc) },
    { category: "Interactive Tools", label: "Smart Form Generation (~Instant)", onClick: () => onSmartForm?.(doc) },
    { category: "Interactive Tools", label: "Smart Crop Warning (~Instant)", onClick: () => onSmartCrop?.(doc) },

    { category: "Security & Audit", label: "Protect (Password) (~2s)", onClick: () => onEncrypt?.(doc) },
    ...(doc.isEncrypted ? [{ category: "Security & Audit", label: "Unlock (Remove Password)", onClick: () => onUnlock?.(doc) }] : []),
    { category: "Security & Audit", label: "Sanitize & Send (~Instant)", onClick: () => onSanitize?.(doc) },
    { category: "Security & Audit", label: "Point & Click Redact (~Instant)", onClick: () => onInteractiveRedact?.(doc) },
    { category: "Security & Audit", label: "Auto-Redact Headers/Footers (~Instant)", onClick: () => onAutoRedactLayout?.(doc) },
    { category: "Security & Audit", ...(!isMobile ? { label: "Audit Redactions (~5s)", onClick: () => onAudit?.(doc) } : {}) },
    { category: "Security & Audit", label: "Verify Signatures (~2s)", onClick: () => onVerifySignature?.(doc) },

    { category: "Other", label: "Optimize (Compress) (~5s)", onClick: () => onOptimize?.(doc) },
    { category: "Other", label: "Edit Bookmarks/Outline (~2s)", onClick: handleEditBookmarks },
    { category: "Other", label: "Edit Metadata (~2s)", onClick: handleViewMetadataLocal },
    { category: "Other", label: "Read Aloud (TTS) (~15s/pg)", onClick: () => onReadAloud?.(doc) },
    { category: "Other", ...(!isMobile ? { label: "Scan PII (~5s)", onClick: handleScan } : {}) },
    { category: "Other", ...(!isMobile ? { label: "Scan Codes (~5s)", onClick: handleScanCodes } : {}) },
    { category: "Other", ...(!isMobile ? { label: "OCR (~10s)", onClick: () => {
        if (useUIStore.getState().complexityMode === 'simple') {
          useUIStore.getState().setComplexityMode('professional');
        }
        onOcr?.(doc);
      }
    } : {}) },

    {
      category: "Danger",
      label: "Remove File",
      variant: "danger",
      onClick: () => onRemove(doc.id),
    },
  ].filter(item => item.label) as { category: string; label: string; onClick?: () => void; variant?: string }[];

  return (
    <div className={`rounded-xl border shadow-sm flex flex-col hover:shadow-md transition-shadow relative ${isDarkMode ? "bg-gray-800 border-gray-700 text-gray-100" : "bg-white border-gray-200 text-gray-900"}`}>
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
        <div className="mb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">
          <PDFThumbnail file={doc.file} />
        </div>

        <div className="mb-4">
          <DocumentHealthPanel
            doc={doc}
            healthData={healthData}
            onOcr={() => onOcr?.(doc)}
            onUnlock={() => onUnlock?.(doc)}
            onSanitize={() => onSanitize?.(doc)}
            onOptimize={() => onOptimize?.(doc)}
          />
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
              onClick={() => onSplit(doc)}
              disabled={isProcessing}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-1 ml-auto"
            >
              Split
            </button>
            <button
              onClick={handleDownload}
              disabled={isProcessing}
              className="text-green-600 hover:text-green-800 text-sm font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 rounded px-1"
            >
              Download
            </button>
            <button
              onClick={() => onShare?.(doc)}
              disabled={isProcessing}
              className="text-indigo-600 hover:text-indigo-800 text-sm font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded px-1"
              title="Share (URL, <64KB only)"
            >
              Share
            </button>
            <button
              onClick={() => onRemove(doc.id)}
              disabled={isProcessing}
              className="text-red-500 hover:text-red-700 text-sm font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded px-1"
            >
              Remove
            </button>
          </div>

          {doc.operations && doc.operations.length > 0 && (
            <div className="text-xs text-gray-500 mt-2 mb-2">
              {doc.operations.length} operation{doc.operations.length !== 1 ? 's' : ''}
              {doc.operationIndex !== undefined && ` (at #${doc.operationIndex + 1})`}
            </div>
          )}

          <div className="mt-4">
            <button
              onClick={() => setIsToolsModalOpen(true)}
              className="w-full bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50 py-2 px-4 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              Open Tools Menu
            </button>
          </div>

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

          <div className="mb-4">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Custom regex or keyword"
                className="flex-1 text-sm border border-gray-300 rounded px-2 py-1"
                value={customPatternInput}
                onChange={(e) => setCustomPatternInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customPatternInput.trim() !== "") {
                    const newPatterns = [...customPatterns, customPatternInput.trim()];
                    setCustomPatterns(newPatterns);
                    setCustomPatternInput("");
                    handleScan(newPatterns);
                  }
                }}
              />
              <button
                onClick={() => {
                  if (customPatternInput.trim() !== "") {
                    const newPatterns = [...customPatterns, customPatternInput.trim()];
                    setCustomPatterns(newPatterns);
                    setCustomPatternInput("");
                    handleScan(newPatterns);
                  }
                }}
                className="bg-blue-600 text-white px-2 py-1 rounded text-sm hover:bg-blue-700"
              >
                Add
              </button>
            </div>
            {customPatterns.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {customPatterns.map((pattern, i) => (
                  <span key={i} className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded flex items-center gap-1">
                    {pattern}
                    <button
                      onClick={() => {
                        const newPatterns = customPatterns.filter((_, idx) => idx !== i);
                        setCustomPatterns(newPatterns);
                        handleScan(newPatterns);
                      }}
                      className="text-gray-400 hover:text-red-500"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {detectedEntities.length === 0 ? (
            <p className="text-sm text-gray-500">
              No sensitive information found.
            </p>
          ) : (
            <div className="flex flex-col gap-2 max-h-48 overflow-y-auto mb-4">
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
              <div key={i} className="flex flex-col gap-1 p-2 bg-gray-50 rounded text-sm border border-gray-100 relative">
                <span className="absolute top-1 right-2 text-[10px] text-gray-400 font-medium">Page {code.page}</span>
                <span className="break-all font-mono text-xs pr-10">{code.text}</span>
                {(code.text.startsWith("http://") || code.text.startsWith("https://")) && (
                  <a
                    href={code.text}
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

      <ParagraphEditModal
        isOpen={isParagraphEditModalOpen}
        doc={doc}
        onClose={() => setIsParagraphEditModalOpen(false)}
        onEdit={handleEditParagraph}
      />

      <TableExtractionModal
        isOpen={isTableExtractionModalOpen}
        doc={doc}
        onClose={() => setIsTableExtractionModalOpen(false)}
        onExtract={handleExtractTables}
      />

      <ToolsModal
        isOpen={isToolsModalOpen}
        onClose={() => setIsToolsModalOpen(false)}
        tools={toolsItems}
        documentName={doc.name}
      />
    </div>
  );
}
