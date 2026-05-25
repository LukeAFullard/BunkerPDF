import { loadPyodide } from "pyodide";

async function main() {
  const pyodide = await loadPyodide();
  const code = `
import zipfile
import io
zip_buffer = io.BytesIO()
with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
    zip_file.writestr('test.txt', b'Hello world')
bytes(zip_buffer.getvalue())
  `;
  const result = await pyodide.runPythonAsync(code);
  console.log(result.toJs());
}
main();
