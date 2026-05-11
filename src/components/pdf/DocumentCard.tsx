import { useUIStore } from "../../store/uiStore";
import { useState } from "react";
import { PDFThumbnail } from "./PDFThumbnail";
import { useMobile } from "../../lib/useMobile";
import { type PDFDocument, useFileStore } from "../../store/fileStore";
import { useEffect } from "react";
import { getSmartOutputName } from "../../lib/utils";
import { ErrorModal } from "../ui/ErrorModal";
import { useProcessingStore } from "../../store/processingStore";
import { ContextMenu } from "../ui/ContextMenu";
import { decodeBarcodesFromPdf } from "../../lib/barcodeDecoder";

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
  onEncrypt?: (doc: PDFDocument) => void;
  onSanitize?: (doc: PDFDocument) => void;
  onFlatten?: (doc: PDFDocument) => void;
  onShare?: (doc: PDFDocument) => void;
  onHighlight?: (doc: PDFDocument) => void;
  onSign?: (doc: PDFDocument) => void;
  onAudit?: (doc: PDFDocument) => void;
  onReadAloud?: (doc: PDFDocument) => void;
  extractText: (bytes: Uint8Array) => Promise<string>;
  extractEntities: (text: string) => Promise<string[]>;
  redactPdf: (bytes: Uint8Array, redactions: string[]) => Promise<Uint8Array>;
  updateDocumentFile: (
    id: string,
    newFile: File,
    newPageCount?: number,
  ) => void;
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
  onEncrypt,
  onSanitize,
  onFlatten,
  onShare,
  onHighlight,
  onSign,
  onAudit,
  onReadAloud,
  extractText,
  extractEntities,
  redactPdf,
  updateDocumentFile,
}: DocumentCardProps) {
  const isMobile = useMobile();
  const { complexityMode, setComplexityMode } = useUIStore();
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

  const handleScan = async () => {
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
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col hover:shadow-md transition-shadow relative">
      {contextMenuState && (
        <ContextMenu
          x={contextMenuState.x}
          y={contextMenuState.y}
          onClose={() => setContextMenuState(null)}
items={[
            { label: "Extract / Split (~Instant)", onClick: () => onSplit(doc) },
            { label: "Rotate 90° (~Instant)", onClick: () => onRotate?.(doc) },
            { label: "Add Watermark (~1s)", onClick: () => onWatermark?.(doc) },
            { label: "Highlight Text (~2s)", onClick: () => onHighlight?.(doc) },
            { label: "Sign Document (~2s)", onClick: () => onSign?.(doc) },
            { label: "Optimize (Compress) (~5s)", onClick: () => onOptimize?.(doc) },
            { label: "Delete Pages (~1s)", onClick: () => onDeletePages?.(doc) },
            { label: "Reorder Pages (~1s)", onClick: () => onReorderPages?.(doc) },
            (!isMobile ? { label: "Protect (Password) (~2s)", onClick: () => onEncrypt?.(doc) } : null),
            (!isMobile ? { label: "Sanitize & Send (~Instant)", onClick: () => onSanitize?.(doc) } : null),
            { label: "Flatten Forms (~1s)", onClick: () => onFlatten?.(doc) },
            (!isMobile ? { label: "Audit Redactions (~5s)", onClick: () => onAudit?.(doc) } : null),
            (!isMobile ? { label: "Read Aloud (TTS) (~15s/pg)", onClick: () => onReadAloud?.(doc) } : null),
            { label: "Share (URL)", onClick: () => onShare?.(doc) },
            {
              label: "Remove File",
              variant: "danger",
              onClick: () => onRemove(doc.id),
            },
          ].filter(Boolean) as any} // eslint-disable-line @typescript-eslint/no-explicit-any
        />
      )}
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
          <div className="text-gray-500 text-sm mt-1">
            <p>Size: {(doc.size / 1024 / 1024).toFixed(2)} MB</p>
            <p>
              Pages:{" "}
              {doc.pageCount !== undefined ? doc.pageCount : "Loading..."}
            </p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-2">
          <button
            onClick={() => onSplit(doc)}
            disabled={isProcessing}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-1"
            title="Split document into individual pages (Est: Instant)"
          >
            Split
          </button>
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
            className="text-green-600 hover:text-green-800 text-sm font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 rounded px-1"
          >
            Download
          </button>
          {!isMobile && (
            <>
              <button
                onClick={handleScan}
                disabled={isProcessing}
                className="text-purple-600 hover:text-purple-800 text-sm font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 rounded px-1"
                title="Scan for Personally Identifiable Information (Est: ~10s)"
              >
                Scan PII
              </button>
              <button
                onClick={handleScanCodes}
                disabled={isProcessing}
                className="text-orange-600 hover:text-orange-800 text-sm font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded px-1"
                title="Scan document for barcodes and QR codes (Est: ~2s per page)"
              >
                Scan Codes
              </button>
              <button
                onClick={() => {
                  if (complexityMode === 'simple') {
                    setComplexityMode('professional');
                  }
                  onOcr?.(doc);
                }}
                disabled={isProcessing}
                className="text-orange-600 hover:text-orange-800 text-sm font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded px-1"
                title={`Extract text from scanned PDF${complexityMode === 'simple' ? ' (Switches to Professional Mode)' : ''} (Est: ~30s)`}
              >
                OCR
              </button>

              <button
                onClick={() => onFlatten?.(doc)}
                disabled={isProcessing}

                className="text-stone-600 hover:text-stone-800 text-sm font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 rounded px-1"
                title="Flatten Forms"
              >
                Flatten
              </button>

              <button
                onClick={() => onSanitize?.(doc)}
                disabled={isProcessing}
                className="text-indigo-600 hover:text-indigo-800 text-sm font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded px-1"
                title="Remove metadata and scripts (Est: Instant)"
              >
                Sanitize
              </button>
              <button
                onClick={() => onHighlight?.(doc)}
                disabled={isProcessing}
                className="text-teal-600 hover:text-teal-800 text-sm font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded px-1"
              >
                Highlight
              </button>
              <button
                onClick={() => onSign?.(doc)}
                disabled={isProcessing}
                className="text-pink-600 hover:text-pink-800 text-sm font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 rounded px-1"
              >
                Sign
              </button>
              <button
                onClick={() => onAudit?.(doc)}
                disabled={isProcessing}
                className="text-yellow-600 hover:text-yellow-800 text-sm font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500 rounded px-1"
                title="Check for fake redactions (Est: ~5s)"
              >
                Audit
              </button>
              <button
                onClick={() => onReadAloud?.(doc)}
                disabled={isProcessing}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-1"
                title="Read aloud using local AI (Est: ~15s per page)"
              >
                Read Aloud
              </button>
            </>
          )}
          {isMobile && (
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded">Mobile Utility Mode</span>
          )}
          <button
            onClick={() => onRemove(doc.id)}
            disabled={isProcessing}
            className="text-red-500 hover:text-red-700 text-sm font-medium disabled:opacity-50 ml-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded px-1"
          >
            Remove
          </button>
        </div>
      </div>

      {/* PII Sidebar / Overlay */}
      {detectedEntities !== null && (
        <div className="absolute top-0 left-full ml-4 w-64 bg-white border border-gray-200 rounded-xl shadow-lg p-4 z-10">
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
