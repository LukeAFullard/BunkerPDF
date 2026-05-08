import React, { useCallback, useState, useRef } from 'react';
import { Upload, Shield, FileText, Lock, FileOutput } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useFileStore } from '../../store/fileStore';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function Dropzone() {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addDocuments = useFileStore(state => state.addDocuments);

  const handleFiles = async (files: File[]) => {
    const pdfFiles = files.filter(f => f.type === 'application/pdf');
    if (pdfFiles.length === 0) {
      alert("Please upload PDF files only.");
      return;
    }

    // Add them to the store immediately so UI responds
    addDocuments(pdfFiles);

    // In a real app we'd retrieve the generated IDs.
    // For now we assume the store's latest additions match `pdfFiles` in order.
    // Let's use a timeout trick to get the IDs, or just fetch all docs.
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
  }, []);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(Array.from(e.target.files));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col items-center justify-center p-4">
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
        className={cn(
          "max-w-4xl w-full aspect-[2/1] min-h-[300px] border-4 border-dashed rounded-3xl flex flex-col items-center justify-center p-8 transition-all duration-200 cursor-pointer bg-white group",
          isDragging ? "border-blue-500 bg-blue-50 scale-[1.02] shadow-xl" : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
        )}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileInput}
          accept="application/pdf"
          multiple
          className="hidden"
        />
        <div className="bg-blue-100 text-blue-600 p-6 rounded-full mb-6 group-hover:scale-110 transition-transform">
          <Upload size={48} strokeWidth={1.5} />
        </div>
        <h2 className="text-2xl font-bold mb-2">Drop a PDF here to begin</h2>
        <p className="text-gray-500 mb-6">or click to browse files</p>

        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-4 py-2 rounded-full font-medium">
          <Shield size={16} />
          Your file never leaves this device
        </div>
      </div>

      {/* Quick Actions Grid (Phase 1 placeholders) */}
      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
        <ActionCard
          icon={<Lock className="text-red-500" />}
          title="Redact PII"
          description="True redaction of sensitive info."
        />
        <ActionCard
          icon={<FileOutput className="text-blue-500" />}
          title="Merge & Split"
          description="Combine or extract pages instantly."
        />
        <ActionCard
          icon={<FileText className="text-purple-500" />}
          title="Extract Text"
          description="Local OCR and text extraction."
        />
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