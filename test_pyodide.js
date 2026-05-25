const { loadPyodide } = require("pyodide");

async function main() {
  const pyodide = await loadPyodide();
  const code = `
[bytes([1, 2, 3]), bytes([4, 5, 6])]
  `;
  const proxy = pyodide.runPython(code);
  const result = proxy.toJs();
  console.log(result);
}
main();
