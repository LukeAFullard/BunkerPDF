import { useAuditStore } from "./store/auditStore";
import { PrivacyAuditLogModal } from "./components/ui/PrivacyAuditLogModal";
import { loadSession, saveSession, clearSession } from "./lib/sessionSync";
import { useState, useEffect, useRef } from "react";
import { Dropzone } from "./components/ui/Dropzone";
import { useFileStore, type PDFDocument } from "./store/fileStore";
import { PDFDocument as PDFLibDocument } from "pdf-lib";
import { useEngineStore } from "./store/engineStore";
import { useProcessingStore } from "./store/processingStore";
import { useUIStore } from "./store/uiStore";
import { SignatureModal } from "./components/ui/SignatureModal";
import { Sun, Moon } from "lucide-react";
import {
  mergePdfs,
  splitPdf,
  rotatePdf,
  watermarkPdf,
  optimizePdf,
  deletePages,
  reorderPages, addPageNumbers, addBatesNumbers, resizePages,
  flattenForms,
  crossDocumentReorderPages,
} from "./lib/engineA";
import { EngineStatusPill } from "./components/ui/EngineStatusPill";
import { CrossDocumentReorder } from "./components/pdf/reorder/CrossDocumentReorder";
import { getSmartOutputName } from "./lib/utils";
import { ocrPdf } from "./lib/ocrEngine";
import { AudioPlayerModal } from "./components/ui/AudioPlayerModal";
import { generateSpeech } from "./lib/ttsEngine";
import { createWavFile } from "./lib/audioUtils";
import { DocumentCard } from "./components/pdf/DocumentCard";
import { FileTabs } from "./components/ui/FileTabs";
import { RecipeMenu } from "./components/ui/RecipeMenu";
import type { WorkflowRecipe } from "./store/recipeStore";
import { ErrorModal } from "./components/ui/ErrorModal";
import { InputModal } from "./components/ui/InputModal";
import { ProcessingModal } from "./components/ui/ProcessingModal";
import { FeedbackPrompt } from "./components/ui/FeedbackPrompt";
import { PWAInstallPrompt } from "./components/ui/PWAInstallPrompt";
import type { NERWorkerMessage, NERWorkerResponse } from "./workers/nerWorker";
import type {
  PyodideWorkerMessage,
  PyodideWorkerResponse,
} from "./workers/pyodideWorker";

