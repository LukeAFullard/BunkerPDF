import { useState, useRef } from 'react';
import { X, Upload, CheckCircle, XCircle } from 'lucide-react';
import { hashDocument } from '../../lib/cryptoUtils';

interface VerifyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function VerifyModal({ isOpen, onClose }: VerifyModalProps) {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [jsonFile, setJsonFile] = useState<File | null>(null);

  const [verificationResult, setVerificationResult] = useState<{
    status: 'success' | 'error';
    message: React.ReactNode;
  } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPdfFile(null);
    setJsonFile(null);
    setVerificationResult(null);
    setIsVerifying(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleVerify = async (pdf: File, json: File) => {
    setIsVerifying(true);
    setVerificationResult(null);

    try {
      // Parse JSON
      const jsonText = await json.text();
      const cert = JSON.parse(jsonText);

      if (!cert.sha256 || !cert.timestamp_utc) {
         setVerificationResult({
           status: 'error',
           message: 'Invalid certificate format. Missing sha256 or timestamp.'
         });
         setIsVerifying(false);
         return;
      }

      // Hash PDF
      const arrayBuffer = await pdf.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const computedHash = await hashDocument(bytes);

      if (computedHash === cert.sha256) {
        setVerificationResult({
          status: 'success',
          message: (
            <div>
              <p className="font-medium text-green-800">Verification Passed</p>
              <p className="text-sm text-green-700 mt-1">The document matches the certificate.</p>
              <p className="text-xs text-green-600 mt-2">Original Timestamp: {new Date(cert.timestamp_utc).toLocaleString()}</p>
            </div>
          )
        });
      } else {
        setVerificationResult({
          status: 'error',
          message: (
            <div>
              <p className="font-medium text-red-800">Verification Failed</p>
              <p className="text-sm text-red-700 mt-1">The document has been altered or does not match this certificate.</p>
            </div>
          )
        });
      }
    } catch (e) {
      console.error(e);
      setVerificationResult({
        status: 'error',
        message: 'An error occurred during verification. Please ensure the files are valid.'
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const onPdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPdfFile(file);
      if (jsonFile) {
        handleVerify(file, jsonFile);
      }
    }
  };

  const onJsonChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setJsonFile(file);
      if (pdfFile) {
        handleVerify(pdfFile, file);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Verify Document Integrity</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Select a PDF document and its corresponding certificate JSON file to verify it hasn't been altered.
          </p>

          <div className="space-y-4">
            {/* PDF Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                1. Select PDF Document
              </label>
              <div
                onClick={() => pdfInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-4 flex items-center justify-center cursor-pointer transition-colors ${
                  pdfFile ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                }`}
              >
                <input
                  type="file"
                  ref={pdfInputRef}
                  onChange={onPdfChange}
                  accept="application/pdf"
                  className="hidden"
                />
                {pdfFile ? (
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-400 truncate max-w-[250px]">{pdfFile.name}</span>
                ) : (
                  <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                    <Upload className="w-4 h-4" /> Browse PDF
                  </span>
                )}
              </div>
            </div>

            {/* JSON Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                2. Select Certificate JSON
              </label>
              <div
                onClick={() => jsonInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-4 flex items-center justify-center cursor-pointer transition-colors ${
                  jsonFile ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                }`}
              >
                <input
                  type="file"
                  ref={jsonInputRef}
                  onChange={onJsonChange}
                  accept="application/json"
                  className="hidden"
                />
                {jsonFile ? (
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-400 truncate max-w-[250px]">{jsonFile.name}</span>
                ) : (
                  <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                    <Upload className="w-4 h-4" /> Browse JSON
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Result */}
          {isVerifying ? (
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl text-center text-sm text-gray-600 dark:text-gray-400 animate-pulse">
              Verifying...
            </div>
          ) : verificationResult ? (
            <div className={`p-4 rounded-xl flex items-start gap-3 ${
              verificationResult.status === 'success' ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800'
            }`}>
              {verificationResult.status === 'success' ? (
                <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-500 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-6 h-6 text-red-600 dark:text-red-500 shrink-0 mt-0.5" />
              )}
              <div>
                {verificationResult.message}
              </div>
            </div>
          ) : null}
        </div>

        <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-end">
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
