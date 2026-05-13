import React, { useCallback, useState, useRef } from 'react';
import { Upload, Shield, FileText, Lock, FileOutput } from 'lucide-react';
import { OnboardingTour } from './OnboardingTour';
import { useFileStore, type PDFDocument } from '../../store/fileStore';
import { getPdfInfo } from '../../lib/pdfProcessing';
import { cn } from '../../lib/utils';
import { ErrorModal } from './ErrorModal';

interface DropzoneProps {
  onError?: (title: string, message: React.ReactNode) => void;
  onDocxDropped?: (files: File[]) => void;
}

export function Dropzone({ onError, onDocxDropped }: DropzoneProps = {}) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addDocuments = useFileStore(state => state.addDocuments);
  const [errorState, setErrorState] = useState<{ isOpen: boolean, title: string, message: React.ReactNode }>({ isOpen: false, title: '', message: '' });

  const handleError = (title: string, message: React.ReactNode) => {
    if (onError) {
      onError(title, message);
    } else {
      setErrorState({ isOpen: true, title, message });
    }
  };

  const documents = useFileStore(state => state.documents);

  const handleFiles = async (files: File[]) => {
    const docxFiles = files.filter(f => f.name.toLowerCase().endsWith('.docx') || f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    let pdfFiles = files.filter(f => f.type === 'application/pdf');

    if (docxFiles.length > 0) {
      if (onDocxDropped) {
        onDocxDropped(docxFiles);
      }
    }

    if (pdfFiles.length === 0) {
      if (docxFiles.length === 0) {
        handleError('Invalid File Type', 'Please upload PDF or DOCX files only.');
      }
      return;
    }

    // Filter out files larger than 80MB (80 * 1024 * 1024 bytes)
    const MAX_FILE_SIZE = 80 * 1024 * 1024;
    const oversizedFiles = pdfFiles.filter(f => f.size > MAX_FILE_SIZE);

    if (oversizedFiles.length > 0) {
      handleError(
        'File Too Large',
        <div>
          <p className="mb-2">This file is too large to process entirely in your browser. Try splitting it into smaller sections first.</p>
          <ul className="list-disc pl-5 text-sm text-gray-500">
            {oversizedFiles.map(f => <li key={f.name}>{f.name} ({(f.size / 1024 / 1024).toFixed(1)}MB)</li>)}
          </ul>
        </div>
      );
      pdfFiles = pdfFiles.filter(f => f.size <= MAX_FILE_SIZE);
    }

    if (pdfFiles.length === 0) return;

    const availableSlots = 8 - documents.length;
    if (pdfFiles.length > availableSlots) {
      handleError(
        'File Limit Reached',
        `Maximum 8 files allowed. Only ${availableSlots > 0 ? `the next ${availableSlots}` : '0'} will be loaded.`
      );
      pdfFiles = pdfFiles.slice(0, Math.max(0, availableSlots));
    }

    if (pdfFiles.length === 0) return;

    // Parse metadata before inserting to prevent redundant renders
    const parsedDocs: PDFDocument[] = [];

    for (const file of pdfFiles) {
      let pageCount;
      let isEncrypted = false;
      let isCorrupt = false;

      try {
        const info = await getPdfInfo(file);
        pageCount = info.pageCount;
        isEncrypted = info.isEncrypted;
      } catch (e: unknown) {
        console.error(`Failed to parse PDF info for ${file.name}`, e);
        if (e instanceof Error && e.message === 'CORRUPT_PDF') {
          isCorrupt = true;
        }
      }

      if (isCorrupt) {
        handleError(
          'Corrupt PDF',
          `We couldn't read "${file.name}". It may be damaged or in an unsupported format.`
        );
        continue;
      }

      if (isEncrypted) {
        handleError(
          'Password-Protected PDF',
          `"${file.name}" is password-protected. Password-protected PDFs are not currently supported by all features.`
        );
        // Still allow adding it, but we should mark it as encrypted
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
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(Array.from(e.target.files));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col items-center justify-center p-4 relative">
      <OnboardingTour />
      <ErrorModal
        isOpen={errorState.isOpen}
        title={errorState.title}
        message={errorState.message}
        onClose={() => setErrorState(prev => ({ ...prev, isOpen: false }))}
      />
      {/* Hero Section */}
      <div className="max-w-3xl w-full text-center space-y-4 mb-12">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
          The Zero-Trust Document Suite.
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          Professional PDF tools that never upload your documents. All processing happens locally in your browser.
        </p>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label="Upload PDF document"
        className={cn(
          "tour-step-1 max-w-4xl w-full aspect-[2/1] min-h-[300px] border-4 border-dashed rounded-3xl flex flex-col items-center justify-center p-8 transition-all duration-200 cursor-pointer bg-white group focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500 focus-visible:border-transparent",
          isDragging ? "border-blue-500 bg-blue-50 scale-[1.02] shadow-xl" : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
        )}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileInput}
          accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx"
          multiple
          className="hidden"
        />
        <div className="bg-blue-100 text-blue-600 p-6 rounded-full mb-6 group-hover:scale-110 transition-transform">
          <Upload size={48} strokeWidth={1.5} />
        </div>
        <h2 className="text-2xl font-bold mb-2">Drop a PDF or DOCX here to begin</h2>
        <p className="text-gray-500 mb-6">or click to browse files</p>

        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-4 py-2 rounded-full font-medium">
          <Shield size={16} />
          Your file never leaves this device
        </div>
      </div>

      {/* Quick Actions Grid (Phase 1 placeholders) */}
      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
        <div className="tour-step-2">
          <ActionCard
            icon={<Lock className="text-red-500" />}
            title="Redact PII"
            description="True redaction of sensitive info."
          />
        </div>
        <div className="tour-step-3">
          <ActionCard
            icon={<FileOutput className="text-blue-500" />}
            title="Merge & Split"
            description="Combine or extract pages instantly."
          />
        </div>
        <div>
          <ActionCard
            icon={<FileText className="text-purple-500" />}
            title="Extract Text"
            description="Local OCR and text extraction."
          />
        </div>
      </div>
    </div>
  );
}

function ActionCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col items-start gap-3">
      <div className="bg-gray-50 p-3 rounded-lg">
        {icon}
      </div>
      <h3 className="font-semibold text-lg">{title}</h3>
      <p className="text-gray-500 text-sm">{description}</p>
    </div>
  );
}