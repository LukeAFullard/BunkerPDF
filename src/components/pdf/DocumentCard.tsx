import { useState } from 'react';
import { PDFThumbnail } from './PDFThumbnail';
import { type PDFDocument } from '../../store/fileStore';
import { getSmartOutputName } from '../../lib/utils';
import { ErrorModal } from '../ui/ErrorModal';

interface DocumentCardProps {
  doc: PDFDocument;
  onRemove: (id: string) => void;
  onSplit: (doc: PDFDocument) => void;
  extractText: (bytes: Uint8Array) => Promise<string>;
  extractEntities: (text: string) => Promise<string[]>;
  redactPdf: (bytes: Uint8Array, redactions: string[]) => Promise<Uint8Array>;
  isGlobalProcessing: boolean;
  setIsGlobalProcessing: (status: boolean) => void;
}

export function DocumentCard({
  doc,
  onRemove,
  onSplit,
  extractText,
  extractEntities,
  redactPdf,
  isGlobalProcessing,
  setIsGlobalProcessing
}: DocumentCardProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [detectedEntities, setDetectedEntities] = useState<string[] | null>(null);
  const [selectedEntities, setSelectedEntities] = useState<Set<string>>(new Set());
  const [isRedacting, setIsRedacting] = useState(false);
  const [errorState, setErrorState] = useState<{ isOpen: boolean, title: string, message: React.ReactNode }>({ isOpen: false, title: '', message: '' });

  const handleScan = async () => {
    setIsScanning(true);
    setDetectedEntities(null);
    setSelectedEntities(new Set());
    try {
      const buffer = await doc.file.arrayBuffer();
      const pdfBytes = new Uint8Array(buffer);

      const text = await extractText(pdfBytes);
      if (!text || text.trim() === '') {
        setDetectedEntities([]);
        return;
      }

      const entities = await extractEntities(text);
      setDetectedEntities(entities);
      setSelectedEntities(new Set(entities)); // pre-select all
    } catch (err) {
      console.error(err);
      setErrorState({ isOpen: true, title: 'Scan Error', message: 'An error occurred while scanning the document.' });
    } finally {
      setIsScanning(false);
    }
  };

  const handleRedact = async () => {
    if (selectedEntities.size === 0) return;

    setIsRedacting(true);
    setIsGlobalProcessing(true);
    try {
      const buffer = await doc.file.arrayBuffer();
      const pdfBytes = new Uint8Array(buffer);
      const redactions = Array.from(selectedEntities);

      const redactedBytes = await redactPdf(pdfBytes, redactions);

      // Need standard array buffer without TS complaints for shared buffer
      const standardBuffer = new Uint8Array(redactedBytes.length);
      standardBuffer.set(redactedBytes);

      // Download
      const blob = new Blob([standardBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = getSmartOutputName(doc.name, 'redacted');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setErrorState({ isOpen: true, title: 'Redaction Error', message: 'An error occurred while redacting the document.' });
    } finally {
      setIsRedacting(false);
      setIsGlobalProcessing(false);
      setDetectedEntities(null); // Clear sidebar after redaction
    }
  };

  const toggleEntity = (entity: string) => {
    setSelectedEntities(prev => {
      const next = new Set(prev);
      if (next.has(entity)) {
        next.delete(entity);
      } else {
        next.add(entity);
      }
      return next;
    });
  };

  const isProcessing = isScanning || isRedacting || isGlobalProcessing;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col hover:shadow-md transition-shadow relative">
      <ErrorModal
        isOpen={errorState.isOpen}
        title={errorState.title}
        message={errorState.message}
        onClose={() => setErrorState(prev => ({ ...prev, isOpen: false }))}
      />
      <div className="p-4 flex flex-col justify-between flex-1">
        <div className="mb-4">
          <PDFThumbnail file={doc.file} />
        </div>
        <div>
          <h3 className="font-semibold text-lg truncate" title={doc.name}>{doc.name}</h3>
          <div className="text-gray-500 text-sm mt-1">
            <p>Size: {(doc.size / 1024 / 1024).toFixed(2)} MB</p>
            <p>Pages: {doc.pageCount !== undefined ? doc.pageCount : 'Loading...'}</p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-2">
          <button
            onClick={() => onSplit(doc)}
            disabled={isProcessing}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium disabled:opacity-50"
          >
            Split
          </button>
          <button
            onClick={handleScan}
            disabled={isProcessing}
            className="text-purple-600 hover:text-purple-800 text-sm font-medium disabled:opacity-50"
          >
            {isScanning ? 'Scanning...' : 'Scan PII'}
          </button>
          <button
            onClick={() => onRemove(doc.id)}
            disabled={isProcessing}
            className="text-red-500 hover:text-red-700 text-sm font-medium disabled:opacity-50 ml-auto"
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
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>

          {detectedEntities.length === 0 ? (
            <p className="text-sm text-gray-500">No sensitive information found.</p>
          ) : (
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
              {detectedEntities.map((entity, i) => (
                <label key={i} className="flex items-start gap-2 text-sm cursor-pointer hover:bg-gray-50 p-1 rounded">
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
              className="w-full mt-4 bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {isRedacting ? 'Redacting...' : `Redact ${selectedEntities.size} items`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
