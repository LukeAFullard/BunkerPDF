import { useAuditStore } from "./store/auditStore";
import { PrivacyAuditLogModal } from "./components/ui/PrivacyAuditLogModal";
import { saveSession, clearSession } from "./lib/sessionSync";
import { useState, useEffect, useRef } from "react";
import { Dropzone } from "./components/ui/Dropzone";
import { useFileStore, type PDFDocument } from "./store/fileStore";
import { PDFDocument as PDFLibDocument } from "pdf-lib";
import { useEngineStore } from "./store/engineStore";
import { useProcessingStore } from "./store/processingStore";
import { useSearchStore, type DocumentSegment } from "./store/searchStore";
import { useUIStore } from "./store/uiStore";
import { SearchModal } from "./components/ui/SearchModal";
import { generateEmbedding } from "./lib/searchEngine";
import { ChevronDown, Plus } from "lucide-react";
import {
  mergePdfs,
  splitPdf,
  watermarkPdf, addPageNumbers, addBatesNumbers, resizePages,
  crossDocumentReorderPages,
} from "./lib/engineA";
import { EngineStatusPill } from "./components/ui/EngineStatusPill";
import { CrossDocumentReorder } from "./components/pdf/reorder/CrossDocumentReorder";
import { InteractiveSmartHighlightModal, type HighlightBox } from "./components/pdf/InteractiveSmartHighlightModal";
import { highlightBoxesLiteparse } from "./lib/liteparseEngine";
import { InteractiveRedactModal, type RedactBox } from "./components/pdf/InteractiveRedactModal";
import { InteractiveTableModal } from "./components/pdf/InteractiveTableModal";
import { InteractiveCopyModal } from "./components/pdf/InteractiveCopyModal";
import { InteractiveAutoLinkerModal } from "./components/pdf/InteractiveAutoLinkerModal";
import { autoLinkBoxesLiteparse } from "./lib/liteparseEngine";
import { SmartFormGenerationModal } from "./components/pdf/SmartFormGenerationModal";
import { SmartCropModal } from "./components/pdf/SmartCropModal";
import { InteractiveDataDictionaryModal } from "./components/pdf/InteractiveDataDictionaryModal";


import { VisualWatermarkModal } from "./components/pdf/VisualWatermarkModal";
import { getSmartOutputName } from "./lib/utils";
import { ocrPdf } from "./lib/ocrEngine";
import { ReadAloudModal } from "./components/ui/ReadAloudModal";
import { MetadataModal } from "./components/ui/MetadataModal";
import { DocumentCard } from "./components/pdf/DocumentCard";
import { FileTabs } from "./components/ui/FileTabs";
import { DiffModal } from "./components/pdf/diff/DiffModal";
import { SideBySideViewerModal } from "./components/pdf/SideBySideViewerModal";
import { ErrorModal } from "./components/ui/ErrorModal";
import { InputModal } from "./components/ui/InputModal";
import { PageSelectorModal } from "./components/ui/PageSelectorModal";
import { ProcessingModal } from "./components/ui/ProcessingModal";
import { FeedbackPrompt } from "./components/ui/FeedbackPrompt";
import { PWAInstallPrompt } from "./components/ui/PWAInstallPrompt";
import type { NERWorkerMessage, NERWorkerResponse } from "./workers/nerWorker";
import type {
  PyodideWorkerMessage,
  PyodideWorkerResponse,
} from "./workers/pyodideWorker";
import { ImageReorderRail, type ImageItem } from "./components/ui/ImageReorderRail";
import { convertImagesToPdf } from "./lib/engineA";
import { SettingsDropdown } from "./components/ui/SettingsDropdown";
import { extractParagraphsLiteparse, extractTextLiteparse, extractAllPagesTextLiteparse, extractMarkdownLiteparse, extractHtmlLiteparse, editParagraphLiteparse, extractTablesLiteparse, redactDocumentLiteparse, redactBoxesLiteparse, diffMergedHighlightPdfLiteparse, diffHighlightPdfLiteparse, autoRedactLayoutLiteparse } from "./lib/liteparseEngine";

