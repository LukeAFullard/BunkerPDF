import { useState, useEffect, useRef } from 'react';
import { Dropzone } from './components/ui/Dropzone';
import { useFileStore, type PDFDocument } from './store/fileStore';
import { mergePdfs, splitPdf } from './lib/engineA';
import { PDFThumbnail } from './components/pdf/PDFThumbnail';
import type { NERWorkerMessage, NERWorkerResponse } from './workers/nerWorker';

function App() {
  const documents = useFileStore(state => state.documents);
  const workerRef = useRef<Worker | null>(null);
  const removeDocument = useFileStore(state => state.removeDocument);
  const clearAll = useFileStore(state => state.clearAll);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    // Initialize the NER worker
    workerRef.current = new Worker(new URL('./workers/nerWorker.ts', import.meta.url), {
      type: 'module'
    });

    workerRef.current.onmessage = (e: MessageEvent<NERWorkerResponse>) => {
      if (e.data.type === 'READY') {
        console.log('NER Worker is ready.');
        // Run POC extraction
        const testString = 'My name is Jules and my email is jules@example.com.';
        console.log(`Sending text to NER Worker: "${testString}"`);
        workerRef.current?.postMessage({
          type: 'EXTRACT',
          text: testString
        } satisfies NERWorkerMessage);
      } else if (e.data.type === 'RESULT') {
        console.log('NER Extraction Results:', e.data.result);
      } else if (e.data.type === 'ERROR') {
        console.error('NER Worker Error:', e.data.error);
      }
    };

    workerRef.current.postMessage({ type: 'INIT' } satisfies NERWorkerMessage);

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const handleMerge = async () => {
    if (documents.length < 2) {
      alert("Please upload at least 2 PDFs to merge.");
      return;
    }

    setIsProcessing(true);
    try {
      const mergedBytes = await mergePdfs(documents.map(d => d.file));
      // Convert to a regular ArrayBuffer or Uint8Array before passing to Blob
      // to avoid TS errors regarding SharedArrayBuffer from Vite's headers
      const buffer = new Uint8Array(mergedBytes);
      const blob = new Blob([buffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `merged-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Error merging PDFs");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSplitBurst = async (doc: PDFDocument) => {
    setIsProcessing(true);
    try {
      const splitBytesArray = await splitPdf(doc.file);

      splitBytesArray.forEach((bytes, index) => {
        const buffer = new Uint8Array(bytes);
        const blob = new Blob([buffer], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${doc.name.replace('.pdf', '')}-page-${index + 1}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    } catch (e) {
      console.error(e);
      alert("Error splitting PDF");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="App font-sans bg-gray-50 min-h-screen">
      {documents.length === 0 ? (
        <Dropzone />
      ) : (
        <div className="p-8 max-w-6xl mx-auto flex flex-col gap-8">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold">Workspace</h1>
            <div className="flex gap-4">
              <button
                onClick={handleMerge}
                disabled={documents.length < 2 || isProcessing}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50 hover:bg-blue-700 transition-colors"
              >
                {isProcessing ? 'Processing...' : 'Merge All'}
              </button>
              <button
                onClick={clearAll}
                className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium hover:bg-gray-300 transition-colors"
              >
                Clear All
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map(doc => (
              <div key={doc.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
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
                <div className="mt-4 pt-4 border-t border-gray-100 flex gap-4">
                  <button
                    onClick={() => handleSplitBurst(doc)}
                    disabled={isProcessing}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium disabled:opacity-50"
                  >
                    Split to pages
                  </button>
                  <button
                    onClick={() => removeDocument(doc.id)}
                    disabled={isProcessing}
                    className="text-red-500 hover:text-red-700 text-sm font-medium disabled:opacity-50 ml-auto"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;