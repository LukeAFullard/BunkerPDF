import { useState, useEffect, useRef } from 'react';
import { Dropzone } from './components/ui/Dropzone';
import { useFileStore, type PDFDocument } from './store/fileStore';
import { useEngineStore } from './store/engineStore';
import { mergePdfs, splitPdf } from './lib/engineA';
import { EngineStatusPill } from './components/ui/EngineStatusPill';
import { getSmartOutputName } from './lib/utils';
import { DocumentCard } from './components/pdf/DocumentCard';
import { FileTabs } from './components/ui/FileTabs';
import { ErrorModal } from './components/ui/ErrorModal';
import type { NERWorkerMessage, NERWorkerResponse } from './workers/nerWorker';
import type { PyodideWorkerMessage, PyodideWorkerResponse } from './workers/pyodideWorker';

function App() {
  const documents = useFileStore(state => state.documents);
  const activeDocumentId = useFileStore(state => state.activeDocumentId);
  const { setAiStatus, setPyodideStatus } = useEngineStore();
  const nerWorkerRef = useRef<Worker | null>(null);
  const pyodideWorkerRef = useRef<Worker | null>(null);
  const removeDocument = useFileStore(state => state.removeDocument);
  const clearAll = useFileStore(state => state.clearAll);
  const [isGlobalProcessing, setIsGlobalProcessing] = useState(false);
  const [errorState, setErrorState] = useState<{ isOpen: boolean, title: string, message: React.ReactNode }>({ isOpen: false, title: '', message: '' });

  // Promise resolvers mapping
  const nerResolvers = useRef<Map<string, { resolve: (val: any) => void; reject: (err: any) => void }>>(new Map());
  const pyodideResolvers = useRef<Map<string, { resolve: (val: any) => void; reject: (err: any) => void }>>(new Map());

  useEffect(() => {
    // Initialize the NER worker
    setAiStatus('loading');
    nerWorkerRef.current = new Worker(new URL('./workers/nerWorker.ts', import.meta.url), {
      type: 'module'
    });

    nerWorkerRef.current.onmessage = (e: MessageEvent<NERWorkerResponse>) => {
      const { type, jobId, result, error } = e.data;
      if (type === 'READY') {
        console.log('NER Worker is ready.');
        setAiStatus('ready');
      } else if (type === 'RESULT' && jobId) {
        const resolver = nerResolvers.current.get(jobId);
        if (resolver) {
          resolver.resolve(result);
          nerResolvers.current.delete(jobId);
        }
      } else if (type === 'ERROR') {
        if (jobId) {
          const resolver = nerResolvers.current.get(jobId);
          if (resolver) {
            resolver.reject(new Error(error));
            nerResolvers.current.delete(jobId);
          }
        } else {
          console.error('NER Worker Error:', error);
          setAiStatus('error', error);
        }
      }
    };

    nerWorkerRef.current.postMessage({ type: 'INIT' } satisfies NERWorkerMessage);

    // Initialize the Pyodide worker
    setPyodideStatus('loading');
    pyodideWorkerRef.current = new Worker(new URL('./workers/pyodideWorker.ts', import.meta.url), {
      type: 'module'
    });

    pyodideWorkerRef.current.onmessage = (e: MessageEvent<PyodideWorkerResponse>) => {
      const { type, jobId, result, error, stage } = e.data;
      if (type === 'PROGRESS') {
        console.log('Pyodide Worker Progress:', stage);
      } else if (type === 'READY') {
        console.log('Pyodide Worker is ready.');
        setPyodideStatus('ready');
      } else if (type === 'RESULT' && jobId) {
        const resolver = pyodideResolvers.current.get(jobId);
        if (resolver) {
          resolver.resolve(result);
          pyodideResolvers.current.delete(jobId);
        }
      } else if (type === 'ERROR') {
        if (jobId) {
          const resolver = pyodideResolvers.current.get(jobId);
          if (resolver) {
            resolver.reject(new Error(error));
            pyodideResolvers.current.delete(jobId);
          }
        } else {
          console.error('Pyodide Worker Error:', error);
          setPyodideStatus('error', error);
        }
      }
    };

    pyodideWorkerRef.current.postMessage({ type: 'INIT' } satisfies PyodideWorkerMessage);

    return () => {
      nerWorkerRef.current?.terminate();
      pyodideWorkerRef.current?.terminate();
    };
  }, [setAiStatus, setPyodideStatus]);

  const extractText = (bytes: Uint8Array): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!pyodideWorkerRef.current) return reject(new Error('Pyodide worker not ready'));
      const jobId = crypto.randomUUID();
      pyodideResolvers.current.set(jobId, { resolve, reject });
      pyodideWorkerRef.current.postMessage({
        type: 'EXTRACT_TEXT',
        jobId,
        pdfBytes: bytes
      } satisfies PyodideWorkerMessage);
    });
  };

  const redactPdf = (bytes: Uint8Array, redactions: string[]): Promise<Uint8Array> => {
    return new Promise((resolve, reject) => {
      if (!pyodideWorkerRef.current) return reject(new Error('Pyodide worker not ready'));
      const jobId = crypto.randomUUID();
      pyodideResolvers.current.set(jobId, { resolve, reject });
      pyodideWorkerRef.current.postMessage({
        type: 'REDACT_DOCUMENT',
        jobId,
        pdfBytes: bytes,
        redactions
      } satisfies PyodideWorkerMessage);
    });
  };

  const extractEntities = (text: string): Promise<string[]> => {
    return new Promise((resolve, reject) => {
      if (!nerWorkerRef.current) return reject(new Error('NER worker not ready'));
      const jobId = crypto.randomUUID();
      nerResolvers.current.set(jobId, { resolve, reject });
      nerWorkerRef.current.postMessage({
        type: 'EXTRACT',
        jobId,
        text
      } satisfies NERWorkerMessage);
    });
  };

  const handleMerge = async () => {
    if (documents.length < 2) {
      setErrorState({ isOpen: true, title: 'Not Enough Files', message: 'Please upload at least 2 PDFs to merge.' });
      return;
    }

    setIsGlobalProcessing(true);
    try {
      const mergedBytes = await mergePdfs(documents.map(d => d.file));
      const buffer = new Uint8Array(mergedBytes);
      const blob = new Blob([buffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = getSmartOutputName(documents[0].name, 'merged');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      setErrorState({ isOpen: true, title: 'Merge Error', message: 'An error occurred while merging the PDFs.' });
    } finally {
      setIsGlobalProcessing(false);
    }
  };

  const handleSplitBurst = async (doc: PDFDocument) => {
    setIsGlobalProcessing(true);
    try {
      const splitBytesArray = await splitPdf(doc.file);

      splitBytesArray.forEach((bytes, index) => {
        const buffer = new Uint8Array(bytes);
        const blob = new Blob([buffer], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = getSmartOutputName(doc.name, `split-page-${index + 1}`);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    } catch (e) {
      console.error(e);
      setErrorState({ isOpen: true, title: 'Split Error', message: 'An error occurred while splitting the PDF.' });
    } finally {
      setIsGlobalProcessing(false);
    }
  };

  return (
    <div className="App font-sans bg-gray-50 min-h-screen">
      <ErrorModal
        isOpen={errorState.isOpen}
        title={errorState.title}
        message={errorState.message}
        onClose={() => setErrorState(prev => ({ ...prev, isOpen: false }))}
      />
      {documents.length === 0 ? (
        <div className="flex flex-col h-screen">
          <header className="p-4 flex justify-between items-center bg-white border-b border-gray-200">
            <div className="font-bold text-xl text-gray-800 tracking-tight">BunkerPDF</div>
            <EngineStatusPill />
          </header>
          <div className="flex-1">
            <Dropzone />
          </div>
        </div>
      ) : (
        <div className="p-8 max-w-6xl mx-auto flex flex-col gap-8">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <h1 className="text-3xl font-bold">Workspace</h1>
              <EngineStatusPill />
            </div>
            <div className="flex gap-4">
              <button
                onClick={handleMerge}
                disabled={documents.length < 2 || isGlobalProcessing}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50 hover:bg-blue-700 transition-colors"
              >
                {isGlobalProcessing ? 'Processing...' : 'Merge All'}
              </button>
              <button
                onClick={clearAll}
                className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium hover:bg-gray-300 transition-colors"
              >
                Clear All
              </button>
            </div>
          </div>

          <div className="flex flex-col">
            <FileTabs />

            <div className="mt-4 flex justify-center">
              {(() => {
                const activeDoc = documents.find(doc => doc.id === activeDocumentId);
                if (!activeDoc) return null;
                return (
                  <div key={activeDoc.id} className="w-full max-w-2xl">
                    <DocumentCard
                      doc={activeDoc}
                      onRemove={removeDocument}
                      onSplit={handleSplitBurst}
                      extractText={extractText}
                      extractEntities={extractEntities}
                      redactPdf={redactPdf}
                      isGlobalProcessing={isGlobalProcessing}
                      setIsGlobalProcessing={setIsGlobalProcessing}
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