function App() {
  const documents = useFileStore((state) => state.documents);
  const activeDocumentId = useFileStore((state) => state.activeDocumentId);

  const handleWorkspaceFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);

    const docxFiles = files.filter(f => f.name.toLowerCase().endsWith('.docx') || f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    let pdfFiles = files.filter(f => f.type === 'application/pdf');

    if (docxFiles.length > 0) {
      handleDocxDropped(docxFiles);
    }

    if (imageFiles.length > 0) {
      const newItems = imageFiles.map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      setPendingImages((prev) => [...prev, ...newItems]);
    }

    if (pdfFiles.length === 0) {
        if (workspaceFileInputRef.current) workspaceFileInputRef.current.value = '';
        return;
    }

    const MAX_FILE_SIZE = 80 * 1024 * 1024;
    const oversizedFiles = pdfFiles.filter(f => f.size > MAX_FILE_SIZE);

    if (oversizedFiles.length > 0) {
      setErrorState({
        isOpen: true,
        title: 'File Too Large',
        message: 'Some files are too large (max 80MB) and were skipped.'
      });
      pdfFiles = pdfFiles.filter(f => f.size <= MAX_FILE_SIZE);
    }

    if (pdfFiles.length === 0) {
        if (workspaceFileInputRef.current) workspaceFileInputRef.current.value = '';
        return;
    }

    const availableSlots = 50 - documents.length;
    if (pdfFiles.length > availableSlots) {
       setErrorState({
         isOpen: true,
         title: 'File Limit Reached',
         message: `Maximum 50 files allowed. Only the next ${availableSlots} will be loaded.`
       });
       pdfFiles = pdfFiles.slice(0, Math.max(0, availableSlots));
    }

    if (pdfFiles.length === 0) {
        if (workspaceFileInputRef.current) workspaceFileInputRef.current.value = '';
        return;
    }

    const { getPdfInfo } = await import('./lib/pdfProcessing');
    const parsedDocs: PDFDocument[] = [];

    for (const file of pdfFiles) {
      let pageCount;
      let isEncrypted = false;
      let isCorrupt = false;

      try {
        const info = await getPdfInfo(file);
        pageCount = info.pageCount;
        isEncrypted = info.isEncrypted;
      } catch (err: any) {
        if (err.message === 'CORRUPT_PDF') isCorrupt = true;
      }

      if (isCorrupt) {
        setErrorState({
          isOpen: true,
          title: 'Corrupt PDF',
          message: `We couldn't read "${file.name}". It may be damaged or in an unsupported format.`
        });
        continue;
      }

      parsedDocs.push({
        id: crypto.randomUUID(),
        file,
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
        pageCount,
        isEncrypted,
        isCorrupt
      });
    }

    if (parsedDocs.length > 0) {
      addDocuments(parsedDocs);
    }

    if (workspaceFileInputRef.current) {
      workspaceFileInputRef.current.value = '';
    }
  };

  const addLog = useAuditStore(state => state.addLog);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);
  const [diffInitialDoc1Id, setDiffInitialDoc1Id] = useState<string | undefined>();
  const [diffInitialDoc2Id, setDiffInitialDoc2Id] = useState<string | undefined>();
  const [isSideBySideModalOpen, setIsSideBySideModalOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  const { isIndexing, setIndexingState, addSegments, segments, failedIndexDocs, addFailedIndexDoc } = useSearchStore();

  const handleIndexDocuments = async (background = false) => {
    if (isIndexing || documents.length === 0) return;

    // Only index documents that haven't been indexed yet
    const indexedDocIds = new Set(segments.map(s => s.docId));
    const unindexedDocs = documents.filter(doc => !indexedDocIds.has(doc.id) && !failedIndexDocs.includes(doc.id));

    if (unindexedDocs.length === 0) {
      if (!background) setIsSearchModalOpen(true);
      return;
    }

    setIndexingState(true, 0);

    const BATCH_SIZE = 5; // Process 5 pages then yield to UI
    const newSegments: DocumentSegment[] = [];
    let processedPages = 0;
    const totalPages = unindexedDocs.reduce((sum, doc) => sum + (doc.pageCount || 1), 0);

    try {
      for (const doc of unindexedDocs) {
        const fileBuffer = await doc.file.arrayBuffer();
        const bytes = new Uint8Array(fileBuffer);
        const pageCount = doc.pageCount || 1;

        // FIXED: Extract all pages in one Pyodide call
        const allPageTexts = await extractAllPagesText(bytes, pageCount);

        // Process in batches with UI yields
        for (let i = 0; i < pageCount; i += BATCH_SIZE) {
          const batchEnd = Math.min(i + BATCH_SIZE, pageCount);

          // Process batch
          const batchPromises = [];
          for (let j = i; j < batchEnd; j++) {
            const text = allPageTexts[j];
            if (text && text.trim().length > 10) {
              batchPromises.push(
                generateEmbedding(text.trim()).then(embedding => ({
                  id: `${doc.id}-${j}`,
                  docId: doc.id,
                  docName: doc.name,
                  pageNumber: j + 1,
                  text: text.trim(),
                  embedding,
                }))
              );
            }
          }

          const batchResults = await Promise.all(batchPromises);
          newSegments.push(...batchResults);

          processedPages += (batchEnd - i);
          setIndexingState(true, Math.round((processedPages / totalPages) * 100));

          // CRITICAL: Yield to UI thread
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      addSegments(newSegments);
    } catch (e) {
      console.error("Error indexing documents", e);
      for (const doc of unindexedDocs) {
        addFailedIndexDoc(doc.id);
      }
    } finally {
      setIndexingState(false, 100);
      if (!background) setIsSearchModalOpen(true);
    }
  };

  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    const unsubHydrate = useSearchStore.persist.onHydrate(() => setHasHydrated(false));
    const unsubFinishHydration = useSearchStore.persist.onFinishHydration(() => setHasHydrated(true));

    setHasHydrated(useSearchStore.persist.hasHydrated());

    return () => {
      unsubHydrate();
      unsubFinishHydration();
    };
  }, []);


  useEffect(() => {
    if (documents.length > 0 && !isIndexing && isInitialized.current && hasHydrated) {
      const indexedDocIds = new Set(segments.map(s => s.docId));
      const unindexedDocs = documents.filter(doc => !indexedDocIds.has(doc.id) && !failedIndexDocs.includes(doc.id));
      if (unindexedDocs.length > 0) {
        handleIndexDocuments(true);
      }
    }
  }, [documents, segments, isIndexing, hasHydrated, failedIndexDocs]);
  const isInitialized = useRef(false);
  const { setAiStatus, setPyodideStatus } = useEngineStore();
  const nerWorkerRef = useRef<Worker | null>(null);
  const pyodideWorkerRef = useRef<Worker | null>(null);
  const removeDocument = useFileStore((state) => state.removeDocument);
  const updateDocumentFile = useFileStore((state) => state.updateDocumentFile);
  const addDocuments = useFileStore((state) => state.addDocuments);
  const {
    startProcessing,
    stopProcessing,
    isActive: isGlobalProcessing,
  } = useProcessingStore();


  const clearAll = useFileStore((state) => state.clearAll);
  const [errorState, setErrorState] = useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
  }>({ isOpen: false, title: "", message: "" });

  const [readAloudState, setReadAloudState] = useState<{
    isOpen: boolean;
    text: string;
    title: string;
  }>({ isOpen: false, text: "", title: "Read Aloud" });

  const [splitModalState, setSplitModalState] = useState<{
    isOpen: boolean;
    doc: PDFDocument | null;
  }>({ isOpen: false, doc: null });

  const [interactiveHighlightState, setInteractiveHighlightState] = useState<{
    isOpen: boolean;
    docId: string | null;
  }>({ isOpen: false, docId: null });

  const [interactiveAutoLinkerState, setInteractiveAutoLinkerState] = useState<{
    isOpen: boolean;
    docId: string | null;
  }>({ isOpen: false, docId: null });
  const [smartCropState, setSmartCropState] = useState<{
    isOpen: boolean;
    docId: string | null;
  }>({ isOpen: false, docId: null });


  const [interactiveDataDictionaryState, setInteractiveDataDictionaryState] = useState<{
    isOpen: boolean;
    docId: string | null;
  }>({ isOpen: false, docId: null });
  const [smartFormState, setSmartFormState] = useState<{
    isOpen: boolean;
    docId: string | null;
  }>({ isOpen: false, docId: null });

  const [interactiveRedactState, setInteractiveRedactState] = useState<{
    isOpen: boolean;
    docId: string | null;
  }>({ isOpen: false, docId: null });


  const [interactiveTableState, setInteractiveTableState] = useState<{
    isOpen: boolean;
    docId: string | null;
  }>({ isOpen: false, docId: null });

  const [visualWatermarkState, setVisualWatermarkState] = useState<{
    isOpen: boolean;
    docId: string | null;
  }>({ isOpen: false, docId: null });


  const [pageSelectorState, setPageSelectorState] = useState<{
    isOpen: boolean;
    title: string;
    docId: string | null;
    pageCount: number;
    singleSelection?: boolean;
    onConfirm: (selectedPages: number[]) => void;
  }>({
    isOpen: false,
    title: "",
    docId: null,
    pageCount: 0,
    onConfirm: () => {},
  });


  const [thumbnailCache, setThumbnailCache] = useState<Record<string, string>>({});

  const [pendingImages, setPendingImages] = useState<ImageItem[]>([]);
  const [imageFitMode, setImageFitMode] = useState<'fit' | 'original' | 'a4'>('a4');
  const [inputState, setInputState] = useState<{
    isOpen: boolean;
    title: string;
    message: string | React.ReactNode;
    placeholder?: string;
    defaultValue?: string;
    type?: 'text' | 'select' | 'password' | 'confirm';
    options?: { label: string; value: string }[];
    onConfirm: (val: string) => void;
    onCancel?: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const [isCrossReorderOpen, setIsCrossReorderOpen] = useState(false);
  const [isBatchMenuOpen, setIsBatchMenuOpen] = useState(false);
  const [metadataModalState, setMetadataModalState] = useState<{ isOpen: boolean, metadata: { standard: Record<string, string>, xmp: string } | null, doc: PDFDocument | null }>({ isOpen: false, metadata: null, doc: null });
  const batchMenuRef = useRef<HTMLDivElement>(null);
  const workspaceFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (batchMenuRef.current && !batchMenuRef.current.contains(event.target as Node)) {
        setIsBatchMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Promise resolvers mapping
  const nerResolvers = useRef<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Map<string, { resolve: (val: any) => void; reject: (err: any) => void }>
  >(new Map());
  const pyodideResolvers = useRef<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Map<string, { resolve: (val: any) => void; reject: (err: any) => void }>
  >(new Map());


  const setActiveTool = useUIStore((state) => state.setActiveTool);

  // Check for share payload on load
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#tool=')) {
      const tool = hash.replace('#tool=', '');
      window.location.hash = ''; // Clear it out so it doesn't stay in URL
      setActiveTool(tool);
    }

    // Session Sync
    const restoreSession = async () => {
      const { loadSession } = await import('./lib/sessionSync');
      const sessionData = await loadSession();
      if (sessionData && sessionData.documents.length > 0) {
        useFileStore.setState({
          documents: sessionData.documents,
          activeDocumentId: sessionData.activeId || sessionData.documents[0].id
        });
      }
      isInitialized.current = true;
    };
    restoreSession();

  }, []);

  useEffect(() => {
    // Save session whenever documents change
    if (!isInitialized.current) return;
    if (documents.length > 0) {
      saveSession(documents, activeDocumentId);
    } else {
      clearSession();
    }
  }, [documents, activeDocumentId]);

  useEffect(() => {

    // Initialize the NER worker
    setAiStatus("loading");
    nerWorkerRef.current = new Worker(
      new URL("./workers/nerWorker.ts", import.meta.url),
      {
        type: "module",
      },
    );

    nerWorkerRef.current.onmessage = (e: MessageEvent<NERWorkerResponse>) => {
      const { type, jobId, result, error } = e.data;
      if (type === "READY") {
        console.log("NER Worker is ready.");
        setAiStatus("ready");
      } else if (type === "RESULT" && jobId) {
        const resolver = nerResolvers.current.get(jobId);
        if (resolver) {
          resolver.resolve(result);
          nerResolvers.current.delete(jobId);
        }
      } else if (type === "ERROR") {
        if (jobId) {
          const resolver = nerResolvers.current.get(jobId);
          if (resolver) {
            resolver.reject(new Error(error));
            nerResolvers.current.delete(jobId);
          }
        } else {
          console.error("NER Worker Error:", error);
          setAiStatus("error", error);
        }
      }
    };

    nerWorkerRef.current.postMessage({
      type: "INIT",
    } satisfies NERWorkerMessage);

    // Initialize the Pyodide worker
    setPyodideStatus("loading");
    pyodideWorkerRef.current = new Worker(
      new URL("./workers/pyodideWorker.ts", import.meta.url),
      {
        type: "module",
      },
    );

    pyodideWorkerRef.current.onmessage = (
      e: MessageEvent<PyodideWorkerResponse>,
    ) => {
      const { type, jobId, result, error, stage, progress } = e.data;
      if (type === "PROGRESS") {
        console.log("Pyodide Worker Progress:", stage);
        if (stage) setPyodideStatus("loading", null, stage);
        if (progress !== undefined) useProcessingStore.getState().updateProgress(progress);
      } else if (type === "READY") {
        console.log("Pyodide Worker is ready.");
        setPyodideStatus("ready");
      } else if (type === "RESULT" && jobId) {
        const resolver = pyodideResolvers.current.get(jobId);
        if (resolver) {
          resolver.resolve(result);
          pyodideResolvers.current.delete(jobId);
        }
      } else if (type === "ERROR") {
        if (jobId) {
          const resolver = pyodideResolvers.current.get(jobId);
          if (resolver) {
            resolver.reject(new Error(error));
            pyodideResolvers.current.delete(jobId);
          }
        } else {
          console.error("Pyodide Worker Error:", error);
          setPyodideStatus("error", error);
        }
      }
    };

    pyodideWorkerRef.current.postMessage({
      type: "INIT",
    } satisfies PyodideWorkerMessage);




  return () => {
      nerWorkerRef.current?.terminate();
      pyodideWorkerRef.current?.terminate();
    };
  }, [setAiStatus, setPyodideStatus]);

  const extractTables = async (docFile: File, format?: 'csv' | 'markdown' | 'latex' | 'excel'): Promise<{ data: Uint8Array, extension: string }> => {
    const method = useUIStore.getState().extractionMethod;
    const arrayBuffer = await docFile.arrayBuffer();

    if (method === 'liteparse' && format && format !== 'excel') {
      const text = await extractTablesLiteparse(new Uint8Array(arrayBuffer), format);
      const encoder = new TextEncoder();
      return { data: encoder.encode(text), extension: `.${format === 'markdown' ? 'md' : format === 'latex' ? 'tex' : format}` };
    }

    const CHUNK_SIZE = 20; // Number of pages per chunk to prevent WASM OOM
    const pdfDoc = await PDFLibDocument.load(arrayBuffer);
    const totalPages = pdfDoc.getPageCount();

    const allTables: unknown[] = [];

    for (let startPage = 0; startPage < totalPages; startPage += CHUNK_SIZE) {
      const endPage = Math.min(startPage + CHUNK_SIZE, totalPages);

      useProcessingStore.getState().updateStage(`Extracting tables: pages ${startPage + 1}-${endPage}...`);
      useProcessingStore.getState().updateProgress((startPage / totalPages) * 100);

      const chunkDoc = await PDFLibDocument.create();
      const copiedPages = await chunkDoc.copyPages(pdfDoc, Array.from({ length: endPage - startPage }, (_, i) => startPage + i));
      for (const page of copiedPages) {
        chunkDoc.addPage(page);
      }
      const chunkBytes = await chunkDoc.save();

      const chunkJsonStr = await new Promise<string>((resolve, reject) => {
        const jobId = Math.random().toString(36).substring(7);
        const handler = (e: MessageEvent) => {
          const res = e.data as PyodideWorkerResponse;
          if (res.jobId === jobId) {
            if (res.type === "RESULT") {
              pyodideWorkerRef.current?.removeEventListener("message", handler);
              resolve(res.result as string);
            } else if (res.type === "ERROR") {
              pyodideWorkerRef.current?.removeEventListener("message", handler);
              reject(new Error(res.error));
            } else if (res.type === "PROGRESS" && res.progress !== undefined) {
              useProcessingStore.getState().updateProgress(res.progress);
            }
          }
        };
        pyodideWorkerRef.current?.addEventListener("message", handler);
        pyodideWorkerRef.current?.postMessage({
          type: "EXTRACT_TABLES",
          jobId,
          pdfBytes: chunkBytes,
        });
      });

      if (chunkJsonStr) {
        const tablesInChunk = JSON.parse(chunkJsonStr);
        // adjust page numbers to be absolute instead of relative to chunk
        const adjustedTables = tablesInChunk.map((table: { page: number; [key: string]: unknown }) => ({
          ...table,
          page: table.page + startPage,
        }));
        allTables.push(...adjustedTables);
      }
    }

    if (allTables.length === 0) {
      throw new Error("No tables found in the document.");
    }

    useProcessingStore.getState().updateStage("Converting to Excel format...");

    const excelBytes = await new Promise<Uint8Array>((resolve, reject) => {
      const jobId = Math.random().toString(36).substring(7);
      const handler = (e: MessageEvent) => {
        const res = e.data as PyodideWorkerResponse;
        if (res.jobId === jobId) {
          if (res.type === "RESULT") {
            pyodideWorkerRef.current?.removeEventListener("message", handler);
            resolve(res.result as Uint8Array);
          } else if (res.type === "ERROR") {
            pyodideWorkerRef.current?.removeEventListener("message", handler);
            reject(new Error(res.error));
          }
        }
      };
      pyodideWorkerRef.current?.addEventListener("message", handler);
      pyodideWorkerRef.current?.postMessage({
        type: "CSV_TO_EXCEL",
        jobId,
        csvData: JSON.stringify(allTables),
      });
    });

    useProcessingStore.getState().updateProgress(100);
    return { data: excelBytes, extension: '.xlsx' };
  };


  const extractImages = (bytes: Uint8Array): Promise<Uint8Array> => {
    return new Promise((resolve, reject) => {
      if (!pyodideWorkerRef.current)
        return reject(new Error("Pyodide worker not ready"));
      const jobId = crypto.randomUUID();
      pyodideResolvers.current.set(jobId, { resolve, reject });
      pyodideWorkerRef.current.postMessage({
        type: "EXTRACT_IMAGES",
        jobId,
        pdfBytes: bytes,
      });
    });
  };

  const extractLinks = (bytes: Uint8Array): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!pyodideWorkerRef.current)
        return reject(new Error("Pyodide worker not ready"));
      const jobId = crypto.randomUUID();
      pyodideResolvers.current.set(jobId, { resolve, reject });
      pyodideWorkerRef.current.postMessage({
        type: "EXTRACT_LINKS",
        jobId,
        pdfBytes: bytes,
      });
    });
  };

  const extractMarkdown = (bytes: Uint8Array): Promise<string> => {
    const method = useUIStore.getState().extractionMethod;
    if (method === 'liteparse') {
      return extractMarkdownLiteparse(bytes);
    }
    return new Promise((resolve, reject) => {
      if (!pyodideWorkerRef.current)
        return reject(new Error("Pyodide worker not ready"));
      const jobId = crypto.randomUUID();
      pyodideResolvers.current.set(jobId, { resolve, reject });
      pyodideWorkerRef.current.postMessage({
        type: "EXTRACT_MARKDOWN",
        jobId,
        pdfBytes: bytes,
      });
    });
  };


  const exportPdfToDark = (bytes: Uint8Array): Promise<Uint8Array> => {
    return new Promise((resolve, reject) => {
      const jobId = Math.random().toString(36).substring(7);
      const handler = (e: MessageEvent) => {
        const res = e.data as PyodideWorkerResponse;
        if (res.jobId === jobId) {
          pyodideWorkerRef.current?.removeEventListener("message", handler);
          if (res.type === "RESULT") {
            resolve(res.result);
          } else if (res.type === "ERROR") {
            reject(new Error(res.error));
          }
        }
      };
      pyodideWorkerRef.current?.addEventListener("message", handler);
      pyodideWorkerRef.current?.postMessage({
        type: "EXPORT_DARK",
        jobId,
        pdfBytes: bytes,
      });
    });
  };


  const extractMetadata = (pdfBytes: Uint8Array): Promise<string> => {
    return new Promise((resolve, reject) => {
      const jobId = Date.now().toString();
      const messageHandler = (e: MessageEvent) => {
        if (e.data.jobId === jobId) {
          if (e.data.type === "RESULT") {
            pyodideWorkerRef.current?.removeEventListener("message", messageHandler);
            resolve(e.data.result);
          } else if (e.data.type === "ERROR") {
            pyodideWorkerRef.current?.removeEventListener("message", messageHandler);
            reject(new Error(e.data.error));
          } else if (e.data.type === "PROGRESS") {
            useEngineStore.getState().setPyodideStatus("loading", null, e.data.stage);
            if (e.data.progress !== undefined) useProcessingStore.getState().updateProgress(e.data.progress);
          }
        }
      };
      pyodideWorkerRef.current?.addEventListener("message", messageHandler);
      pyodideWorkerRef.current?.postMessage({
        type: "EXTRACT_METADATA",
        jobId,
        pdfBytes,
      });
    });
  };


  const editMetadata = (pdfBytes: Uint8Array, metadata: { standard: Record<string, string>, xmp: string }): Promise<Uint8Array> => {
    return new Promise((resolve, reject) => {
      const jobId = Date.now().toString();
      const messageHandler = (e: MessageEvent) => {
        if (e.data.jobId === jobId) {
          if (e.data.type === "RESULT") {
            pyodideWorkerRef.current?.removeEventListener("message", messageHandler);
            resolve(e.data.result);
          } else if (e.data.type === "ERROR") {
            pyodideWorkerRef.current?.removeEventListener("message", messageHandler);
            reject(new Error(e.data.error));
          } else if (e.data.type === "PROGRESS") {
            useEngineStore.getState().setPyodideStatus("loading", null, e.data.stage);
            if (e.data.progress !== undefined) useProcessingStore.getState().updateProgress(e.data.progress);
          }
        }
      };
      pyodideWorkerRef.current?.addEventListener("message", messageHandler);
      pyodideWorkerRef.current?.postMessage({
        type: "EDIT_METADATA",
        jobId,
        pdfBytes,
        metadata,
      });
    });
  };

  const extractHtml = (bytes: Uint8Array): Promise<string> => {
    const method = useUIStore.getState().extractionMethod;
    if (method === 'liteparse') {
      return extractHtmlLiteparse(bytes);
    }
    return new Promise((resolve, reject) => {
      if (!pyodideWorkerRef.current)
        return reject(new Error("Pyodide worker not ready"));
      const jobId = crypto.randomUUID();
      pyodideResolvers.current.set(jobId, { resolve, reject });
      pyodideWorkerRef.current.postMessage({
        type: "EXTRACT_HTML",
        jobId,
        pdfBytes: bytes,
      });
    });
  };

  const extractText = (bytes: Uint8Array): Promise<string> => {
    const method = useUIStore.getState().extractionMethod;
    if (method === 'liteparse') {
      return extractTextLiteparse(bytes);
    }
    return new Promise((resolve, reject) => {
      if (!pyodideWorkerRef.current)
        return reject(new Error("Pyodide worker not ready"));
      const jobId = crypto.randomUUID();
      pyodideResolvers.current.set(jobId, { resolve, reject });
      pyodideWorkerRef.current.postMessage({
        type: "EXTRACT_TEXT",
        jobId,
        pdfBytes: bytes,
      } satisfies PyodideWorkerMessage);
    });
  };

  const extractParagraphs = (bytes: Uint8Array): Promise<string[]> => {
    return extractParagraphsLiteparse(bytes);
  };

  const editParagraph = async (bytes: Uint8Array, searchText: string, replacementText: string): Promise<Uint8Array> => {
    return editParagraphLiteparse(bytes, searchText, replacementText);
  };

  const extractAllPagesText = (bytes: Uint8Array, pageCount: number): Promise<string[]> => {
    const method = useUIStore.getState().extractionMethod;
    if (method === 'liteparse') {
      return extractAllPagesTextLiteparse(bytes);
    }
    return new Promise((resolve, reject) => {
      if (!pyodideWorkerRef.current)
        return reject(new Error("Pyodide worker not ready"));
      const jobId = crypto.randomUUID();
      pyodideResolvers.current.set(jobId, { resolve, reject });
      pyodideWorkerRef.current.postMessage({
        type: "EXTRACT_ALL_PAGES_TEXT",
        jobId,
        pdfBytes: bytes,
        pageCount,
      } satisfies PyodideWorkerMessage);
    });
  };


  const auditPdf = (
    bytes: Uint8Array,
  ): Promise<{ page: number; text: string }[]> => {
    return new Promise((resolve, reject) => {
      if (!pyodideWorkerRef.current)
        return reject(new Error("Pyodide worker not ready"));
      const jobId = crypto.randomUUID();
      pyodideResolvers.current.set(jobId, { resolve, reject });
      pyodideWorkerRef.current.postMessage({
        type: "AUDIT_DOCUMENT",
        jobId,
        pdfBytes: bytes,
      } satisfies PyodideWorkerMessage);
    });
  };

  const sanitizePdf = (
    bytes: Uint8Array,
  ): Promise<{ fakeRedactions: number; bytes: Uint8Array }> => {
    return new Promise((resolve, reject) => {
      if (!pyodideWorkerRef.current)
        return reject(new Error("Pyodide worker not ready"));
      const jobId = crypto.randomUUID();
      pyodideResolvers.current.set(jobId, { resolve, reject });
      pyodideWorkerRef.current.postMessage({
        type: "SANITIZE_DOCUMENT",
        jobId,
        pdfBytes: bytes,
      } satisfies PyodideWorkerMessage);
    });
  };

  const encryptPdf = (
    bytes: Uint8Array,
    password: string,
  ): Promise<Uint8Array> => {
    return new Promise((resolve, reject) => {
      if (!pyodideWorkerRef.current)
        return reject(new Error("Pyodide worker not ready"));
      const jobId = crypto.randomUUID();
      pyodideResolvers.current.set(jobId, { resolve, reject });
      pyodideWorkerRef.current.postMessage({
        type: "ENCRYPT_DOCUMENT",
        jobId,
        pdfBytes: bytes,
        password,
      } satisfies PyodideWorkerMessage);
    });
  };

  const unlockPdf = (
    bytes: Uint8Array,
    password: string,
  ): Promise<Uint8Array> => {
    return new Promise((resolve, reject) => {
      if (!pyodideWorkerRef.current)
        return reject(new Error("Pyodide worker not ready"));
      const jobId = crypto.randomUUID();
      pyodideResolvers.current.set(jobId, { resolve, reject });
      pyodideWorkerRef.current.postMessage({
        type: "UNLOCK_DOCUMENT",
        jobId,
        pdfBytes: bytes,
        password,
      } satisfies PyodideWorkerMessage);
    });
  };


  const extractAnnotations = (bytes: Uint8Array): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!pyodideWorkerRef.current)
        return reject(new Error("Pyodide worker not ready"));
      const jobId = crypto.randomUUID();
      pyodideResolvers.current.set(jobId, { resolve, reject });
      pyodideWorkerRef.current.postMessage({
        type: "EXTRACT_ANNOTATIONS",
        pdfBytes: bytes,
        jobId,
      } satisfies PyodideWorkerMessage);
    });
  };

  const extractBookmarks = (bytes: Uint8Array): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!pyodideWorkerRef.current)
        return reject(new Error("Pyodide worker not ready"));
      const jobId = crypto.randomUUID();
      pyodideResolvers.current.set(jobId, { resolve, reject });
      pyodideWorkerRef.current.postMessage({
        type: "EXTRACT_BOOKMARKS",
        jobId,
        pdfBytes: bytes,
      });
    });
  };

  const convertDocxToPdf = (bytes: Uint8Array): Promise<Uint8Array> => {
    return new Promise((resolve, reject) => {
      if (!pyodideWorkerRef.current)
        return reject(new Error("Pyodide worker not ready"));
      const jobId = crypto.randomUUID();
      pyodideResolvers.current.set(jobId, { resolve, reject });
      pyodideWorkerRef.current.postMessage({
        type: "DOCX_TO_PDF",
        jobId,
        pdfBytes: bytes,
      });
    });
  };

  const convertPdfToDocx = (bytes: Uint8Array): Promise<Uint8Array> => {
    return new Promise((resolve, reject) => {
      if (!pyodideWorkerRef.current)
        return reject(new Error("Pyodide worker not ready"));
      const jobId = crypto.randomUUID();
      pyodideResolvers.current.set(jobId, { resolve, reject });
      pyodideWorkerRef.current.postMessage({
        type: "PDF_TO_DOCX",
        jobId,
        pdfBytes: bytes,
      });
    });
  };

  const editBookmarks = (
    bytes: Uint8Array,
    bookmarks: { level: number; title: string; page: number }[]
  ): Promise<Uint8Array> => {
    return new Promise((resolve, reject) => {
      if (!pyodideWorkerRef.current)
        return reject(new Error("Pyodide worker not ready"));
      const jobId = crypto.randomUUID();
      pyodideResolvers.current.set(jobId, { resolve, reject });
      pyodideWorkerRef.current.postMessage({
        type: "EDIT_BOOKMARKS",
        jobId,
        pdfBytes: bytes,
        bookmarks,
      });
    });
  };

  const autoRedactLayout = async (doc: PDFDocument) => {
    try {
      if (useUIStore.getState().extractionMethod !== 'liteparse') {
        useUIStore.getState().setExtractionMethod('liteparse');
      }
      addLog("Action", `Starting layout-based redaction (headers/footers) on ${doc.name}`);
      const bytes = await doc.file.arrayBuffer();
      const newBytes = await autoRedactLayoutLiteparse(new Uint8Array(bytes), ['header', 'footer']);

      const newFileName = getSmartOutputName(doc.name, 'layout_redacted');
      // Explicit cast to avoid TypeScript complaining about SharedArrayBuffer
      const blob = new Blob([newBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const newFile = new File([blob], newFileName, { type: 'application/pdf' });

      updateDocumentFile(doc.id, newFile, doc.pageCount);
      addLog("Action", `Successfully redacted headers and footers from ${doc.name}`);
    } catch (error: any) {
      addLog("Action", `Failed to redact layout: ${error.message}`);
    }
  };

  const redactPdf = (
    bytes: Uint8Array,
    redactions: string[],
  ): Promise<Uint8Array> => {
    const method = useUIStore.getState().extractionMethod;
    if (method === 'liteparse') {
      return redactDocumentLiteparse(bytes, redactions);
    }
    return new Promise((resolve, reject) => {
      if (!pyodideWorkerRef.current)
        return reject(new Error("Pyodide worker not ready"));
      const jobId = crypto.randomUUID();
      pyodideResolvers.current.set(jobId, { resolve, reject });
      pyodideWorkerRef.current.postMessage({
        type: "REDACT_DOCUMENT",
        jobId,
        pdfBytes: bytes,
        redactions,
      } satisfies PyodideWorkerMessage);
    });
  };

  const extractEntities = (text: string, customPatterns?: string[]): Promise<string[]> => {
    return new Promise((resolve, reject) => {
      if (!nerWorkerRef.current)
        return reject(new Error("NER worker not ready"));
      const jobId = crypto.randomUUID();
      nerResolvers.current.set(jobId, { resolve, reject });
      nerWorkerRef.current.postMessage({
        type: "EXTRACT",
        jobId,
        text,
        customPatterns,
      } satisfies NERWorkerMessage);
    });
  };

  const handleCrossReorderApply = async (newStructures: Record<string, { docId: string; originalPageNumber: number; rotation?: number }[]>, columnNames: Record<string, string>) => {
    setIsCrossReorderOpen(false);
    let isCancelled = false;
    startProcessing("Applying cross-document changes...", true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {
      const originalFiles: Record<string, File> = {};
      documents.forEach(d => { originalFiles[d.id] = d.file; });

      const newDocsBytes = await crossDocumentReorderPages(originalFiles, newStructures);
      if (isCancelled) return;

      const newDocsToAdd: PDFDocument[] = [];

      // Update documents
      for (const [docId, bytes] of Object.entries(newDocsBytes)) {
        const standardBuffer = new Uint8Array(bytes.length);
        standardBuffer.set(bytes);
        const doc = documents.find(d => d.id === docId);
        if (doc) {
          const newFile = new File([standardBuffer], doc.name, { type: "application/pdf" });
          updateDocumentFile(docId, newFile, newStructures[docId].length);
        } else {
          // New split document
          const name = columnNames[docId] || `Document (Split).pdf`;
          const fileName = name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`;
          const newFile = new File([standardBuffer], fileName, { type: "application/pdf" });

          newDocsToAdd.push({
            id: docId,
            name: fileName,
            file: newFile,
            size: newFile.size,
            pageCount: newStructures[docId].length,
            lastModified: Date.now(),
          });
        }
      }

      if (newDocsToAdd.length > 0) {
        addDocuments(newDocsToAdd);
      }

      // Handle removals if a document ends up with 0 pages
      for (const docId of Object.keys(originalFiles)) {
        if (!newStructures[docId] || newStructures[docId].length === 0) {
          removeDocument(docId);
        }
      }
      addLog("Cross Reorder", `Reordered pages across ${Object.keys(originalFiles).length} documents.`);
    } catch (e) {
      if (isCancelled) return;
      console.error(e);
      setErrorState({
        isOpen: true,
        title: "Reorder Error",
        message: "An error occurred while reordering pages across documents.",
      });
    } finally {
      if (!isCancelled) stopProcessing();
    }
  };


  const handleDownloadAll = async () => {
    setIsBatchMenuOpen(false);
    if (documents.length === 0) return;

    let isCancelled = false;
    startProcessing("Zipping files...", true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      for (const doc of documents) {
        if (isCancelled) break;
        useProcessingStore.getState().updateStage(`Adding ${doc.name}...`);
        const arrayBuffer = await doc.file.arrayBuffer();
        zip.file(doc.name, arrayBuffer);
      }

      if (!isCancelled) {
        useProcessingStore.getState().updateStage("Generating ZIP file...");
        const blob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `bunkerpdf_export_${Date.now()}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        addLog("Batch Actions", "Downloaded all documents as ZIP");
      }
    } catch (e) {
      if (!isCancelled) {
        console.error(e);
        setErrorState({
          isOpen: true,
          title: "Download Error",
          message: "An error occurred while creating the ZIP file.",
        });
      }
    } finally {
      if (!isCancelled) stopProcessing();
    }
  };

  const handleBatchSanitize = () => {
    setIsBatchMenuOpen(false);
    setInputState({
      isOpen: true,
      title: "Batch Sanitize",
      message: (
        <ul className="list-disc pl-5 text-sm text-gray-700">
          <li>Remove all metadata (author, history, etc.) across all documents</li>
          <li>Flatten all annotations and interactive elements</li>
          <li>Remove any hidden text or scripts</li>
        </ul>
      ),
      type: "confirm",
      onConfirm: async () => {
        setInputState((prev) => ({ ...prev, isOpen: false }));
        let isCancelled = false;
        startProcessing("Batch Sanitizing...", true, () => {
          isCancelled = true;
          stopProcessing();
        });

        try {
          for (const doc of documents) {
            if (isCancelled) break;
            useProcessingStore.getState().updateStage(`Sanitizing ${doc.name}...`);
            const docBytes = new Uint8Array(await doc.file.arrayBuffer());
            const sanitizedResult = await sanitizePdf(docBytes);
            const sanitizedBytes = sanitizedResult.bytes;
            const standardBuffer = new Uint8Array(sanitizedBytes.length);
            standardBuffer.set(sanitizedBytes);
            const newFile = new File([standardBuffer], doc.name, {
              type: "application/pdf",
            });
            await updateDocumentFile(doc.id, newFile);
            addLog("Batch Sanitize", "Removed metadata and flattened form fields", doc.name);
          }
          if (!isCancelled) {
            useUIStore.getState().showFeedbackPrompt("Batch Sanitize");
          }
        } catch (e) {
          if (!isCancelled) {
            console.error(e);
            setErrorState({
              isOpen: true,
              title: "Batch Sanitize Error",
              message: "An error occurred during batch sanitization.",
            });
          }
        } finally {
          if (!isCancelled) stopProcessing();
        }
      },
      onCancel: () => setInputState((prev) => ({ ...prev, isOpen: false })),
    });
  };

  const handleBatchExtractText = async () => {
    setIsBatchMenuOpen(false);
    let isCancelled = false;
    startProcessing("Batch Extracting Text...", true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {
      let combinedText = "";
      for (const doc of documents) {
        if (isCancelled) break;
        useProcessingStore.getState().updateStage(`Extracting ${doc.name}...`);
        const result = await extractMarkdown(new Uint8Array(await doc.file.arrayBuffer()));
        combinedText += `# ${doc.name}\n\n${result}\n\n---\n\n`;
      }

      if (!isCancelled) {
        const blob = new Blob([combinedText], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `batch-extracted-notes-${Date.now()}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        useUIStore.getState().showFeedbackPrompt("Batch Extract Notes");
      }
    } catch (e) {
      if (!isCancelled) {
        console.error(e);
        setErrorState({
          isOpen: true,
          title: "Batch Extraction Error",
          message: "An error occurred during batch text extraction.",
        });
      }
    } finally {
      if (!isCancelled) stopProcessing();
    }
  };


  const handleBatchRename = () => {
    setIsBatchMenuOpen(false);
    setInputState({
      isOpen: true,
      title: "Batch Rename",
      message: "Enter the base name for all documents. They will be sequentially numbered (e.g. BaseName_1.pdf).",
      placeholder: "Project_Report",
      onConfirm: async (text) => {
        setInputState((prev) => ({ ...prev, isOpen: false }));
        if (!text) return;

        let counter = 1;
        for (const doc of documents) {
          const extension = doc.name.split('.').pop() || 'pdf';
          const newName = `${text}_${counter}.${extension}`;

          // Re-create the file with the new name
          const newFile = new File([doc.file], newName, { type: doc.file.type });
          await updateDocumentFile(doc.id, newFile);
          useFileStore.getState().updateDocument(doc.id, { name: newName });
          addLog("Batch Rename", `Renamed to ${newName}`, newName);
          counter++;
        }
      },
    });
  };
  const handleBatchWatermark = () => {
    setIsBatchMenuOpen(false);
    setInputState({
      isOpen: true,
      title: "Batch Watermark",
      message: "Enter watermark text to apply to all pages of all open documents:",
      placeholder: "CONFIDENTIAL",
      onConfirm: async (text) => {
        setInputState((prev) => ({ ...prev, isOpen: false }));
        if (!text) return;

        let isCancelled = false;
        startProcessing("Batch Watermarking...", true, () => {
          isCancelled = true;
          stopProcessing();
        });

        try {
          for (const doc of documents) {
            if (isCancelled) break;
            useProcessingStore.getState().updateStage(`Watermarking ${doc.name}...`);
            const watermarkedBytes = await watermarkPdf(doc.file, text);
            if (isCancelled) return;
            const standardBuffer = new Uint8Array(watermarkedBytes.length);
            standardBuffer.set(watermarkedBytes);
            const newFile = new File([standardBuffer], doc.name, {
              type: "application/pdf",
            });
            await updateDocumentFile(doc.id, newFile);
            addLog("Batch Watermark", `Added watermark: ${text}`, doc.name);
          }
          if (!isCancelled) {
            useUIStore.getState().showFeedbackPrompt("Batch Watermark");
          }
        } catch (e) {
          if (!isCancelled) {
            console.error(e);
            setErrorState({
              isOpen: true,
              title: "Batch Watermark Error",
              message: "An error occurred while batch watermarking.",
            });
          }
        } finally {
          if (!isCancelled) stopProcessing();
        }
      },
    });
  };

  const handleBatchResize = () => {
    setIsBatchMenuOpen(false);
    setInputState({
      isOpen: true,
      title: "Batch Resize Pages",
      message: "Select target size for all pages across all open documents:",
      type: "select",
      options: [
        { label: "A4", value: "A4" },
        { label: "Letter", value: "Letter" },
      ],
      defaultValue: "A4",
      onConfirm: async (text) => {
        setInputState((prev) => ({ ...prev, isOpen: false }));
        if (!text) return;
        const sizeStr = text.toUpperCase().trim();
        if (sizeStr !== "A4" && sizeStr !== "LETTER") {
          setErrorState({
            isOpen: true,
            title: "Invalid Size",
            message: "Please enter either 'A4' or 'Letter'.",
          });
          return;
        }

        let isCancelled = false;
        startProcessing(`Batch Resizing to ${sizeStr}...`, true, () => {
          isCancelled = true;
          stopProcessing();
        });

        try {
          for (const doc of documents) {
            if (isCancelled) break;
            useProcessingStore.getState().updateStage(`Resizing ${doc.name}...`);
            const resizedBytes = await resizePages(doc.file, sizeStr as "A4" | "Letter");
            if (isCancelled) return;
            const standardBuffer = new Uint8Array(resizedBytes.length);
            standardBuffer.set(resizedBytes);
            const newFile = new File([standardBuffer], doc.name, {
              type: "application/pdf",
            });
            await updateDocumentFile(doc.id, newFile);
            addLog("Batch Resize Pages", `Resized pages to ${sizeStr}`, doc.name);
          }
          if (!isCancelled) {
            useUIStore.getState().showFeedbackPrompt("Batch Resize Pages");
          }
        } catch (e) {
          if (!isCancelled) {
            console.error(e);
            setErrorState({
              isOpen: true,
              title: "Batch Resize Error",
              message: "An error occurred while resizing pages.",
            });
          }
        } finally {
          if (!isCancelled) stopProcessing();
        }
      },
    });
  };

  const handleBatchAddTitlePage = () => {
    setIsBatchMenuOpen(false);
    setInputState({
      isOpen: true,
      title: "Batch Add Title Page",
      message: "Enter the text to display on the new title page for all documents:",
      placeholder: "Title",
      onConfirm: async (text) => {
        setInputState((prev) => ({ ...prev, isOpen: false }));
        if (!text) return;

        let isCancelled = false;
        startProcessing("Batch Adding Title Pages...", true, () => {
          isCancelled = true;
          stopProcessing();
        });

        try {
          // Dynamic import of PDFLibDocument and StandardFonts is better here since we don't have it imported explicitly in App.tsx maybe?
          // Actually, PDFLibDocument is already imported at the top. Let's import StandardFonts if needed or use StandardFonts dynamically
          const { StandardFonts, rgb } = await import('pdf-lib');

          for (const doc of documents) {
            if (isCancelled) break;
            useProcessingStore.getState().updateStage(`Adding title page to ${doc.name}...`);

            const arrayBuffer = await doc.file.arrayBuffer();
            const pdfDoc = await PDFLibDocument.load(arrayBuffer);

            // Insert blank page at start
            const page = pdfDoc.insertPage(0, [612, 792]); // Letter size
            const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

            const textSize = 36;
            const textWidth = font.widthOfTextAtSize(text, textSize);

            page.drawText(text, {
              x: (page.getWidth() / 2) - (textWidth / 2),
              y: (page.getHeight() / 2),
              size: textSize,
              font: font,
              color: rgb(0, 0, 0),
            });

            const savedBytes = await pdfDoc.save();

            if (isCancelled) return;
            const standardBuffer = new Uint8Array(savedBytes.length);
            standardBuffer.set(savedBytes);
            const newFile = new File([standardBuffer], doc.name, {
              type: "application/pdf",
            });
            updateDocumentFile(doc.id, newFile, doc.pageCount ? doc.pageCount + 1 : undefined);
            addLog("Batch Add Title Page", `Inserted title page with text: ${text}`, doc.name);
          }
          if (!isCancelled) {
            useUIStore.getState().showFeedbackPrompt("Batch Add Title Page");
          }
        } catch (e) {
          if (!isCancelled) {
            console.error(e);
            setErrorState({
              isOpen: true,
              title: "Batch Add Title Error",
              message: "An error occurred while adding title pages.",
            });
          }
        } finally {
          if (!isCancelled) stopProcessing();
        }
      },
    });
  };

  const handleMerge = async () => {
    if (documents.length < 2) {
      setErrorState({
        isOpen: true,
        title: "Not Enough Files",
        message: "Please upload at least 2 PDFs to merge.",
      });
      return;
    }

    let isCancelled = false;
    startProcessing("Merging PDFs...", true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {
      const mergedBytes = await mergePdfs(documents.map((d) => d.file));
      if (isCancelled) return;

      const buffer = new Uint8Array(mergedBytes);
      const blob = new Blob([buffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = getSmartOutputName(documents[0].name, "merged");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addLog("Merge", `Merged ${documents.length} files into one.`);
    } catch (e) {
      if (isCancelled) return;
      console.error(e);
      setErrorState({
        isOpen: true,
        title: "Merge Error",
        message: "An error occurred while merging the PDFs.",
      });
    } finally {
      if (!isCancelled) stopProcessing();
    }
  };

  const handleSplitRequest = (doc: PDFDocument) => {
    setSplitModalState({ isOpen: true, doc: doc });
  };

  const executeSplit = async (ranges: string) => {
    const doc = splitModalState.doc;
    if (!doc) return;
    setSplitModalState({ isOpen: false, doc: null });

    let isCancelled = false;
    startProcessing("Splitting PDF pages...", true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {
      const splitResults = await splitPdf(doc.file, ranges);
      if (isCancelled) return;

      // Add split documents to workspace instead of downloading
      const newDocs = splitResults.map((result, index) => {
        const standardBuffer = new Uint8Array(result.bytes.length);
        standardBuffer.set(result.bytes);
        const newFile = new File(
          [standardBuffer],
          getSmartOutputName(doc.name, `split-chunk-${index + 1}`),
          { type: "application/pdf" },
        );
        return {
          id: crypto.randomUUID(),
          file: newFile,
          name: newFile.name,
          size: newFile.size,
          lastModified: Date.now(),
          pageCount: result.pageCount,
        };
      });
      addDocuments(newDocs);
      addLog("Split", `Split document into ${newDocs.length} chunks.`, doc.name);
    } catch (e) {
      if (isCancelled) return;
      console.error(e);
      setErrorState({
        isOpen: true,
        title: "Split Error",
        message: "An error occurred while splitting the PDF. Please check your ranges.",
      });
    } finally {
      if (!isCancelled) stopProcessing();
    }
  };


  const handleWatermark = (doc: PDFDocument) => {
    setVisualWatermarkState({ isOpen: true, docId: doc.id });
  };

  const executeWatermark = async (text: string, pagesStr: string) => {
    const docId = visualWatermarkState.docId;
    setVisualWatermarkState({ isOpen: false, docId: null });
    if (!docId || !text) return;

    const doc = documents.find(d => d.id === docId);
    if (!doc) return;

    let isCancelled = false;
    startProcessing("Adding watermark...", true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {
      const watermarkedBytes = await watermarkPdf(doc.file, text, pagesStr);
      if (isCancelled) return;

      const standardBuffer = new Uint8Array(watermarkedBytes.length);
      standardBuffer.set(watermarkedBytes);
      const newFile = new File([standardBuffer], doc.name, {
        type: "application/pdf",
      });
      await updateDocumentFile(doc.id, newFile, undefined, {
        type: 'watermark',
        params: { description: `Added watermark: ${text}` }
      });
      addLog("Watermark", `Added watermark: "${text}"`, doc.name);
    } catch (e) {
      if (isCancelled) return;
      console.error(e);
      setErrorState({
        isOpen: true,
        title: "Watermark Error",
        message: "An error occurred while adding the watermark.",
      });
    } finally {
      if (!isCancelled) stopProcessing();
    }
  };
  const handleViewMetadata = (doc: PDFDocument, metadata: { standard: Record<string, string>; xmp: string }) => {
    setMetadataModalState({ isOpen: true, metadata, doc });
  };


  const handleSaveMetadata = async (newMetadata: { standard: Record<string, string>; xmp: string }) => {
    const docToUpdate = metadataModalState.doc;
    if (!docToUpdate) return;

    let isCancelled = false;
    startProcessing("Updating metadata...", true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {
      const buffer = await docToUpdate.file.arrayBuffer();
      const pdfBytes = new Uint8Array(buffer);
      const updatedBytes = await editMetadata(pdfBytes, newMetadata);
      if (isCancelled) return;

      const standardBuffer = new Uint8Array(updatedBytes.length);
      standardBuffer.set(updatedBytes);
      const newFile = new File([standardBuffer], docToUpdate.file.name, { type: "application/pdf" });
      await updateDocumentFile(docToUpdate.id, newFile, docToUpdate.pageCount, {
        type: "other",
        timestamp: Date.now(),
        params: { action: "Edit Metadata" }
      });

      setMetadataModalState({ isOpen: false, metadata: null, doc: null });
      addLog("Edit Metadata", "Updated document metadata.", docToUpdate.name);
      useUIStore.getState().showFeedbackPrompt("Edit Metadata");
    } catch (err: any) {
      if (isCancelled) return;
      console.error(err);
      setErrorState({
        isOpen: true,
        title: "Metadata Update Error",
        message: err.message || "An error occurred while updating metadata."
      });
    } finally {
      if (!isCancelled) stopProcessing();
    }
  };
  const executeInteractiveRedact = async (boxes: RedactBox[]) => {
    const docId = interactiveRedactState.docId;
    if (!docId) return;
    setInteractiveRedactState({ isOpen: false, docId: null });
    const doc = documents.find(d => d.id === docId);
    if (!doc) return;

    let isCancelled = false;
    startProcessing("Redacting selected boxes...", true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {
      const buffer = await doc.file.arrayBuffer();
      const pdfBytes = new Uint8Array(buffer);

      const redactedBytes = await redactBoxesLiteparse(pdfBytes, boxes);

      if (isCancelled) return;

      const standardBuffer = new Uint8Array(redactedBytes.length);
      standardBuffer.set(redactedBytes);
      const newFile = new File([standardBuffer], doc.name, { type: "application/pdf" });
      updateDocumentFile(doc.id, newFile);
      addLog("Manual Action", `Redacted ${boxes.length} sections interactively`, doc.name);
      useUIStore.getState().showFeedbackPrompt("Redact");

    } catch (e) {
      if (isCancelled) return;
      console.error(e);
      setErrorState({
        isOpen: true,
        title: "Redact Error",
        message: "An error occurred while redacting the document.",
      });
    } finally {
      if (!isCancelled) stopProcessing();
    }
  };

  const handleDocxDropped = async (files: File[]) => {
    for (const file of files) {
      let isCancelled = false;
      startProcessing(`Converting ${file.name} to PDF...`, true, () => {
        isCancelled = true;
        stopProcessing();
      });

      try {
        const arrayBuffer = await file.arrayBuffer();
        const docxBytes = new Uint8Array(arrayBuffer);
        const pdfBytes = await convertDocxToPdf(docxBytes);
        if (isCancelled) return;

        const standardBuffer = new Uint8Array(pdfBytes.length);
        standardBuffer.set(pdfBytes);
        const newName = file.name.replace(/\.docx$/i, ".pdf");
        const newFile = new File([standardBuffer], newName, { type: "application/pdf" });

        let pageCount;
        let isEncrypted = false;
        let isCorrupt = false;

        try {
          const { getPdfInfo } = await import('./lib/pdfProcessing');
          const info = await getPdfInfo(newFile);
          pageCount = info.pageCount;
          isEncrypted = info.isEncrypted;
        } catch (e: unknown) {
          console.error(`Failed to parse converted PDF info`, e);
          if (e instanceof Error && e.message === 'CORRUPT_PDF') {
            isCorrupt = true;
          }
        }

        if (isCorrupt) {
          setErrorState({
            isOpen: true,
            title: "Conversion Error",
            message: "The converted PDF appears to be corrupted.",
          });
          continue;
        }

        useFileStore.getState().addDocuments([
          {
            id: crypto.randomUUID(),
            file: newFile,
            name: newFile.name,
            size: newFile.size,
            lastModified: newFile.lastModified,
            pageCount,
            isEncrypted,
            isCorrupt,
          },
        ]);
        addLog("Convert to PDF", `Converted DOCX to PDF`, file.name);
      } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        if (isCancelled) return;
        console.error(err);
        setErrorState({
          isOpen: true,
          title: "Conversion Error",
          message: err.message || "Failed to convert DOCX to PDF.",
        });
      } finally {
        if (!isCancelled) stopProcessing();
      }
    }
  };

  const handleReadAloud = async (doc: PDFDocument) => {
    let isCancelled = false;
    startProcessing("Extracting text for reading...", true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {
      const arrayBuffer = await doc.file.arrayBuffer();
      const pdfBytes = new Uint8Array(arrayBuffer);
      const text = await extractText(pdfBytes);
      if (isCancelled) return;

      if (!text.trim()) {
        setErrorState({
          isOpen: true,
          title: "Read Aloud Error",
          message: "No readable text found in this document. You may need to run OCR first.",
        });
        return;
      }

      setReadAloudState({
        isOpen: true,
        text: text,
        title: `Read Aloud: ${doc.name}`,
      });
      addLog("Read Aloud", "Started Web Speech API playback for document.", doc.name);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      if (isCancelled) return;
      console.error(e);
      setErrorState({
        isOpen: true,
        title: "Read Aloud Error",
        message: "Failed to extract text. " + (e.message || ""),
      });
    } finally {
      if (!isCancelled) stopProcessing();
    }
  };

  const handleOcr = (doc: PDFDocument) => {
    setPageSelectorState({
      isOpen: true,
      title: "OCR (Text Recognition)",
      docId: doc.id,
      pageCount: doc.pageCount || 0,
      onConfirm: async (selectedPages) => {
        setPageSelectorState((prev) => ({ ...prev, isOpen: false }));

        let pagesToProcess = selectedPages;
        if (pagesToProcess.length === 0) pagesToProcess = [1];

        let isCancelled = false;
        const abortController = new AbortController();
        startProcessing(`Starting OCR on ${pagesToProcess.length} page(s)...`, true, () => {
          isCancelled = true;
          abortController.abort();
          stopProcessing();
        });

        try {
          const newFile = await ocrPdf(doc.file, pagesToProcess, (stage) => {
            if (!isCancelled) useProcessingStore.getState().updateStage(stage);
          }, abortController.signal, async (intermediateFile) => {
            if (!isCancelled) {
               await updateDocumentFile(doc.id, intermediateFile);
            }
          });

          if (isCancelled) return;

          await updateDocumentFile(doc.id, newFile);
          addLog("OCR", "Extracted text and overlaid it on the document.", doc.name);

          setErrorState({
            isOpen: true,
            title: "OCR Complete",
            message: "Text has been successfully extracted and overlaid on the document.",
          });
        } catch (e) {
          if (isCancelled) return;
          console.error(e);
          setErrorState({
            isOpen: true,
            title: "OCR Error",
            message: "An error occurred during text extraction.",
          });
        } finally {
          if (!isCancelled) stopProcessing();
        }
      }
    });
  };

  const handleAudit = async (doc: PDFDocument) => {
    let isCancelled = false;
    startProcessing("Auditing document for fake redactions...", true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {
      const arrayBuffer = await doc.file.arrayBuffer();
      const pdfBytes = new Uint8Array(arrayBuffer);

      const fakeRedactions = await auditPdf(pdfBytes);
      if (isCancelled) return;

      addLog("Audit", `Audited document for fake redactions. Found ${fakeRedactions.length}.`, doc.name);

      if (fakeRedactions.length === 0) {
        setErrorState({
          isOpen: true,
          title: "Audit Complete",
          message: "No fake redactions found. The document appears safe.",
        });
      } else {
        const fakeRedactionList = fakeRedactions.map(
          (fr) => `Page ${fr.page}: "${fr.text}"`,
        );

        setErrorState({
          isOpen: true,
          title: "Fake Redactions Found!",
          message: (
            <div>
              <p className="mb-2 text-red-600 font-semibold">
                Warning: This document contains hidden text under shapes (fake redactions).
              </p>
              <ul className="list-disc pl-5 text-sm text-gray-700 max-h-40 overflow-y-auto">
                {fakeRedactionList.map((item, idx) => (
                  <li key={idx} className="break-all">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ),
        });
      }
    } catch (e) {
      if (isCancelled) return;
      console.error(e);
      setErrorState({
        isOpen: true,
        title: "Audit Error",
        message: "An error occurred while auditing the document.",
      });
    } finally {
      if (!isCancelled) stopProcessing();
    }
  };

  const handleEncrypt = (doc: PDFDocument) => {
    setInputState({
      isOpen: true,
      title: "Protect PDF",
      message: "Enter a password to encrypt this PDF:",
      placeholder: "Secure password",
      type: "password",
      onConfirm: async (password) => {
        setInputState((prev) => ({ ...prev, isOpen: false }));
        if (!password) return;

        let isCancelled = false;
        startProcessing("Encrypting PDF...", true, () => {
          isCancelled = true;
          stopProcessing();
        });

        try {
          const arrayBuffer = await doc.file.arrayBuffer();
          const pdfBytes = new Uint8Array(arrayBuffer);
          const encryptedBytes = await encryptPdf(pdfBytes, password);
          if (isCancelled) return;

          const standardBuffer = new Uint8Array(encryptedBytes.length);
          standardBuffer.set(encryptedBytes);
          const newFile = new File([standardBuffer], doc.name, {
            type: "application/pdf",
          });
          await updateDocumentFile(doc.id, newFile);
          useFileStore.getState().updateDocument(doc.id, { isEncrypted: true });
          addLog("Protect", "Password protected document.", doc.name);
        } catch (e) {
          if (isCancelled) return;
          console.error(e);
          setErrorState({
            isOpen: true,
            title: "Encryption Error",
            message: "An error occurred while encrypting the PDF.",
          });
        } finally {
          if (!isCancelled) stopProcessing();
        }
      },
    });
  };

  const handleUnlock = (doc: PDFDocument) => {
    setInputState({
      isOpen: true,
      title: "Unlock PDF",
      message: "Enter the password to unlock this PDF:",
      placeholder: "Password",
      type: "password",
      onConfirm: async (password) => {
        let isCancelled = false;
        if (!password) return;
        startProcessing("Unlocking document...", true, () => {
          isCancelled = true;
        });

        try {
          const arrayBuffer = await doc.file.arrayBuffer();
          const pdfBytes = new Uint8Array(arrayBuffer);
          let unlockedBytes: Uint8Array;

          try {
            // Try pdf-lib first (standard RC4)
            const { PDFDocument: PDFLibDoc } = await import('pdf-lib');
            const pdfDoc = await PDFLibDoc.load(pdfBytes, { password } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
            unlockedBytes = await pdfDoc.save();
          } catch (e: unknown) {
            // If pdf-lib fails (e.g. AES-256), fallback to pymupdf
            console.log("pdf-lib failed to unlock, falling back to pymupdf", e);
            unlockedBytes = await unlockPdf(pdfBytes, password);
          }

          if (isCancelled) return;

          const standardBuffer = new Uint8Array(unlockedBytes.length);
          standardBuffer.set(unlockedBytes);

          const newFileName = doc.name.replace(/\.pdf$/i, '-unlocked.pdf');
          const newFile = new File([standardBuffer], newFileName, {
            type: "application/pdf",
          });

          await updateDocumentFile(doc.id, newFile);
          useFileStore.getState().updateDocument(doc.id, {
            name: newFileName,
            isEncrypted: false
          });

          setInputState(prev => ({ ...prev, isOpen: false }));
          addLog("Unlock", "Removed password protection.", newFileName);
        } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
          if (isCancelled) return;
          console.error(e);

          // Differentiate between wrong password and other errors
          const isWrongPassword = e?.message?.includes('Incorrect password') ||
                                  e?.message?.includes('IncorrectPasswordException');

          setErrorState({
            isOpen: true,
            title: "Unlock Error",
            message: isWrongPassword
              ? "Incorrect password — please try again."
              : "An error occurred while unlocking the PDF.",
          });
        } finally {
          if (!isCancelled) stopProcessing();
        }
      },
    });
  };
  const handleHighlight = (doc: PDFDocument) => {
    setInteractiveHighlightState({ isOpen: true, docId: doc.id });
  };

  const handleInteractiveRedact = (doc: PDFDocument) => {
    setInteractiveRedactState({ isOpen: true, docId: doc.id });
  };
  const handleInteractiveTable = (doc: PDFDocument) => {
    setInteractiveTableState({ isOpen: true, docId: doc.id });
  };

  const [interactiveCopyState, setInteractiveCopyState] = useState<{isOpen: boolean, docId: string | null}>({isOpen: false, docId: null});

  const handleInteractiveCopy = (doc: PDFDocument) => {
    setInteractiveCopyState({ isOpen: true, docId: doc.id });
  };



  const handleInteractiveAutoLinker = (doc: PDFDocument) => {
    setInteractiveAutoLinkerState({ isOpen: true, docId: doc.id });
  };


  const handleSmartCrop = (doc: PDFDocument) => {
    setSmartCropState({ isOpen: true, docId: doc.id });
  };

  const executeSmartCrop = async (bytes: Uint8Array) => {
    const docId = smartCropState.docId;
    if (!docId) return;
    setSmartCropState({ isOpen: false, docId: null });
    const doc = documents.find(d => d.id === docId);
    if (!doc) return;

    try {
      const newFile = new File([new Uint8Array(bytes)], getSmartOutputName(doc.name, 'cropped'), { type: "application/pdf" });
      await useFileStore.getState().updateDocumentFile(docId, newFile);
      addLog("Action", `Smart Cropped ${doc.name}`);
    } catch (error) {
      console.error(error);
    }
  };
  const handleSmartForm = (doc: PDFDocument) => {
    setSmartFormState({ isOpen: true, docId: doc.id });
  };

  const executeSmartForm = async (bytes: Uint8Array) => {
    const docId = smartFormState.docId;
    if (!docId) return;
    setSmartFormState({ isOpen: false, docId: null });
    const doc = documents.find(d => d.id === docId);
    if (!doc) return;

    try {
      const newFile = new File([new Uint8Array(bytes)], doc.name, { type: "application/pdf" });
      await useFileStore.getState().updateDocumentFile(docId, newFile);
    } catch (error) {
      console.error(error);
    }
  };

  const diffHighlightPdf = (bytes: Uint8Array, highlights: string[], color: [number, number, number]): Promise<Uint8Array> => {
    const method = useUIStore.getState().extractionMethod;
    if (method === 'liteparse') {
      return diffHighlightPdfLiteparse(bytes, highlights, color);
    }
    return new Promise((resolve, reject) => {
      if (!pyodideWorkerRef.current)
        return reject(new Error("Worker not initialized"));

      const jobId = Math.random().toString(36).substring(7);

      const handleMessage = (e: MessageEvent) => {
        if (e.data.jobId !== jobId) return;
        if (e.data.type === "RESULT" && e.data.result) {
          pyodideWorkerRef.current?.removeEventListener(
            "message",
            handleMessage,
          );
          resolve(e.data.result as Uint8Array);
        } else if (e.data.type === "ERROR") {
          pyodideWorkerRef.current?.removeEventListener(
            "message",
            handleMessage,
          );
          reject(new Error(e.data.error));
        }
      };

      pyodideWorkerRef.current.addEventListener("message", handleMessage);
      pyodideWorkerRef.current.postMessage({
        type: "DIFF_HIGHLIGHT_DOCUMENT",
        jobId,
        pdfBytes: bytes,
        highlights,
        color,
      } satisfies PyodideWorkerMessage);
    });
  };

  const diffMergedHighlightPdf = (bytes1: Uint8Array, bytes2: Uint8Array, removedHighlights: string[], addedHighlights: string[]): Promise<Uint8Array> => {
    const method = useUIStore.getState().extractionMethod;
    if (method === 'liteparse') {
      return diffMergedHighlightPdfLiteparse(bytes1, bytes2);
    }
    return new Promise((resolve, reject) => {
      if (!pyodideWorkerRef.current)
        return reject(new Error("Worker not initialized"));

      const jobId = Math.random().toString(36).substring(7);

      const handleMessage = (e: MessageEvent) => {
        if (e.data.jobId !== jobId) return;
        if (e.data.type === "RESULT" && e.data.result) {
          pyodideWorkerRef.current?.removeEventListener(
            "message",
            handleMessage,
          );
          resolve(e.data.result as Uint8Array);
        } else if (e.data.type === "ERROR") {
          pyodideWorkerRef.current?.removeEventListener(
            "message",
            handleMessage,
          );
          reject(new Error(e.data.error));
        }
      };

      pyodideWorkerRef.current.addEventListener("message", handleMessage);
      pyodideWorkerRef.current.postMessage({
        type: "DIFF_MERGED_HIGHLIGHT_DOCUMENT",
        jobId,
        pdfBytes: bytes1,
        pdfBytes2: bytes2,
        removedHighlights,
        addedHighlights,
      } satisfies PyodideWorkerMessage);
    });
  };

  const executeHighlight = async (boxes: HighlightBox[]) => {
    const docId = interactiveHighlightState.docId;
    if (!docId) return;
    setInteractiveHighlightState({ isOpen: false, docId: null });
    const doc = documents.find(d => d.id === docId);
    if (!doc) return;

    let isCancelled = false;
    startProcessing("Smart highlighting text...", true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {
      const bytes = await doc.file.arrayBuffer();
      const newBytes = await highlightBoxesLiteparse(new Uint8Array(bytes), boxes);

      if (isCancelled) return;
      const newFile = new File([new Blob([newBytes.buffer as ArrayBuffer])], getSmartOutputName(doc.name, 'highlighted'), { type: "application/pdf" });
      await useFileStore.getState().updateDocumentFile(docId, newFile);
      addLog("Action", `Smart Highlighted ${doc.name}`);
    } catch (error: any) {
      if (isCancelled) return;
      console.error(error);
      setErrorState({ isOpen: true, title: "Highlight Error", message: error.message });
    } finally {
      if (!isCancelled) stopProcessing();
    }
  };


  const handleBatesNumbering = (doc: PDFDocument) => {
    setInputState({
      isOpen: true,
      title: "Bates Numbering",
      message: "Enter Prefix, Start Number, Padding, Position (e.g. 'EXHIBIT-, 1, 6, bottom-right'). Defaults to '1, 6, bottom-right'.",
      placeholder: "EXHIBIT-, 1, 6, bottom-right",
      defaultValue: ", 1, 6, bottom-right",
      onConfirm: async (text) => {
        setInputState((prev) => ({ ...prev, isOpen: false }));
        if (!text) return;

        let prefix = "";
        let startNumber = 1;
        let padding = 6;
        let position = "bottom-right";

        const parts = text.split(",").map(p => p.trim());
        if (parts.length > 0 && parts[0] !== "") prefix = parts[0];
        if (parts.length > 1 && !isNaN(parseInt(parts[1]))) startNumber = parseInt(parts[1]);
        if (parts.length > 2 && !isNaN(parseInt(parts[2]))) padding = parseInt(parts[2]);
        if (parts.length > 3 && parts[3] !== "") position = parts[3];

        let isCancelled = false;
        startProcessing("Adding Bates numbers...", true, () => {
          isCancelled = true;
          stopProcessing();
        });

        try {
          const numberedBytes = await addBatesNumbers(doc.file, prefix, startNumber, padding, position);
          if (isCancelled) return;

          const standardBuffer = new Uint8Array(numberedBytes.length);
          standardBuffer.set(numberedBytes);
          const newFile = new File([standardBuffer], doc.name, {
            type: "application/pdf",
          });

          await updateDocumentFile(doc.id, newFile);
          addLog("Bates Numbering", `Added Bates numbers: ${prefix} at ${position}`, doc.name);

          if (!isCancelled) {
            stopProcessing();
          }
        } catch (error) {
          console.error("Bates numbering error:", error);
          if (!isCancelled) {
            stopProcessing();
            setErrorState({
              isOpen: true,
              title: "Bates Numbering Error",
              message: "An error occurred while adding Bates numbers.",
            });
          }
        }
      },
      onCancel: () => setInputState((prev) => ({ ...prev, isOpen: false })),
    });
  };

  const handleAddPageNumbers = (doc: PDFDocument) => {
    setInputState({
      isOpen: true,
      title: "Add Page Numbers",
      message: "Enter format and position (e.g., 'Page {n} of {total}, bottom-right'). Default is '{n}, bottom-right'.",
      placeholder: "{n}, bottom-right",
      defaultValue: "{n}, bottom-right",
      onConfirm: async (text) => {
        setInputState((prev) => ({ ...prev, isOpen: false }));
        if (!text) return;

        let format: string;
        let position = "bottom-right";
        const lastCommaIndex = text.lastIndexOf(",");
        if (lastCommaIndex !== -1) {
          format = text.substring(0, lastCommaIndex).trim();
          position = text.substring(lastCommaIndex + 1).trim();
        } else {
          format = text.trim();
        }

        let isCancelled = false;
        startProcessing("Adding page numbers...", true, () => {
          isCancelled = true;
          stopProcessing();
        });

        try {
          const numberedBytes = await addPageNumbers(doc.file, position, 1, format);
          if (isCancelled) return;

          const standardBuffer = new Uint8Array(numberedBytes.length);
          standardBuffer.set(numberedBytes);
          const newFile = new File([standardBuffer], doc.name, {
            type: "application/pdf",
          });
          await updateDocumentFile(doc.id, newFile);
          addLog("Add Page Numbers", `Added page numbers with format ${format} at ${position}`, doc.name);
        } catch (e) {
          if (isCancelled) return;
          console.error(e);
          setErrorState({
            isOpen: true,
            title: "Add Page Numbers Error",
            message: "An error occurred while adding page numbers.",
          });
        } finally {
          if (!isCancelled) stopProcessing();
        }
      },
    });
  };

  const handleResizePages = (doc: PDFDocument) => {
    setInputState({
      isOpen: true,
      title: "Resize Pages",
      message: "Select target size for all pages:",
      type: "select",
      options: [
        { label: "A4", value: "A4" },
        { label: "Letter", value: "Letter" },
      ],
      defaultValue: "A4",
      onConfirm: async (text) => {
        setInputState((prev) => ({ ...prev, isOpen: false }));
        if (!text) return;

        const sizeStr = text.trim().toLowerCase();
        if (sizeStr !== "a4" && sizeStr !== "letter") {
          setErrorState({
            isOpen: true,
            title: "Invalid Size",
            message: "Size must be 'A4' or 'Letter'.",
          });
          return;
        }

        let isCancelled = false;
        startProcessing(`Resizing pages to ${sizeStr.toUpperCase()}...`, true, () => {
          isCancelled = true;
          stopProcessing();
        });

        try {
          const resizedBytes = await resizePages(doc.file, sizeStr.toUpperCase());
          if (isCancelled) return;

          const standardBuffer = new Uint8Array(resizedBytes.length);
          standardBuffer.set(resizedBytes);
          const newFile = new File([standardBuffer], doc.name, {
            type: "application/pdf",
          });
          await updateDocumentFile(doc.id, newFile);
          addLog("Resize Pages", `Resized pages to ${sizeStr.toUpperCase()}`, doc.name);
        } catch (e) {
          if (isCancelled) return;
          console.error(e);
          setErrorState({
            isOpen: true,
            title: "Resize Error",
            message: "An error occurred while resizing pages.",
          });
        } finally {
          if (!isCancelled) stopProcessing();
        }
      },
    });
  };
  return (
    <div className={`App font-sans min-h-screen flex flex-col bg-gray-50 text-gray-900`}>
      <MetadataModal
        isOpen={metadataModalState.isOpen}
        metadata={metadataModalState.metadata}
        onClose={() => setMetadataModalState({ isOpen: false, metadata: null, doc: null })}
        onSave={handleSaveMetadata}
        isSaving={isGlobalProcessing}
      />
      <PrivacyAuditLogModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
      />
      {isDiffModalOpen && <DiffModal onClose={() => { setIsDiffModalOpen(false); setDiffInitialDoc1Id(undefined); setDiffInitialDoc2Id(undefined); }} extractParagraphs={extractParagraphs} diffHighlightPdf={diffHighlightPdf} diffMergedHighlightPdf={diffMergedHighlightPdf} initialDoc1Id={diffInitialDoc1Id} initialDoc2Id={diffInitialDoc2Id} />}
      {isSideBySideModalOpen && <SideBySideViewerModal onClose={() => setIsSideBySideModalOpen(false)} onOpenCompare={(doc1Id, doc2Id) => { setIsSideBySideModalOpen(false); setDiffInitialDoc1Id(doc1Id); setDiffInitialDoc2Id(doc2Id); setIsDiffModalOpen(true); }} />}
      <ProcessingModal />
      <FeedbackPrompt />
      <PWAInstallPrompt />
      <InputModal
        isOpen={inputState.isOpen}
        title={inputState.title}
        message={inputState.message}
        placeholder={inputState.placeholder}
        defaultValue={inputState.defaultValue}
        onConfirm={inputState.onConfirm}
        onCancel={() => {
          if (inputState.onCancel) {
            inputState.onCancel();
          } else {
            setInputState((prev) => ({ ...prev, isOpen: false }));
          }
        }}
      />
      <InputModal
        isOpen={splitModalState.isOpen}
        title="Split PDF"
        message="Enter page ranges to extract (e.g. '1, 3, 5-7'). Leave empty to split every page into a separate document (Burst mode)."
        placeholder="1, 3, 5-7"
        defaultValue=""
        onConfirm={executeSplit}
        onCancel={() => setSplitModalState({ isOpen: false, doc: null })}
      />
      <PageSelectorModal
        isOpen={pageSelectorState.isOpen}
        title={pageSelectorState.title}
        docId={pageSelectorState.docId || ""}
        pageCount={pageSelectorState.pageCount}
        singleSelection={pageSelectorState.singleSelection}
        thumbnailCache={thumbnailCache}
        setThumbnailCache={setThumbnailCache}
        onConfirm={pageSelectorState.onConfirm}
        onCancel={() => setPageSelectorState(prev => ({ ...prev, isOpen: false }))}
      />
      <ErrorModal
        isOpen={errorState.isOpen}
        title={errorState.title}
        message={errorState.message}
        onClose={() => setErrorState((prev) => ({ ...prev, isOpen: false }))}
      />
      <ReadAloudModal
        isOpen={readAloudState.isOpen}
        text={readAloudState.text}
        title={readAloudState.title}
        onClose={() => setReadAloudState((prev) => ({ ...prev, isOpen: false }))}
      />
      <CrossDocumentReorder
        isOpen={isCrossReorderOpen}
        onClose={() => setIsCrossReorderOpen(false)}
        onApply={handleCrossReorderApply}
      />
      <InteractiveSmartHighlightModal
        isOpen={interactiveHighlightState.isOpen}
        docId={interactiveHighlightState.docId}
        onClose={() => setInteractiveHighlightState({ isOpen: false, docId: null })}
        onApply={executeHighlight}
      />
      <InteractiveRedactModal
        isOpen={interactiveRedactState.isOpen}
        docId={interactiveRedactState.docId}
        onClose={() => setInteractiveRedactState({ isOpen: false, docId: null })}
        onApply={executeInteractiveRedact}
      />
      <InteractiveTableModal
        isOpen={interactiveTableState.isOpen}
        docId={interactiveTableState.docId}
        onClose={() => setInteractiveTableState({ isOpen: false, docId: null })}
      />
      <InteractiveCopyModal
        isOpen={interactiveCopyState.isOpen}
        docId={interactiveCopyState.docId}
        onClose={() => setInteractiveCopyState({ isOpen: false, docId: null })}
      />
      <InteractiveAutoLinkerModal
        isOpen={interactiveAutoLinkerState.isOpen}
        docId={interactiveAutoLinkerState.docId}
        onClose={() => setInteractiveAutoLinkerState({ isOpen: false, docId: null })}
        onApplyLinks={async (links) => {
          const docId = interactiveAutoLinkerState.docId;
          setInteractiveAutoLinkerState({ isOpen: false, docId: null });
          if (docId) {
             const doc = documents.find(d => d.id === docId);
             if (!doc) return;
             try {
               const arrayBuffer = await doc.file.arrayBuffer();
               const bytes = new Uint8Array(arrayBuffer);

               const resultBytes = await autoLinkBoxesLiteparse(bytes, links);

               const standardBuffer = new Uint8Array(resultBytes.length);
               standardBuffer.set(resultBytes);
               const newFile = new File([standardBuffer], `linked_${doc.name}`, { type: 'application/pdf' });

               await useFileStore.getState().updateDocumentFile(docId, newFile);
               addLog("Action", `Applied ${links.length} links to ${doc.name}`, doc.name);
             } catch (err) {
               console.error("Error applying links", err);
               setErrorState({ isOpen: true, title: "Auto-Linker Error", message: err instanceof Error ? err.message : String(err) });
             }
          }
        }}
      />

      <InteractiveDataDictionaryModal
        isOpen={interactiveDataDictionaryState.isOpen}
        docId={interactiveDataDictionaryState.docId}
        onClose={() => setInteractiveDataDictionaryState({ isOpen: false, docId: null })}
      />
      <SmartCropModal
        isOpen={smartCropState.isOpen}
        docId={smartCropState.docId}
        onClose={() => setSmartCropState({ isOpen: false, docId: null })}
        onApply={executeSmartCrop}
      />
      <SmartFormGenerationModal
        isOpen={smartFormState.isOpen}
        docId={smartFormState.docId}
        onClose={() => setSmartFormState({ isOpen: false, docId: null })}
        onApply={executeSmartForm}
      />
      <VisualWatermarkModal
        isOpen={visualWatermarkState.isOpen}
        docId={visualWatermarkState.docId}
        onClose={() => setVisualWatermarkState({ isOpen: false, docId: null })}
        onApply={executeWatermark}
      />
      {documents.length === 0 ? (
        <div className="flex flex-col h-screen">
          <header className={`p-4 flex justify-between items-center border-b bg-white border-gray-200`}>
            <div className={`font-bold text-xl tracking-tight text-gray-800`}>
              BunkerPDF
            </div>
            <div className="flex gap-2 items-center">
              <EngineStatusPill />
              <SettingsDropdown />
            </div>
          </header>
          <div className="flex-1 flex flex-col pb-8">
            <Dropzone
              onError={(title, message) =>
                setErrorState({ isOpen: true, title, message })
              }
              onDocxDropped={handleDocxDropped}
              onImagesDropped={(files) => {
                const newItems = files.map((file) => ({
                  id: crypto.randomUUID(),
                  file,
                  previewUrl: URL.createObjectURL(file),
                }));
                setPendingImages((prev) => [...prev, ...newItems]);
              }}
            />
            {pendingImages.length > 0 && (
              <ImageReorderRail
                images={pendingImages}
                setImages={setPendingImages}
                onConvert={async () => {
                  try {
                    startProcessing("Converting images to PDF...", false, () => stopProcessing());
                    const files = pendingImages.map((i) => i.file);
                    const pdfBytes = await convertImagesToPdf(files, imageFitMode);

                    const newFileName = `${files[0].name.replace(/\.[^/.]+$/, "")}-combined-${Date.now()}.pdf`;
                    // ensure ArrayBuffer compatibility
                    const standardBuffer = new Uint8Array(pdfBytes.length);
                    standardBuffer.set(pdfBytes);

                    const blob = new Blob([standardBuffer], { type: "application/pdf" });
                    const newFile = new File([blob], newFileName, { type: "application/pdf", lastModified: Date.now() });

                    const { getPdfInfo } = await import('./lib/pdfProcessing');
                    const info = await getPdfInfo(newFile);

                    addDocuments([{
                      id: crypto.randomUUID(),
                      file: newFile,
                      name: newFile.name,
                      size: newFile.size,
                      lastModified: newFile.lastModified,
                      pageCount: info.pageCount,
                      operations: [],
                    }]);

                    pendingImages.forEach(img => URL.revokeObjectURL(img.previewUrl));
                    setPendingImages([]);
                    stopProcessing();
                  } catch (e: unknown) {
                    stopProcessing();
                    const message = e instanceof Error ? e.message : "An error occurred.";
                    setErrorState({ isOpen: true, title: "Image Conversion Failed", message });
                  }
                }}
                onCancel={() => {
                  pendingImages.forEach(img => URL.revokeObjectURL(img.previewUrl));
                  setPendingImages([]);
                }}
                fitMode={imageFitMode}
                setFitMode={setImageFitMode}
                isProcessing={isGlobalProcessing}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="p-8 max-w-6xl mx-auto flex flex-col gap-8">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <h1 className="text-3xl font-bold">Workspace</h1>
              <div className="flex items-center gap-2">
                <EngineStatusPill />
                <SettingsDropdown />
              </div>
            </div>

            {pendingImages.length > 0 && (
              <ImageReorderRail
                images={pendingImages}
                setImages={setPendingImages}
                onConvert={async () => {
                  try {
                    startProcessing("Converting images to PDF...", false, () => stopProcessing());
                    const files = pendingImages.map((i) => i.file);
                    const pdfBytes = await convertImagesToPdf(files, imageFitMode);

                    const newFileName = `${files[0].name.replace(/\.[^/.]+$/, "")}-combined-${Date.now()}.pdf`;
                    // ensure ArrayBuffer compatibility
                    const standardBuffer = new Uint8Array(pdfBytes.length);
                    standardBuffer.set(pdfBytes);

                    const blob = new Blob([standardBuffer], { type: "application/pdf" });
                    const newFile = new File([blob], newFileName, { type: "application/pdf", lastModified: Date.now() });

                    const { getPdfInfo } = await import('./lib/pdfProcessing');
                    const info = await getPdfInfo(newFile);

                    addDocuments([{
                      id: crypto.randomUUID(),
                      file: newFile,
                      name: newFile.name,
                      size: newFile.size,
                      lastModified: newFile.lastModified,
                      pageCount: info.pageCount,
                      operations: [],
                    }]);

                    pendingImages.forEach(img => URL.revokeObjectURL(img.previewUrl));
                    setPendingImages([]);
                    stopProcessing();
                  } catch (e: unknown) {
                    stopProcessing();
                    const message = e instanceof Error ? e.message : "An error occurred.";
                    setErrorState({ isOpen: true, title: "Image Conversion Failed", message });
                  }
                }}
                onCancel={() => {
                  pendingImages.forEach(img => URL.revokeObjectURL(img.previewUrl));
                  setPendingImages([]);
                }}
                fitMode={imageFitMode}
                setFitMode={setImageFitMode}
                isProcessing={isGlobalProcessing}
              />
            )}

            <div className="flex gap-4 items-center mt-4">

              <input
                type="file"
                ref={workspaceFileInputRef}
                onChange={handleWorkspaceFiles}
                accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,image/*"
                multiple
                className="hidden"
              />
              <button
                onClick={() => workspaceFileInputRef.current?.click()}
                disabled={isGlobalProcessing || documents.length >= 50}
                className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 bg-white text-gray-800 border border-gray-200 shadow-sm hover:bg-gray-50 focus-visible:ring-gray-300`}
                title="Add Files"
              >
                <Plus size={16} /> Add Files
              </button>
              <div className="relative" ref={batchMenuRef}>
                <button
                  onClick={() => setIsBatchMenuOpen(!isBatchMenuOpen)}
                  disabled={documents.length < 1 || isGlobalProcessing}
                  className={`text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50 transition-colors flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                    documents.length > 1 && !isGlobalProcessing
                      ? "bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-500 ring-2 ring-emerald-400 ring-offset-2 shadow-lg"
                      : "bg-indigo-600 hover:bg-indigo-700 focus-visible:ring-indigo-500"
                  }`}
                >
                  Workspace Actions
                  {documents.length > 1 && (
                    <span className="bg-white text-emerald-700 text-xs font-bold px-1.5 py-0.5 rounded-full ml-1">
                      {documents.length}
                    </span>
                  )}
                  <ChevronDown size={16} />
                </button>
                {isBatchMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">

                    <button
                      onClick={() => { setIsBatchMenuOpen(false); setIsCrossReorderOpen(true); }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                    >
                      Cross-Document Reorder
                    </button>
                    <button
                      onClick={handleBatchRename}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                    >
                      Rename All
                    </button>
                    <button
                      onClick={handleBatchWatermark}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                    >
                      Watermark All
                    </button>
                    <button
                      onClick={handleBatchResize}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                    >
                      Resize All
                    </button>
                    <button
                      onClick={handleBatchAddTitlePage}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                    >
                      Add Title Page to All
                    </button>
                    <button
                      onClick={handleBatchSanitize}

                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                    >
                      Sanitize All
                    </button>
                    <button
                      onClick={handleBatchExtractText}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                    >
                      Extract Notes (Combined)
                    </button>
                    <button
                      onClick={handleDownloadAll}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                    >
                      Download All (ZIP)
                    </button>
                    <div className="border-t border-gray-100 my-1"></div>
                    <button
                      onClick={() => { setIsBatchMenuOpen(false); clearAll(); }}
                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
                    >
                      Clear All
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={handleMerge}
                disabled={documents.length < 2 || isGlobalProcessing}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50 hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                {isGlobalProcessing ? "Processing..." : "Merge All"}
              </button>
            </div>
          </div>

          <div className="flex flex-col">
            <div className="flex justify-between items-center border-b border-gray-200">
              <div className="flex-1 overflow-hidden">
                <FileTabs />
              </div>
              <div className="px-2 border-l border-gray-200 h-full flex items-center bg-gray-50/50">
                <button onClick={() => setIsSearchModalOpen(true)} title="Index all documents for search" className="mr-2 px-3 py-1.5 text-sm font-medium bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg> Search
                </button>
                <button onClick={() => setIsSideBySideModalOpen(true)} className="mr-2 px-3 py-1.5 text-sm font-medium bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" /></svg> Side-by-Side
                </button>
              </div>
            </div>

            <div className="mt-4 flex justify-center">
              {(() => {
                const activeDoc = documents.find(
                  (doc) => doc.id === activeDocumentId,
                );
                if (!activeDoc) return null;
  return (
                  <div key={activeDoc.id} className="w-full max-w-2xl">
                    <DocumentCard
                      doc={activeDoc}
                      onRemove={removeDocument}
                      onSplit={handleSplitRequest}
                      onWatermark={handleWatermark}
                      onAddPageNumbers={handleAddPageNumbers}
                      onBatesNumbering={handleBatesNumbering}
                      onResizePages={handleResizePages}
                      onEncrypt={handleEncrypt}
                      onUnlock={handleUnlock}
                      onHighlight={handleHighlight}
                      onAudit={handleAudit}
                      onReadAloud={handleReadAloud}
                      onOcr={handleOcr}
                      onInteractiveRedact={handleInteractiveRedact}
                      onAutoRedactLayout={autoRedactLayout}
                      onInteractiveTable={handleInteractiveTable}
                      onInteractiveCopy={handleInteractiveCopy}
                      onInteractiveAutoLinker={handleInteractiveAutoLinker}
                      onSmartForm={handleSmartForm}
                      onSmartCrop={handleSmartCrop}
                      extractText={extractText}
                      extractEntities={extractEntities}
                      extractTables={extractTables}
                      extractMarkdown={extractMarkdown}
                      extractHtml={extractHtml}
                      extractImages={extractImages}
                      extractLinks={extractLinks}
                      extractAnnotations={extractAnnotations}
                      extractMetadata={extractMetadata}
                      editParagraph={editParagraph}
                      onViewMetadata={handleViewMetadata}
                      extractBookmarks={extractBookmarks}
                      editBookmarks={editBookmarks}
                      redactPdf={redactPdf}
                      updateDocumentFile={updateDocumentFile}
                      convertPdfToDocx={convertPdfToDocx}
                      exportPdfToDark={exportPdfToDark}
                    />
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {documents.length > 0 && (
        <footer className="mt-auto p-4 border-t border-gray-200 bg-white text-center">
          <button
            onClick={() => setIsAuditModalOpen(true)}
            className="text-sm text-gray-500 hover:text-gray-800 transition-colors focus-visible:outline-none focus-visible:underline"
          >
            View Privacy Audit Log
          </button>
        </footer>
      )}

      <SearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onIndexDocuments={handleIndexDocuments}
        onRunOcr={(doc) => {
          setIsSearchModalOpen(false);
          handleOcr(doc);
        }}
      />
    </div>
  );
}

export default App;
