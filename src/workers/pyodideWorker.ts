import { loadPyodide, type PyodideInterface } from "pyodide";

let pyodide: PyodideInterface | null = null;
let initPromise: Promise<void> | null = null;

export type PyodideWorkerMessage = {
  type:
    | "INIT"
    | "RUN_CODE"
    | "EXTRACT_TEXT"
    | "REDACT_DOCUMENT"
    | "ENCRYPT_DOCUMENT"
    | "SANITIZE_DOCUMENT";
  code?: string;
  jobId?: string;
  pdfBytes?: Uint8Array;
  redactions?: string[];
  password?: string;
};

export type PyodideWorkerResponse = {
  type: "READY" | "RESULT" | "ERROR" | "PROGRESS";
  jobId?: string;
  result?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  error?: string;
  stage?: string;
};

const initializePyodide = async () => {
  if (pyodide) return;
  self.postMessage({
    type: "PROGRESS",
    stage: "Downloading base environment...",
  } satisfies PyodideWorkerResponse);

  pyodide = await loadPyodide({
    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.29.4/full/",
  });

  self.postMessage({
    type: "PROGRESS",
    stage: "Installing document processor (pymupdf)...",
  } satisfies PyodideWorkerResponse);

  await pyodide.loadPackage("micropip");
  const micropip = pyodide.pyimport("micropip");
  await micropip.install("pymupdf");
  await micropip.install("python-docx");

  self.postMessage({
    type: "PROGRESS",
    stage: "Setting up...",
  } satisfies PyodideWorkerResponse);
};

self.onmessage = async (e: MessageEvent<PyodideWorkerMessage>) => {
  const { type, code, jobId, pdfBytes, redactions } = e.data;

  try {
    if (type === "INIT") {
      if (!initPromise) {
        initPromise = initializePyodide();
      }
      await initPromise;
      self.postMessage({
        type: "READY",
        jobId,
      } satisfies PyodideWorkerResponse);
    } else if (type === "RUN_CODE") {
      if (!initPromise) initPromise = initializePyodide();
      await initPromise;
      if (!pyodide) throw new Error("Pyodide not initialized");
      if (!code) throw new Error("No code provided");

      const result = await pyodide.runPythonAsync(code);
      self.postMessage({
        type: "RESULT",
        jobId,
        result,
      } satisfies PyodideWorkerResponse);
    } else if (type === "EXTRACT_TEXT") {
      if (!initPromise) initPromise = initializePyodide();
      await initPromise;
      if (!pyodide) throw new Error("Pyodide not initialized");
      if (!pdfBytes) throw new Error("No PDF bytes provided");

      pyodide.globals.set("doc_bytes", pdfBytes);
      const extractCode = `
import fitz
doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
text = ""
for page in doc:
    text += page.get_text() + " "
doc.close()
text
      `;
      const text = await pyodide.runPythonAsync(extractCode);
      self.postMessage({
        type: "RESULT",
        jobId,
        result: text,
      } satisfies PyodideWorkerResponse);
    } else if (type === "REDACT_DOCUMENT") {
      if (!initPromise) initPromise = initializePyodide();
      await initPromise;
      if (!pyodide) throw new Error("Pyodide not initialized");
      if (!pdfBytes) throw new Error("No PDF bytes provided");
      if (!redactions) throw new Error("No redactions provided");

      pyodide.globals.set("doc_bytes", pdfBytes);
      pyodide.globals.set("redactions", redactions);
      const redactCode = `
import fitz
doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
strings_to_redact = redactions.to_py()
for page in doc:
    for t in strings_to_redact:
        rl = page.search_for(t)
        for r in rl:
            page.add_redact_annot(r, fill=(0, 0, 0))
    page.apply_redactions()
out_bytes = doc.write()
doc.close()
bytes(out_bytes)
      `;
      const redactedProxy = await pyodide.runPythonAsync(redactCode);
      const redactedBytes = redactedProxy.toJs();

      const resultBytes = new Uint8Array(redactedBytes);
      self.postMessage({
        type: "RESULT",
        jobId,
        result: resultBytes,
      } satisfies PyodideWorkerResponse);
    } else if (type === "ENCRYPT_DOCUMENT") {
      if (!initPromise) initPromise = initializePyodide();
      await initPromise;
      if (!pyodide) throw new Error("Pyodide not initialized");
      if (!pdfBytes) throw new Error("No PDF bytes provided");
      const passwordToUse = e.data.password;
      if (!passwordToUse) throw new Error("No password provided");

      pyodide.globals.set("doc_bytes", pdfBytes);
      pyodide.globals.set("password", passwordToUse);
      const encryptCode = `
import fitz
doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
out_bytes = doc.write(encryption=fitz.PDF_ENCRYPT_AES_256, user_pw=password, owner_pw=password, permissions=fitz.PDF_PERM_PRINT)
doc.close()
bytes(out_bytes)
      `;
      const encryptedProxy = await pyodide.runPythonAsync(encryptCode);
      const encryptedBytes = encryptedProxy.toJs();

      const resultBytes = new Uint8Array(encryptedBytes);
      self.postMessage({
        type: "RESULT",
        jobId,
        result: resultBytes,
      } satisfies PyodideWorkerResponse);
    } else if (type === "SANITIZE_DOCUMENT") {
      if (!initPromise) initPromise = initializePyodide();
      await initPromise;
      if (!pyodide) throw new Error("Pyodide not initialized");
      if (!pdfBytes) throw new Error("No PDF bytes provided");

      pyodide.globals.set("doc_bytes", pdfBytes);
      const sanitizeCode = `
import fitz

doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")

# 1. Strip metadata
doc.set_metadata({})

# 2. Check fake redactions & 3. Flatten annotations
fake_redactions_found = 0
for page in doc:
    text_blocks = page.get_text("blocks")
    drawings = page.get_drawings()

    for d in drawings:
        fill_color = d.get("fill")
        if fill_color is not None:
            rect_d = fitz.Rect(d["rect"])
            for b in text_blocks:
                if not b[4].strip():
                    continue
                rect_b = fitz.Rect(b[:4])
                intersection = rect_d & rect_b

                if not intersection.is_empty and intersection.get_area() > 0.5 * rect_b.get_area():
                    fake_redactions_found += 1
                    break

    while page.first_annot:
        page.delete_annot(page.first_annot)

out_bytes = doc.write(garbage=4)
doc.close()

[fake_redactions_found, bytes(out_bytes)]
      `;
      const resultProxy = await pyodide.runPythonAsync(sanitizeCode);
      const resultData = resultProxy.toJs();

      const fakeRedactions = resultData[0];
      const resultBytes = new Uint8Array(resultData[1]);

      self.postMessage({
        type: "RESULT",
        jobId,
        result: {
          fakeRedactions,
          bytes: resultBytes,
        },
      } satisfies PyodideWorkerResponse);
    }
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    self.postMessage({
      type: "ERROR",
      jobId,
      error: error.message,
    } satisfies PyodideWorkerResponse);
  }
};