function App() {
  const documents = useFileStore((state) => state.documents);
  const activeDocumentId = useFileStore((state) => state.activeDocumentId);
  const { isDarkMode, toggleDarkMode } = useUIStore();
  const addLog = useAuditStore(state => state.addLog);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
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

  const handleApplyRecipe = async (recipe: WorkflowRecipe) => {
    const activeDoc = documents.find((doc) => doc.id === activeDocumentId);
    if (!activeDoc) return;

    // Use current state to fetch the active doc safely for sequential steps
    let currentDoc = activeDoc;
    let isCancelled = false;

    startProcessing(`Running recipe: ${recipe.name}`, true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {
      for (const step of recipe.steps) {
        if (isCancelled) break;
        useProcessingStore.getState().updateStage(`Executing: ${step}`);

        const docFromState = useFileStore.getState().documents.find(d => d.id === currentDoc.id);
        if (!docFromState) throw new Error("Document lost during processing");
        currentDoc = docFromState;

        // Perform the step
        if (step === 'optimize') {
          const optimizedBytes = await optimizePdf(currentDoc.file);
          if (isCancelled) break;
          const standardBuffer = new Uint8Array(optimizedBytes.length);
          standardBuffer.set(optimizedBytes);
          const newFile = new File([standardBuffer], currentDoc.name, { type: "application/pdf" });
          useFileStore.getState().updateDocumentFile(currentDoc.id, newFile);
          addLog("Recipe", `Applied Optimize`, currentDoc.name);
        } else if (step === 'flatten') {
          const flattenedBytes = await flattenForms(currentDoc.file);
          if (isCancelled) break;
          const standardBuffer = new Uint8Array(flattenedBytes.length);
          standardBuffer.set(flattenedBytes);
          const newFile = new File([standardBuffer], currentDoc.name, { type: "application/pdf" });
          useFileStore.getState().updateDocumentFile(currentDoc.id, newFile);
          addLog("Recipe", `Applied Flatten`, currentDoc.name);
        } else if (step === 'sanitize') {
          const arrayBuffer = await currentDoc.file.arrayBuffer();
          const { bytes } = await sanitizePdf(new Uint8Array(arrayBuffer));
          if (isCancelled) break;
          const standardBuffer = new Uint8Array(bytes.length);
          standardBuffer.set(bytes);
          const newFile = new File([standardBuffer], currentDoc.name, { type: "application/pdf" });
          useFileStore.getState().updateDocumentFile(currentDoc.id, newFile);
          addLog("Recipe", `Applied Sanitize`, currentDoc.name);
        } else if (step === 'ocr') {
          const abortController = new AbortController();
          const newFile = await ocrPdf(currentDoc.file, (stage) => {
             if (!isCancelled) useProcessingStore.getState().updateStage(`OCR: ${stage}`);
          }, abortController.signal);
          if (isCancelled) {
             abortController.abort();
             break;
          }
          useFileStore.getState().updateDocumentFile(currentDoc.id, newFile);
          addLog("Recipe", `Applied OCR`, currentDoc.name);
        } else if (step === 'redact') {
          useProcessingStore.getState().updateStage(`Redacting (Auto PII)...`);
          const arrayBuffer = await currentDoc.file.arrayBuffer();
          const pdfBytes = new Uint8Array(arrayBuffer);

          if (!extractText || !extractEntities || !redactPdf) {
             throw new Error("Missing functions for auto redaction");
          }

          const text = await extractText(pdfBytes);
          if (isCancelled) break;
          const entities = await extractEntities(text);
          if (isCancelled) break;

          if (entities && entities.length > 0) {
             const redactedBytes = await redactPdf(pdfBytes, entities);
             if (isCancelled) break;
             const standardBuffer = new Uint8Array(redactedBytes.length);
             standardBuffer.set(redactedBytes);
             const newFile = new File([standardBuffer], currentDoc.name, { type: "application/pdf" });
             useFileStore.getState().updateDocumentFile(currentDoc.id, newFile);
             addLog("Recipe", `Auto Redacted ${entities.length} PII items`, currentDoc.name);
          } else {
             addLog("Recipe", `No PII found for redaction`, currentDoc.name);
          }
        } else if (step === 'extract-tables') {
           if (extractTables) {
             const excelBytes = await extractTables(currentDoc.file);
             if (isCancelled) break;
             const standardBuffer = new Uint8Array(excelBytes.length);
             standardBuffer.set(excelBytes);
             const blob = new Blob([standardBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
             const url = URL.createObjectURL(blob);
             const a = document.createElement("a");
             a.href = url;
             a.download = currentDoc.name.replace(/\.pdf$/i, "-tables.xlsx");
             document.body.appendChild(a);
             a.click();
             document.body.removeChild(a);
             URL.revokeObjectURL(url);
             addLog("Recipe", `Extracted Tables`, currentDoc.name);
           }
        } else if (step === 'extract-images') {
           if (extractImages) {
             const pdfBytes = await currentDoc.file.arrayBuffer();
             const result = await extractImages(new Uint8Array(pdfBytes));
             if (isCancelled) break;
             const standardBuffer = new Uint8Array(result.length);
             standardBuffer.set(result);
             const blob = new Blob([standardBuffer], { type: "application/zip" });
             if (blob.size > 22) {
               const url = URL.createObjectURL(blob);
               const a = document.createElement("a");
               a.href = url;
               a.download = currentDoc.name.replace(/\.pdf$/i, "-images.zip");
               document.body.appendChild(a);
               a.click();
               document.body.removeChild(a);
               URL.revokeObjectURL(url);
             }
             addLog("Recipe", `Extracted Images`, currentDoc.name);
           }
        } else if (step === 'extract-text') {
           if (extractText) {
             const buffer = await currentDoc.file.arrayBuffer();
             const text = await extractText(new Uint8Array(buffer));
             if (isCancelled) break;
             const blob = new Blob([text], { type: "text/plain" });
             const url = URL.createObjectURL(blob);
             const a = document.createElement("a");
             a.href = url;
             a.download = currentDoc.name.replace(/\.pdf$/i, "-text.txt");
             document.body.appendChild(a);
             a.click();
             document.body.removeChild(a);
             URL.revokeObjectURL(url);
             addLog("Recipe", `Extracted Text`, currentDoc.name);
           }
        } else {
          // Other steps need UI interaction usually (like manual Redact bounding boxes or Merge files)
          // We can skip or show a notice
          console.warn(`Step ${step} requires manual UI interaction or is not supported in recipes yet.`);
        }
      }

      if (!isCancelled) {
        setErrorState({
          isOpen: true,
          title: "Recipe Complete",
          message: `Successfully executed ${recipe.name}.`
        });
      }
    } catch (err: unknown) {
      if (!isCancelled) {
        console.error("Recipe error:", err);
        setErrorState({
          isOpen: true,
          title: "Recipe Error",
          message: err instanceof Error ? err.message : "Failed to execute recipe."
        });
      }
    } finally {
      if (!isCancelled) stopProcessing();
    }
  };

  const clearAll = useFileStore((state) => state.clearAll);
  const [errorState, setErrorState] = useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
  }>({ isOpen: false, title: "", message: "" });

  const [audioPlayerState, setAudioPlayerState] = useState<{
    isOpen: boolean;
    audioUrl: string | null;
    title: string;
  }>({ isOpen: false, audioUrl: null, title: "Read Aloud" });
  const [signatureModalState, setSignatureModalState] = useState<{
    isOpen: boolean;
    activeDocId: string | null;
  }>({ isOpen: false, activeDocId: null });
  const [inputState, setInputState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    placeholder: string;
    defaultValue?: string;
    onConfirm: (val: string) => void;
    onCancel?: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    placeholder: "",
    onConfirm: () => {},
  });

  const [isCrossReorderOpen, setIsCrossReorderOpen] = useState(false);

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
    } else if (hash.startsWith('#share=')) {
      const base64 = hash.replace('#share=', '');
      window.location.hash = ''; // Clear it out so it doesn't stay in URL

      const loadSharedFile = async () => {
        try {
          const { base64ToArrayBuffer } = await import('./lib/shareUtils');
          const buffer = base64ToArrayBuffer(base64);
          const file = new File([buffer], "shared_document.pdf", { type: 'application/pdf' });

          let pageCount;
          let isEncrypted = false;
          let isCorrupt = false;

          try {
            const { getPdfInfo } = await import('./lib/pdfProcessing');
            const info = await getPdfInfo(file);
            pageCount = info.pageCount;
            isEncrypted = info.isEncrypted;
          } catch (e: unknown) {
            console.error(`Failed to parse shared PDF info`, e);
            if (e instanceof Error && e.message === 'CORRUPT_PDF') {
              isCorrupt = true;
            }
          }

          if (isCorrupt) {
            setErrorState({
              isOpen: true,
              title: 'Corrupt Shared PDF',
              message: `The shared file appears to be corrupted or invalid.`
            });
            return;
          }

          if (isEncrypted) {
            setErrorState({
              isOpen: true,
              title: 'Password-Protected PDF',
              message: `The shared file is password-protected.`
            });
          }

          useFileStore.getState().addDocuments([{
            id: crypto.randomUUID(),
            file,
            name: file.name,
            size: file.size,
            lastModified: file.lastModified,
            pageCount,
            isEncrypted,
            isCorrupt
          }]);

        } catch (e) {
          console.error("Failed to load shared file", e);
          setErrorState({
            isOpen: true,
            title: "Share Load Error",
            message: "Failed to load the shared document. The link might be invalid or corrupted.",
          });
        }
      };

      loadSharedFile().finally(() => {
        isInitialized.current = true;
      });
    } else {
      // Session Sync
      const restoreSession = async () => {
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
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const { type, jobId, result, error, stage } = e.data;
      if (type === "PROGRESS") {
        console.log("Pyodide Worker Progress:", stage);
        if (stage) setPyodideStatus("loading", null, stage);
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

  const extractTables = async (docFile: File): Promise<Uint8Array> => {
    const CHUNK_SIZE = 20; // Number of pages per chunk to prevent WASM OOM
    const arrayBuffer = await docFile.arrayBuffer();
    const pdfDoc = await PDFLibDocument.load(arrayBuffer);
    const totalPages = pdfDoc.getPageCount();

    const allTables: unknown[] = [];

    for (let startPage = 0; startPage < totalPages; startPage += CHUNK_SIZE) {
      const endPage = Math.min(startPage + CHUNK_SIZE, totalPages);

      useProcessingStore.getState().updateStage(`Extracting tables: pages ${startPage + 1}-${endPage}...`);

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

    return new Promise((resolve, reject) => {
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

  const extractHtml = (bytes: Uint8Array): Promise<string> => {
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

  const highlightPdf = (
    bytes: Uint8Array,
    highlights: string[],
  ): Promise<Uint8Array> => {
    return new Promise((resolve, reject) => {
      if (!pyodideWorkerRef.current)
        return reject(new Error("Pyodide worker not ready"));
      const jobId = crypto.randomUUID();
      pyodideResolvers.current.set(jobId, { resolve, reject });
      pyodideWorkerRef.current.postMessage({
        type: "HIGHLIGHT_DOCUMENT",
        jobId,
        pdfBytes: bytes,
        highlights,
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

  const redactPdf = (
    bytes: Uint8Array,
    redactions: string[],
  ): Promise<Uint8Array> => {
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

  const extractEntities = (text: string): Promise<string[]> => {
    return new Promise((resolve, reject) => {
      if (!nerWorkerRef.current)
        return reject(new Error("NER worker not ready"));
      const jobId = crypto.randomUUID();
      nerResolvers.current.set(jobId, { resolve, reject });
      nerWorkerRef.current.postMessage({
        type: "EXTRACT",
        jobId,
        text,
      } satisfies NERWorkerMessage);
    });
  };

  const handleCrossReorderApply = async (newStructures: Record<string, { docId: string; originalPageNumber: number }[]>) => {
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

      // Update documents
      for (const [docId, bytes] of Object.entries(newDocsBytes)) {
        const standardBuffer = new Uint8Array(bytes.length);
        standardBuffer.set(bytes);
        const doc = documents.find(d => d.id === docId);
        if (doc) {
          const newFile = new File([standardBuffer], doc.name, { type: "application/pdf" });
          updateDocumentFile(docId, newFile, newStructures[docId].length);
        }
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

  const handleSplitBurst = async (doc: PDFDocument) => {
    let isCancelled = false;
    startProcessing("Splitting PDF pages...", true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {
      const splitBytesArray = await splitPdf(doc.file);
      if (isCancelled) return;

      // Add split documents to workspace instead of downloading
      const newDocs = splitBytesArray.map((bytes, index) => {
        const standardBuffer = new Uint8Array(bytes.length);
        standardBuffer.set(bytes);
        const newFile = new File(
          [standardBuffer],
          getSmartOutputName(doc.name, `split-page-${index + 1}`),
          { type: "application/pdf" },
        );
        return {
          id: crypto.randomUUID(),
          file: newFile,
          name: newFile.name,
          size: newFile.size,
          lastModified: Date.now(),
          pageCount: 1, // Split creates 1-page documents
        };
      });
      addDocuments(newDocs);
      addLog("Split", `Split document into ${newDocs.length} pages.`, doc.name);
    } catch (e) {
      if (isCancelled) return;
      console.error(e);
      setErrorState({
        isOpen: true,
        title: "Split Error",
        message: "An error occurred while splitting the PDF.",
      });
    } finally {
      if (!isCancelled) stopProcessing();
    }
  };

  const handleRotate = async (doc: PDFDocument) => {
    let isCancelled = false;
    startProcessing("Rotating PDF...", true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {
      const rotatedBytes = await rotatePdf(doc.file, 90);
      if (isCancelled) return;

      const standardBuffer = new Uint8Array(rotatedBytes.length);
      standardBuffer.set(rotatedBytes);
      const newFile = new File([standardBuffer], doc.name, {
        type: "application/pdf",
      });
      updateDocumentFile(doc.id, newFile);
      addLog("Rotate", "Rotated document by 90 degrees.", doc.name);
    } catch (e) {
      if (isCancelled) return;
      console.error(e);
      setErrorState({
        isOpen: true,
        title: "Rotate Error",
        message: "An error occurred while rotating the PDF.",
      });
    } finally {
      if (!isCancelled) stopProcessing();
    }
  };

  const handleWatermark = (doc: PDFDocument) => {
    setInputState({
      isOpen: true,
      title: "Add Watermark",
      message: "Enter the text you want to use as a watermark:",
      placeholder: "e.g. CONFIDENTIAL",
      onConfirm: async (text) => {
        setInputState((prev) => ({ ...prev, isOpen: false }));
        if (!text) return;

        let isCancelled = false;
        startProcessing("Adding watermark...", true, () => {
          isCancelled = true;
          stopProcessing();
        });

        try {
          const watermarkedBytes = await watermarkPdf(doc.file, text);
          if (isCancelled) return;

          const standardBuffer = new Uint8Array(watermarkedBytes.length);
          standardBuffer.set(watermarkedBytes);
          const newFile = new File([standardBuffer], doc.name, {
            type: "application/pdf",
          });
          updateDocumentFile(doc.id, newFile);
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
      },
    });
  };

  const handleOptimize = async (doc: PDFDocument) => {
    let isCancelled = false;
    startProcessing("Optimizing PDF...", true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {
      const optimizedBytes = await optimizePdf(doc.file);
      if (isCancelled) return;

      const standardBuffer = new Uint8Array(optimizedBytes.length);
      standardBuffer.set(optimizedBytes);
      const newFile = new File([standardBuffer], doc.name, {
        type: "application/pdf",
      });
      updateDocumentFile(doc.id, newFile);
      addLog("Optimize", "Compressed and optimized document.", doc.name);
    } catch (e) {
      if (isCancelled) return;
      console.error(e);
      setErrorState({
        isOpen: true,
        title: "Optimize Error",
        message: "An error occurred while optimizing the PDF.",
      });
    } finally {
      if (!isCancelled) stopProcessing();
    }
  };

  const handleDeletePages = (doc: PDFDocument) => {
    setInputState({
      isOpen: true,
      title: "Delete Pages",
      message:
        "Enter the page numbers to delete (comma separated, e.g. 1, 3, 5):",
      placeholder: "1, 3, 5",
      onConfirm: async (text) => {
        setInputState((prev) => ({ ...prev, isOpen: false }));
        if (!text) return;

        const indices = text
          .split(",")
          .map((n) => parseInt(n.trim(), 10) - 1)
          .filter((n) => !isNaN(n));
        if (indices.length === 0) return;

        let isCancelled = false;
        startProcessing("Deleting pages...", true, () => {
          isCancelled = true;
          stopProcessing();
        });

        try {
          const deletedBytes = await deletePages(doc.file, indices);
          if (isCancelled) return;

          const standardBuffer = new Uint8Array(deletedBytes.length);
          standardBuffer.set(deletedBytes);
          const newFile = new File([standardBuffer], doc.name, {
            type: "application/pdf",
          });
          const newPageCount = (doc.pageCount || 0) - indices.length;
          updateDocumentFile(
            doc.id,
            newFile,
            newPageCount > 0 ? newPageCount : undefined,
          );
          addLog("Delete Pages", `Deleted pages: ${text}`, doc.name);
        } catch (e) {
          if (isCancelled) return;
          console.error(e);
          setErrorState({
            isOpen: true,
            title: "Delete Error",
            message: "An error occurred while deleting pages.",
          });
        } finally {
          if (!isCancelled) stopProcessing();
        }
      },
    });
  };


  const handleShare = async (doc: PDFDocument) => {
    try {
      const buffer = await doc.file.arrayBuffer();
      // Import dynamically or ensure arrayBufferToBase64 is imported at top
      const { arrayBufferToBase64 } = await import('./lib/shareUtils');
      const base64 = await arrayBufferToBase64(buffer);

      const baseUrl = window.location.href.split('#')[0];
      const shareUrl = `${baseUrl}#share=${base64}`;

      if (shareUrl.length > 64 * 1024) {
        setErrorState({
          isOpen: true,
          title: "Share Error",
          message: "This file is too large to share via URL (limit is ~64KB).",
        });
        return;
      }

      await navigator.clipboard.writeText(shareUrl);

      setErrorState({
        isOpen: true,
        title: "Share Link Copied",
        message: "A shareable link has been copied to your clipboard. Note that the entire file is encoded in the URL.",
      });
    } catch (e) {
      console.error(e);
      setErrorState({
        isOpen: true,
        title: "Share Error",
        message: "Failed to generate shareable link.",
      });
    }
  };


  const handleFlatten = async (doc: PDFDocument) => {
    let isCancelled = false;
    startProcessing("Flattening forms...", true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {
      const flattenedBytes = await flattenForms(doc.file);
      if (isCancelled) return;

      const standardBuffer = new Uint8Array(flattenedBytes.length);
      standardBuffer.set(flattenedBytes);
      const newFile = new File([standardBuffer], doc.name, {
        type: "application/pdf",
      });
      updateDocumentFile(doc.id, newFile);
      addLog("Flatten Forms", "Flattened interactive form fields.", doc.name);

      setErrorState({
        isOpen: true,
        title: "Forms Flattened",
        message: "Interactive form fields have been flattened and burned into the document.",
      });
    } catch (e) {
      if (isCancelled) return;
      console.error(e);
      setErrorState({
        isOpen: true,
        title: "Flatten Error",
        message: "An error occurred while flattening the forms.",
      });
    } finally {
      if (!isCancelled) {
        stopProcessing();
      }
    }
  };

  const handleSanitize = async (doc: PDFDocument) => {

    let isCancelled = false;
    startProcessing("Sanitizing PDF...", true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {
      const arrayBuffer = await doc.file.arrayBuffer();
      const pdfBytes = new Uint8Array(arrayBuffer);

      const { fakeRedactions, bytes } = await sanitizePdf(pdfBytes);
      if (isCancelled) return;

      const standardBuffer = new Uint8Array(bytes.length);
      standardBuffer.set(bytes);
      const newFile = new File([standardBuffer], doc.name, {
        type: "application/pdf",
      });
      updateDocumentFile(doc.id, newFile);
      addLog("Sanitize", "Sanitized document by removing metadata and scripts.", doc.name);

      setErrorState({
        isOpen: true,
        title: "Sanitize Complete",
        message: (
          <ul className="list-disc pl-5 text-sm text-gray-700">
            <li>Metadata stripped (author, history)</li>
            <li>Annotations and interactive elements flattened</li>
            <li>Hidden text/scripts removed</li>
            <li>Fake redactions verified: {fakeRedactions} found</li>
          </ul>
        ),
      });
    } catch (e) {
      if (isCancelled) return;
      console.error(e);
      setErrorState({
        isOpen: true,
        title: "Sanitize Error",
        message: "An error occurred while sanitizing the PDF.",
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
    startProcessing("Generating audio...", true, () => {
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

      useProcessingStore.getState().updateStage("Synthesizing speech (this may take a while)...");

      const { audio, samplingRate } = await generateSpeech(text, (progress) => {
        if (!isCancelled) useProcessingStore.getState().updateStage(`Synthesizing speech (${progress}%)...`);
      });
      if (isCancelled) return;

      const wavFile = createWavFile(audio, samplingRate);
      const audioUrl = URL.createObjectURL(wavFile);

      setAudioPlayerState({
        isOpen: true,
        audioUrl,
        title: `Read Aloud: ${doc.name}`,
      });
      addLog("Read Aloud", "Generated audio playback for document text.", doc.name);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      if (isCancelled) return;
      console.error(e);
      setErrorState({
        isOpen: true,
        title: "Read Aloud Error",
        message: "Failed to generate speech. " + (e.message || ""),
      });
    } finally {
      if (!isCancelled) stopProcessing();
    }
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
          updateDocumentFile(doc.id, newFile);
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

  const handleSign = (doc: PDFDocument) => {
    setSignatureModalState({ isOpen: true, activeDocId: doc.id });
  };

  const onSignatureConfirm = async (signatureImageBytes: Uint8Array) => {
    const { activeDocId } = signatureModalState;
    setSignatureModalState({ isOpen: false, activeDocId: null });
    if (!activeDocId) return;

    const doc = documents.find((d) => d.id === activeDocId);
    if (!doc) return;

    let isCancelled = false;
    startProcessing("Signing document...", true, () => {
      isCancelled = true;
      stopProcessing();
    });

    try {
      const { signPdf } = await import("./lib/engineA");
      const signedBytes = await signPdf(doc.file, signatureImageBytes);
      if (isCancelled) return;

      const standardBuffer = new Uint8Array(signedBytes.length);
      standardBuffer.set(signedBytes);
      const newFile = new File([standardBuffer], doc.name, {
        type: "application/pdf",
      });
      updateDocumentFile(doc.id, newFile);
      addLog("Sign", "Added signature to document.", doc.name);
    } catch (e) {
      if (isCancelled) return;
      console.error(e);
      setErrorState({
        isOpen: true,
        title: "Signature Error",
        message: "An error occurred while signing the PDF.",
      });
    } finally {
      if (!isCancelled) stopProcessing();
    }
  };

  const handleHighlight = (doc: PDFDocument) => {
    setInputState({
      isOpen: true,
      title: "Highlight Text",
      message: "Enter the text you want to highlight:",
      placeholder: "e.g. Important Clause",
      onConfirm: async (text) => {
        setInputState((prev) => ({ ...prev, isOpen: false }));
        if (!text) return;

        let isCancelled = false;
        startProcessing("Highlighting text...", true, () => {
          isCancelled = true;
          stopProcessing();
        });

        try {
          const arrayBuffer = await doc.file.arrayBuffer();
          const pdfBytes = new Uint8Array(arrayBuffer);
          const highlightedBytes = await highlightPdf(pdfBytes, [text]);
          if (isCancelled) return;

          const standardBuffer = new Uint8Array(highlightedBytes.length);
          standardBuffer.set(highlightedBytes);
          const newFile = new File([standardBuffer], doc.name, {
            type: "application/pdf",
          });
          updateDocumentFile(doc.id, newFile);
          addLog("Highlight", `Highlighted text: "${text}"`, doc.name);
        } catch (e) {
          if (isCancelled) return;
          console.error(e);
          setErrorState({
            isOpen: true,
            title: "Highlight Error",
            message: "An error occurred while highlighting text.",
          });
        } finally {
          if (!isCancelled) stopProcessing();
        }
      },
    });
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
          updateDocumentFile(doc.id, newFile);
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
      message: "Enter target size (A4 or Letter):",
      placeholder: "A4",
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
          updateDocumentFile(doc.id, newFile);
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

  const handleReorderPages = (doc: PDFDocument) => {
    setInputState({
      isOpen: true,
      title: "Reorder Pages",
      message: `Enter the new order of pages (comma separated, e.g. 3, 1, 2) [Total Pages: ${doc.pageCount}]:`,
      placeholder: "3, 1, 2",
      onConfirm: async (text) => {
        setInputState((prev) => ({ ...prev, isOpen: false }));
        if (!text) return;

        const indices = text
          .split(",")
          .map((n) => parseInt(n.trim(), 10) - 1)
          .filter((n) => !isNaN(n));
        if (indices.length === 0) return;

        let isCancelled = false;
        startProcessing("Reordering pages...", true, () => {
          isCancelled = true;
          stopProcessing();
        });

        try {
          const reorderedBytes = await reorderPages(doc.file, indices);
          if (isCancelled) return;

          const standardBuffer = new Uint8Array(reorderedBytes.length);
          standardBuffer.set(reorderedBytes);
          const newFile = new File([standardBuffer], doc.name, {
            type: "application/pdf",
          });
          updateDocumentFile(doc.id, newFile);
          addLog("Reorder Pages", `Reordered pages to: ${text}`, doc.name);
        } catch (e) {
          if (isCancelled) return;
          console.error(e);
          setErrorState({
            isOpen: true,
            title: "Reorder Error",
            message: "An error occurred while reordering pages.",
          });
        } finally {
          if (!isCancelled) stopProcessing();
        }
      },
    });
  };

  return (
    <div className="App font-sans bg-gray-50 min-h-screen flex flex-col">
      <PrivacyAuditLogModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
      />
      <ProcessingModal />
      <FeedbackPrompt />
      <PWAInstallPrompt />
      <SignatureModal
        isOpen={signatureModalState.isOpen}
        onClose={() => setSignatureModalState({ isOpen: false, activeDocId: null })}
        onConfirm={onSignatureConfirm}
      />
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
      <ErrorModal
        isOpen={errorState.isOpen}
        title={errorState.title}
        message={errorState.message}
        onClose={() => setErrorState((prev) => ({ ...prev, isOpen: false }))}
      />
      <AudioPlayerModal
        isOpen={audioPlayerState.isOpen}
        audioUrl={audioPlayerState.audioUrl}
        title={audioPlayerState.title}
        onClose={() => {
          setAudioPlayerState((prev) => ({ ...prev, isOpen: false }));
          if (audioPlayerState.audioUrl) {
            URL.revokeObjectURL(audioPlayerState.audioUrl);
          }
        }}
      />
      <CrossDocumentReorder
        isOpen={isCrossReorderOpen}
        onClose={() => setIsCrossReorderOpen(false)}
        onApply={handleCrossReorderApply}
      />
      {documents.length === 0 ? (
        <div className="flex flex-col h-screen">
          <header className="p-4 flex justify-between items-center bg-white border-b border-gray-200">
            <div className="font-bold text-xl text-gray-800 tracking-tight">
              BunkerPDF
            </div>
            <EngineStatusPill />
          </header>
          <div className="flex-1">
            <Dropzone
              onError={(title, message) =>
                setErrorState({ isOpen: true, title, message })
              }
              onDocxDropped={handleDocxDropped}
            />
          </div>
        </div>
      ) : (
        <div className="p-8 max-w-6xl mx-auto flex flex-col gap-8">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <h1 className="text-3xl font-bold">Workspace</h1>
              <EngineStatusPill />
            </div>
            <div className="flex gap-4 items-center">
              <button
                onClick={toggleDarkMode}
                className="p-2 rounded-lg text-gray-600 hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                title="Toggle Dark Mode"
              >
                {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <button
                onClick={() => setIsCrossReorderOpen(true)}
                disabled={documents.length < 1 || isGlobalProcessing}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50 hover:bg-purple-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
              >
                Cross-Document Reorder
              </button>
              <button
                onClick={handleMerge}
                disabled={documents.length < 2 || isGlobalProcessing}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50 hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                {isGlobalProcessing ? "Processing..." : "Merge All"}
              </button>
              <button
                onClick={clearAll}
                className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium hover:bg-gray-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2"
              >
                Clear All
              </button>
            </div>
          </div>

          <div className="flex flex-col">
            <div className="flex justify-between items-center border-b border-gray-200">
              <div className="flex-1 overflow-hidden">
                <FileTabs />
              </div>
              <div className="px-2 border-l border-gray-200 h-full flex items-center bg-gray-50/50">
                <RecipeMenu onApplyRecipe={handleApplyRecipe} />
              </div>
            </div>

            <div className="mt-4 flex justify-center">
              {(() => {
                const activeDoc = documents.find(
                  (doc) => doc.id === activeDocumentId,
                );
                if (!activeDoc) return null;
                const handleOcr = async (doc: PDFDocument) => {
  let isCancelled = false;
  const abortController = new AbortController();
  startProcessing("Starting OCR...", true, () => {
    isCancelled = true;
    abortController.abort();
    stopProcessing();
  });

  try {
    const newFile = await ocrPdf(doc.file, (stage) => {
      if (!isCancelled) useProcessingStore.getState().updateStage(stage);
    }, abortController.signal);

    if (isCancelled) return;

    updateDocumentFile(doc.id, newFile);
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
};
  return (
                  <div key={activeDoc.id} className="w-full max-w-2xl">
                    <DocumentCard
                      doc={activeDoc}
                      onRemove={removeDocument}
                      onSplit={handleSplitBurst}
                      onRotate={handleRotate}
                      onWatermark={handleWatermark}
                      onOptimize={handleOptimize}
                      onDeletePages={handleDeletePages}
                      onReorderPages={handleReorderPages}
                      onAddPageNumbers={handleAddPageNumbers}
                      onBatesNumbering={handleBatesNumbering}
                      onResizePages={handleResizePages}
                      onEncrypt={handleEncrypt}
                      onSanitize={handleSanitize}
                      onFlatten={handleFlatten}
                      onShare={handleShare}
                      onHighlight={handleHighlight}
                      onSign={handleSign}
                      onAudit={handleAudit}
                      onReadAloud={handleReadAloud}
                      onOcr={handleOcr}
                      extractText={extractText}
                      extractEntities={extractEntities}
                      extractTables={extractTables}
                      extractMarkdown={extractMarkdown}
                      extractHtml={extractHtml}
                      extractImages={extractImages}
                      extractLinks={extractLinks}
                      extractBookmarks={extractBookmarks}
                      editBookmarks={editBookmarks}
                      redactPdf={redactPdf}
                      updateDocumentFile={updateDocumentFile}
                      convertPdfToDocx={convertPdfToDocx}
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
    </div>
  );
}

export default App;
