import { loadPyodide } from 'pyodide';
async function test() {
  const pyodide = await loadPyodide();
  await pyodide.loadPackage('micropip');
  const micropip = pyodide.pyimport('micropip');
  console.log("Installing pymupdf and python-docx...");
  await micropip.install('pymupdf');
  await micropip.install('python-docx');
  console.log("Success!");
}
test().catch(console.error);
