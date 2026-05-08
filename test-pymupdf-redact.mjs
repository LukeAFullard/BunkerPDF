import { loadPyodide } from 'pyodide';
import * as fs from 'fs';

async function test() {
  const pyodide = await loadPyodide();
  await pyodide.loadPackage('micropip');
  const micropip = pyodide.pyimport('micropip');
  await micropip.install('pymupdf');

  // Create a dummy PDF with some text to redact using pdf-lib
  // We'll just run python code to create it if possible, but pymupdf can do it
  const pycode = `
import fitz
doc = fitz.open()
page = doc.new_page()
page.insert_text((50, 50), "Hello Jules, your email is jules@example.com", fontsize=12)
doc.save("test.pdf")

# Now redact
doc = fitz.open("test.pdf")
page = doc[0]
rl = page.search_for("Jules")
for r in rl:
    page.add_redact_annot(r, fill=(0, 0, 0))
page.apply_redactions()
doc.save("test_redacted.pdf")
doc.close()
  `;
  await pyodide.runPythonAsync(pycode);
  console.log("Python code executed.");
}
test().catch(console.error);
