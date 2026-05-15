import { loadPyodide, type PyodideInterface } from "pyodide";

let pyodide: PyodideInterface | null = null;
let initPromise: Promise<void> | null = null;

export type PyodideWorkerMessage = {
  type:
    | "INIT"
    | "RUN_CODE"
    | "EXTRACT_TEXT"
    | "REDACT_DOCUMENT"
    | "HIGHLIGHT_DOCUMENT"
    | "ENCRYPT_DOCUMENT"
    | "UNLOCK_DOCUMENT"
    | "SANITIZE_DOCUMENT"
    | "AUDIT_DOCUMENT"
    | "EXTRACT_TABLES"
    | "CSV_TO_EXCEL"
    | "EXTRACT_MARKDOWN"
    | "EXTRACT_HTML"
    | "EXTRACT_IMAGES"
    | "EXTRACT_LINKS"
    | "EXTRACT_ANNOTATIONS"
    | "EXTRACT_BOOKMARKS"
    | "EDIT_BOOKMARKS"
    | "DOCX_TO_PDF"
    | "PDF_TO_DOCX"
    | "VERIFY_SIGNATURE"
    | "EXPORT_DARK"
    | "EXTRACT_PAGE_TEXT"
    | "EXTRACT_ALL_PAGES_TEXT";
  code?: string;
  jobId?: string;
  pdfBytes?: Uint8Array;
  redactions?: string[];
  pageNum?: number;
  pageCount?: number;
  highlights?: string[];
  password?: string;
  csvData?: string;
  bookmarks?: { level: number; title: string; page: number }[];
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
  const { type, code, jobId, pdfBytes, redactions, pageNum } = e.data;

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
    } else if (type === "EXTRACT_ALL_PAGES_TEXT") {
      if (!initPromise) initPromise = initializePyodide();
      await initPromise;
      if (!pyodide) throw new Error("Pyodide not initialized");
      if (!pdfBytes) throw new Error("No PDF bytes provided");
      const { pageCount } = e.data;
      if (!pageCount) throw new Error("No pageCount provided");

      pyodide.globals.set("doc_bytes", pdfBytes);
      pyodide.globals.set("page_count", pageCount);
      const extractCode = `
import fitz
import json

doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
texts = []
for i in range(min(page_count, len(doc))):
    page_text = doc[i].get_text()
    texts.append(page_text)
doc.close()
del doc_bytes
del page_count
json.dumps(texts)
      `;
      const jsonResult = await pyodide.runPythonAsync(extractCode);
      const texts = JSON.parse(jsonResult);

      self.postMessage({
        type: "RESULT",
        jobId,
        result: texts,
      } satisfies PyodideWorkerResponse);
    } else if (type === "EXTRACT_PAGE_TEXT") {
      if (!initPromise) initPromise = initializePyodide();
      await initPromise;
      if (!pyodide) throw new Error("Pyodide not initialized");
      if (!pdfBytes) throw new Error("No PDF bytes provided");
      if (pageNum === undefined) throw new Error("No pageNum provided");

      pyodide.globals.set("doc_bytes", pdfBytes);
      pyodide.globals.set("target_page", pageNum);
      const extractCode = `
import fitz
doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
text = ""
if target_page < len(doc):
    text = doc[target_page].get_text()
doc.close()
del doc_bytes
del target_page
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
    } else if (type === "HIGHLIGHT_DOCUMENT") {
      if (!initPromise) initPromise = initializePyodide();
      await initPromise;
      if (!pyodide) throw new Error("Pyodide not initialized");
      if (!pdfBytes) throw new Error("No PDF bytes provided");
      const { highlights } = e.data;
      if (!highlights) throw new Error("No highlights provided");

      pyodide.globals.set("doc_bytes", pdfBytes);
      pyodide.globals.set("highlights", highlights);
      const highlightCode = `
import fitz
doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
strings_to_highlight = highlights.to_py()
for page in doc:
    for t in strings_to_highlight:
        rl = page.search_for(t)
        for r in rl:
            page.add_highlight_annot(r)
out_bytes = doc.tobytes()
doc.close()
bytes(out_bytes)
      `;
      const highlightedProxy = await pyodide.runPythonAsync(highlightCode);
      const highlightedBytes = highlightedProxy.toJs();

      const resultBytes = new Uint8Array(highlightedBytes);
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
    } else if (type === "UNLOCK_DOCUMENT") {
      if (!initPromise) initPromise = initializePyodide();
      await initPromise;
      if (!pyodide) throw new Error("Pyodide not initialized");
      if (!pdfBytes) throw new Error("No PDF bytes provided");
      const passwordToUse = e.data.password;
      if (!passwordToUse) throw new Error("No password provided");

      pyodide.globals.set("doc_bytes", pdfBytes);
      pyodide.globals.set("password", passwordToUse);
      const unlockCode = `
import fitz
doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
authenticated = doc.authenticate(password)
if not authenticated:
    raise Exception("Incorrect password")
out_bytes = doc.write(encryption=fitz.PDF_ENCRYPT_NONE)
doc.close()
del doc_bytes
bytes(out_bytes)
      `;
      const unlockedProxy = await pyodide.runPythonAsync(unlockCode);
      const unlockedBytesOut = unlockedProxy.toJs();
      const resultBytes = new Uint8Array(unlockedBytesOut);
      self.postMessage({
        type: "RESULT",
        jobId,
        result: resultBytes,
      } satisfies PyodideWorkerResponse);
    } else if (type === "AUDIT_DOCUMENT") {
      if (!initPromise) initPromise = initializePyodide();
      await initPromise;
      if (!pyodide) throw new Error("Pyodide not initialized");
      if (!pdfBytes) throw new Error("No PDF bytes provided");

      pyodide.globals.set("doc_bytes", pdfBytes);
      const auditCode = `
import fitz
import json

doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")

fake_redactions = []
for page_num, page in enumerate(doc):
    text_blocks = page.get_text("blocks")
    drawings = page.get_drawings()

    for d in drawings:
        fill_color = d.get("fill")
        if fill_color is not None:
            rect_d = fitz.Rect(d["rect"])
            for b in text_blocks:
                text_content = b[4].strip()
                if not text_content:
                    continue
                rect_b = fitz.Rect(b[:4])
                intersection = rect_d & rect_b

                if not intersection.is_empty and intersection.get_area() > 0.5 * rect_b.get_area():
                    fake_redactions.append({
                        "page": page_num + 1,
                        "text": text_content
                    })

doc.close()
json.dumps(fake_redactions)
      `;
      const resultStr = await pyodide.runPythonAsync(auditCode);
      const resultData = JSON.parse(resultStr);

      self.postMessage({
        type: "RESULT",
        jobId,
        result: resultData,
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
    } else if (type === "EXTRACT_TABLES") {
      if (!initPromise) initPromise = initializePyodide();
      await initPromise;
      if (!pyodide) throw new Error("Pyodide not initialized");
      if (!pdfBytes) throw new Error("No PDF bytes provided");

      pyodide.globals.set("doc_bytes", pdfBytes);
      const extractTablesCode = `
import fitz
import json

doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
all_tables = []
for page_num, page in enumerate(doc):
    tables = page.find_tables()
    for table_idx, table in enumerate(tables.tables):
        # get pandas df, but convert to list of dicts directly
        try:
            import micropip
            import asyncio
            # lazily install pandas if not present
            try:
                import pandas as pd
            except ImportError:
                pass

            df = table.to_pandas()
            # replace NaNs with None to ensure valid JSON
            df = df.where(pd.notnull(df), None)

            # format columns to be strings to avoid issue with numeric headers
            df.columns = df.columns.astype(str)
            table_data = df.to_dict(orient="records")

            all_tables.append({
                "page": page_num + 1,
                "table_index": table_idx + 1,
                "data": table_data,
                "columns": list(df.columns)
            })
        except Exception as e:
            print("Error processing table:", e)
            pass

doc.close()
json.dumps(all_tables)
      `;

      // lazy load pandas
      const micropip = pyodide.pyimport("micropip");
      await micropip.install("pandas");

      const jsonData = await pyodide.runPythonAsync(extractTablesCode);

      self.postMessage({
        type: "RESULT",
        jobId,
        result: jsonData, // returns stringified JSON
      } satisfies PyodideWorkerResponse);
    } else if (type === "CSV_TO_EXCEL") {
      if (!initPromise) initPromise = initializePyodide();
      await initPromise;
      if (!pyodide) throw new Error("Pyodide not initialized");
      const { csvData } = e.data; // Now this is JSON string
      if (!csvData) throw new Error("No JSON data provided");

      // Lazy load openpyxl & pandas
      const micropip = pyodide.pyimport("micropip");
      await micropip.install("pandas");
      await micropip.install("openpyxl");

      pyodide.globals.set("json_str", csvData);
      const jsonToExcelCode = `
import pandas as pd
import io
import json

tables = json.loads(json_str)

excel_buf = io.BytesIO()
with pd.ExcelWriter(excel_buf, engine='openpyxl') as writer:
    if not tables:
        # Create empty df just to have a valid excel file
        pd.DataFrame().to_excel(writer, index=False, sheet_name="Empty")
    else:
        for i, table in enumerate(tables):
            sheet_name = f"Page_{table['page']}_Table_{table['table_index']}"
            # limit sheet name to 31 chars (excel limit)
            sheet_name = sheet_name[:31]

            df = pd.DataFrame(table['data'], columns=table['columns'])
            df.to_excel(writer, index=False, sheet_name=sheet_name)

excel_bytes = excel_buf.getvalue()
bytes(excel_bytes)
      `;
      const excelProxy = await pyodide.runPythonAsync(jsonToExcelCode);
      const excelBytes = excelProxy.toJs();

      const resultBytes = new Uint8Array(excelBytes);
      self.postMessage({
        type: "RESULT",
        jobId,
        result: resultBytes,
      } satisfies PyodideWorkerResponse);

    } else if (type === "EXTRACT_IMAGES") {
      if (!initPromise) initPromise = initializePyodide();
      await initPromise;
      if (!pyodide) throw new Error("Pyodide not initialized");
      if (!pdfBytes) throw new Error("No PDF bytes provided");

      pyodide.globals.set("doc_bytes", pdfBytes);
      const extractImagesCode = `
import fitz
import io
import zipfile

doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
zip_buffer = io.BytesIO()

with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
    for page_num in range(len(doc)):
        page = doc[page_num]
        image_list = page.get_images(full=True)
        for img_index, img in enumerate(image_list):
            xref = img[0]
            try:
                base_image = doc.extract_image(xref)
                image_bytes = base_image["image"]
                image_ext = base_image["ext"]
                image_name = f"page{page_num+1}_img{img_index+1}.{image_ext}"
                zip_file.writestr(image_name, image_bytes)
            except Exception:
                pass

zip_bytes = zip_buffer.getvalue()
doc.close()
del doc, zip_buffer, doc_bytes
zip_bytes
`;
      const zipBytesProxy = await pyodide.runPythonAsync(extractImagesCode);
      const zipBytes = zipBytesProxy.toJs();
      zipBytesProxy.destroy();

      self.postMessage({
        type: "RESULT",
        jobId,
        result: zipBytes,
      } satisfies PyodideWorkerResponse);

} else if (type === "EXTRACT_BOOKMARKS") {
      if (!initPromise) initPromise = initializePyodide();
      await initPromise;
      if (!pyodide) throw new Error("Pyodide not initialized");
      if (!pdfBytes) throw new Error("No PDF bytes provided");

      pyodide.globals.set("doc_bytes", pdfBytes);
      const extractBookmarksCode = `
import fitz
import json

doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
toc = doc.get_toc()
doc.close()
del doc, doc_bytes

formatted_toc = [{"level": item[0], "title": item[1], "page": item[2]} for item in toc]
json.dumps(formatted_toc)
`;
      const jsonBookmarks = await pyodide.runPythonAsync(extractBookmarksCode);

      self.postMessage({
        type: "RESULT",
        jobId,
        result: jsonBookmarks,
      } satisfies PyodideWorkerResponse);

    } else if (type === "EDIT_BOOKMARKS") {
      if (!initPromise) initPromise = initializePyodide();
      await initPromise;
      if (!pyodide) throw new Error("Pyodide not initialized");
      if (!pdfBytes) throw new Error("No PDF bytes provided");

      const bookmarksMessage = e.data.bookmarks || [];
      const toc = bookmarksMessage.map(b => [b.level, b.title, b.page]);

      pyodide.globals.set("doc_bytes", pdfBytes);
      pyodide.globals.set("toc_data", toc);

      const editBookmarksCode = `
import fitz

doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
# Convert JS proxy list to python list of lists
py_toc = [[item[0], item[1], item[2]] for item in toc_data]
doc.set_toc(py_toc)

out_bytes = doc.write()
doc.close()
del doc, doc_bytes, toc_data
out_bytes
`;
      const outBytesProxy = await pyodide.runPythonAsync(editBookmarksCode);
      const outBytes = outBytesProxy.toJs();
      outBytesProxy.destroy();

      self.postMessage({
        type: "RESULT",
        jobId,
        result: outBytes,
      } satisfies PyodideWorkerResponse);

    } else if (type === "EXTRACT_LINKS") {
      if (!initPromise) initPromise = initializePyodide();
      await initPromise;
      if (!pyodide) throw new Error("Pyodide not initialized");
      if (!pdfBytes) throw new Error("No PDF bytes provided");

      pyodide.globals.set("doc_bytes", pdfBytes);
      const extractLinksCode = `
import fitz
import json

doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
links = []

for page_num in range(len(doc)):
    page = doc[page_num]
    page_links = page.get_links()
    for link in page_links:
        if "uri" in link:
            links.append({
                "page": page_num + 1,
                "uri": link["uri"]
            })

doc.close()
del doc, doc_bytes
json.dumps(links)
`;
      const jsonLinks = await pyodide.runPythonAsync(extractLinksCode);

      self.postMessage({
        type: "RESULT",
        jobId,
        result: jsonLinks,
      } satisfies PyodideWorkerResponse);

    } else if (type === "EXTRACT_ANNOTATIONS") {
      if (!initPromise) initPromise = initializePyodide();
      await initPromise;
      if (!pyodide) throw new Error("Pyodide not initialized");
      if (!pdfBytes) throw new Error("No PDF bytes provided");

      pyodide.globals.set("doc_bytes", pdfBytes);
      const extractAnnotationsCode = `
import fitz
import json

doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
annotations = []

for page_num in range(len(doc)):
    page = doc[page_num]
    for annot in page.annots():
        info = annot.info
        content = info.get("content", "")
        if not content:
            # Fallback to extracting the underlying text
            content = page.get_text("text", clip=annot.rect).strip()

        if content:
            annotations.append({
                "page": page_num + 1,
                "type": annot.type[1],
                "content": content
            })

doc.close()
del doc, doc_bytes
json.dumps(annotations)
`;
      const jsonAnnotations = await pyodide.runPythonAsync(extractAnnotationsCode);

      self.postMessage({
        type: "RESULT",
        jobId,
        result: jsonAnnotations,
      } satisfies PyodideWorkerResponse);

    } else if (type === "EXTRACT_HTML") {
      if (!initPromise) initPromise = initializePyodide();
      await initPromise;
      if (!pyodide) throw new Error("Pyodide not initialized");
      if (!pdfBytes) throw new Error("No PDF bytes provided");

      pyodide.globals.set("doc_bytes", pdfBytes);
      const htmlCode = `
import fitz

doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
html_lines = []

for page in doc:
    html_lines.append(page.get_text("html"))

doc.close()
"\\n<hr>\\n".join(html_lines)
      `;
      const htmlData = await pyodide.runPythonAsync(htmlCode);

      self.postMessage({
        type: "RESULT",
        jobId,
        result: htmlData,
      } satisfies PyodideWorkerResponse);

    } else if (type === "EXTRACT_MARKDOWN") {
      if (!initPromise) initPromise = initializePyodide();
      await initPromise;
      if (!pyodide) throw new Error("Pyodide not initialized");
      if (!pdfBytes) throw new Error("No PDF bytes provided");

      pyodide.globals.set("doc_bytes", pdfBytes);
      const markdownCode = `
import fitz

doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
markdown_lines = []

for page in doc:
    blocks_dict = page.get_text("dict").get("blocks", [])

    for block in blocks_dict:
        if block.get("type") == 0:  # text block
            block_text = []
            max_font_size = 0

            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    text = span.get("text", "").strip()
                    if not text:
                        continue
                    font_size = span.get("size", 0)
                    if font_size > max_font_size:
                        max_font_size = font_size
                    block_text.append(text)

            combined_text = " ".join(block_text).strip()
            if not combined_text:
                continue

            # Simple heuristic for headings
            if max_font_size > 20:
                markdown_lines.append(f"# {combined_text}")
            elif max_font_size > 16:
                markdown_lines.append(f"## {combined_text}")
            elif max_font_size > 14:
                markdown_lines.append(f"### {combined_text}")
            else:
                markdown_lines.append(combined_text)

            markdown_lines.append("") # add empty line after block

doc.close()
"\\n".join(markdown_lines)
      `;
      const markdownData = await pyodide.runPythonAsync(markdownCode);

      self.postMessage({
        type: "RESULT",
        jobId,
        result: markdownData,
      } satisfies PyodideWorkerResponse);
    } else if (type === "DOCX_TO_PDF") {
      if (!initPromise) initPromise = initializePyodide();
      await initPromise;
      if (!pyodide) throw new Error("Pyodide not initialized");
      if (!pdfBytes) throw new Error("No DOCX bytes provided");

      pyodide.globals.set("doc_bytes", pdfBytes);
      const code = `
import fitz
doc_fitz = fitz.open(stream=bytes(doc_bytes), filetype="docx")
pdf_bytes = doc_fitz.convert_to_pdf()
doc_fitz.close()
del doc_bytes
bytes(pdf_bytes)
      `;
      const pdfBytesProxy = await pyodide.runPythonAsync(code);
      const pdfBytesOut = pdfBytesProxy.toJs();
      const resultBytes = new Uint8Array(pdfBytesOut);
      self.postMessage({
        type: "RESULT",
        jobId,
        result: resultBytes,
      } satisfies PyodideWorkerResponse);
    } else if (type === "VERIFY_SIGNATURE") {
      if (!initPromise) initPromise = initializePyodide();
      await initPromise;
      if (!pyodide) throw new Error("Pyodide not initialized");
      if (!pdfBytes) throw new Error("No PDF bytes provided");

      pyodide.globals.set("pdf_bytes", pdfBytes);

      const pyCode = `
import fitz
import json

def verify_signature(pdf_bytes):
    doc = fitz.open("pdf", bytes(pdf_bytes))

    signatures = []
    has_signatures = False

    for page in doc:
        for widget in page.widgets():
            if widget.field_type == fitz.PDF_WIDGET_TYPE_SIGNATURE:
                has_signatures = True
                signatures.append({
                    "field_name": widget.field_name,
                    "is_signed": bool(widget.field_value)
                })

    doc.close()
    return json.dumps({
        "has_signatures": has_signatures,
        "signatures": signatures
    })

verify_signature(pdf_bytes)
`;
      const resultJson = await pyodide.runPythonAsync(pyCode);
      const resultData = JSON.parse(resultJson);

      self.postMessage({
        type: "RESULT",
        jobId,
        result: resultData,
      } satisfies PyodideWorkerResponse);

    } else if (type === "EXPORT_DARK") {
      if (!initPromise) initPromise = initializePyodide();
      await initPromise;
      if (!pyodide) throw new Error("Pyodide not initialized");
      if (!pdfBytes) throw new Error("No PDF bytes provided");

      pyodide.globals.set("doc_bytes", pdfBytes);
      const code = `
import fitz
import re

def invert_colors(match):
    parts = match.group(0).split()
    op = parts[-1]
    try:
        if op in (b'g', b'G'):
            val = float(parts[0])
            if val < 0.5: return b"0.85 " + op
        elif op in (b'rg', b'RG'):
            r, g, b = float(parts[0]), float(parts[1]), float(parts[2])
            lum = 0.299*r + 0.587*g + 0.114*b
            if lum < 0.5:
                return f"{1.0-r:.3g} {1.0-g:.3g} {1.0-b:.3g} ".encode() + op
    except Exception:
        pass
    return match.group(0)

doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")

for page in doc:
    page.clean_contents()
    for xref in page.get_contents():
        stream = doc.xref_stream(xref)
        if not stream: continue
        stream = re.sub(rb'\\b([0-9.]+)\\s+([gG])\\b', invert_colors, stream)
        stream = re.sub(rb'\\b([0-9.]+)\\s+([0-9.]+)\\s+([0-9.]+)\\s+([rR]g)\\b', invert_colors, stream)
        doc.update_stream(xref, stream)
    page.draw_rect(page.rect, color=(0.12, 0.12, 0.12), fill=(0.12, 0.12, 0.12), overlay=False)

    for img in page.get_images(full=True):
        xref = img[0]
        try:
            pix = fitz.Pixmap(doc, xref)
            if pix.n - pix.alpha < 3:
                pix = fitz.Pixmap(fitz.csRGB, pix)
            pix.gamma_with(1.5)
            page.replace_image(xref, pixmap=pix)
        except Exception:
            pass

out_bytes = doc.tobytes()
doc.close()
del doc_bytes
bytes(out_bytes)
`;
      const resultProxy = await pyodide.runPythonAsync(code);
      const resultBytes = resultProxy.toJs();
      const outputBytes = new Uint8Array(resultBytes);

      self.postMessage({
        type: "RESULT",
        jobId,
        result: outputBytes,
      } satisfies PyodideWorkerResponse);

} else if (type === "PDF_TO_DOCX") {
      if (!initPromise) initPromise = initializePyodide();
      await initPromise;
      if (!pyodide) throw new Error("Pyodide not initialized");
      if (!pdfBytes) throw new Error("No PDF bytes provided");

      pyodide.globals.set("doc_bytes", pdfBytes);
      const code = `
import fitz, docx, io
pdf_doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
docx_doc = docx.Document()
for page in pdf_doc:
    text = page.get_text()
    if text:
        docx_doc.add_paragraph(text)
pdf_doc.close()
buf = io.BytesIO()
docx_doc.save(buf)
del doc_bytes
bytes(buf.getvalue())
      `;
      const docxBytesProxy = await pyodide.runPythonAsync(code);
      const docxBytesOut = docxBytesProxy.toJs();
      const resultBytes = new Uint8Array(docxBytesOut);
      self.postMessage({
        type: "RESULT",
        jobId,
        result: resultBytes,
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
