import { useState, useEffect, useRef } from "react";
import { Dropzone } from "./components/ui/Dropzone";
import { useFileStore, type PDFDocument } from "./store/fileStore";
import { useEngineStore } from "./store/engineStore";
import { useProcessingStore } from "./store/processingStore";
import { useUIStore } from "./store/uiStore";
import { Sun, Moon } from "lucide-react";
import {
  mergePdfs,
  splitPdf,
  rotatePdf,
  watermarkPdf,
  optimizePdf,
  deletePages,
  reorderPages,
} from "./lib/engineA";
import { EngineStatusPill } from "./components/ui/EngineStatusPill";
import { getSmartOutputName } from "./lib/utils";
import { DocumentCard } from "./components/pdf/DocumentCard";
import { FileTabs } from "./components/ui/FileTabs";
import { ErrorModal } from "./components/ui/ErrorModal";
import { InputModal } from "./components/ui/InputModal";
import { ProcessingModal } from "./components/ui/ProcessingModal";
import type { NERWorkerMessage, NERWorkerResponse } from "./workers/nerWorker";
import type {
  PyodideWorkerMessage,
  PyodideWorkerResponse,
} from "./workers/pyodideWorker";

function App() {
  const documents = useFileStore((state) => state.documents);
  const activeDocumentId = useFileStore((state) => state.activeDocumentId);
  const { isDarkMode, toggleDarkMode } = useUIStore();
  const { setAiStatus, setPyodideStatus } = useEngineStore();
  const nerWorkerRef = useRef<Worker | null>(null);
  const pyodideWorkerRef = useRef<Worker | null>(null);
  const removeDocument = useFileStore((state) => state.removeDocument);
  const updateDocumentFile = useFileStore((state) => state.updateDocumentFile);
  const addDocuments = useFileStore((state) => state.addDocuments);

  const clearAll = useFileStore((state) => state.clearAll);
  const [errorState, setErrorState] = useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
  }>({ isOpen: false, title: "", message: "" });
  const [inputState, setInputState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    placeholder: string;
    defaultValue?: string;
    onConfirm: (val: string) => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    placeholder: "",
    onConfirm: () => {},
  });

  const {
    startProcessing,
    stopProcessing,
    isActive: isGlobalProcessing,
  } = useProcessingStore();

  // Promise resolvers mapping
  const nerResolvers = useRef<
    Map<string, { resolve: (val: any) => void; reject: (err: any) => void }>
  >(new Map());
  const pyodideResolvers = useRef<
    Map<string, { resolve: (val: any) => void; reject: (err: any) => void }>
  >(new Map());


  // Check for share payload on load
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#share=')) {
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

      loadSharedFile();
    }
  }, []);

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

      setErrorState({
        isOpen: true,
        title: "Sanitize Complete",
        message: `Sanitization complete.\n\n- Metadata stripped\n- Annotations removed\n- Fake redactions found: ${fakeRedactions}`,
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
    <div className="App font-sans bg-gray-50 min-h-screen">
      <ProcessingModal />
      <InputModal
        isOpen={inputState.isOpen}
        title={inputState.title}
        message={inputState.message}
        placeholder={inputState.placeholder}
        defaultValue={inputState.defaultValue}
        onConfirm={inputState.onConfirm}
        onCancel={() => setInputState((prev) => ({ ...prev, isOpen: false }))}
      />
      <ErrorModal
        isOpen={errorState.isOpen}
        title={errorState.title}
        message={errorState.message}
        onClose={() => setErrorState((prev) => ({ ...prev, isOpen: false }))}
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
            <FileTabs />

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
                      onSplit={handleSplitBurst}
                      onRotate={handleRotate}
                      onWatermark={handleWatermark}
                      onOptimize={handleOptimize}
                      onDeletePages={handleDeletePages}
                      onReorderPages={handleReorderPages}
                      onEncrypt={handleEncrypt}
                      onSanitize={handleSanitize}
                      onShare={handleShare}
                      extractText={extractText}
                      extractEntities={extractEntities}
                      redactPdf={redactPdf}
                      updateDocumentFile={updateDocumentFile}
                    />
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
