import { loadPyodide, type PyodideInterface } from 'pyodide';

let pyodide: PyodideInterface | null = null;

export type PyodideWorkerMessage = {
  type: 'INIT' | 'RUN_CODE';
  code?: string;
};

export type PyodideWorkerResponse = {
  type: 'READY' | 'RESULT' | 'ERROR' | 'PROGRESS';
  result?: any;
  error?: string;
  stage?: string;
};

self.onmessage = async (e: MessageEvent<PyodideWorkerMessage>) => {
  const { type, code } = e.data;

  try {
    if (type === 'INIT') {
      if (!pyodide) {
        self.postMessage({ type: 'PROGRESS', stage: 'Downloading base environment...' } satisfies PyodideWorkerResponse);

        pyodide = await loadPyodide({
            indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.29.4/full/'
        });

        self.postMessage({ type: 'PROGRESS', stage: 'Installing document processor (pymupdf)...' } satisfies PyodideWorkerResponse);

        await pyodide.loadPackage('micropip');
        const micropip = pyodide.pyimport('micropip');
        await micropip.install('pymupdf');
        await micropip.install('python-docx');

        self.postMessage({ type: 'PROGRESS', stage: 'Setting up...' } satisfies PyodideWorkerResponse);
      }
      self.postMessage({ type: 'READY' } satisfies PyodideWorkerResponse);
    } else if (type === 'RUN_CODE') {
      if (!pyodide) {
        throw new Error('Pyodide not initialized');
      }
      if (!code) {
        throw new Error('No code provided');
      }

      const result = await pyodide.runPythonAsync(code);
      self.postMessage({ type: 'RESULT', result } satisfies PyodideWorkerResponse);
    }
  } catch (error: any) {
    self.postMessage({ type: 'ERROR', error: error.message } satisfies PyodideWorkerResponse);
  }
};
