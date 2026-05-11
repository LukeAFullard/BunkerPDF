# BunkerPDF Implementation Plan

[Output truncated for brevity]

---

## 8. Next Strategic Steps

To begin executing this plan, the immediate priority is validating the foundational technology stack to ensure the UX vision is possible.

1. [x] **Repository Setup:** Initialize the frontend framework using Vite/React (chosen over Next.js for simpler WASM handling in a client-only app) and configure the bundler to handle WASM files correctly.
2. [x] **Proof of Concept 1 (The Fast Lane):** Implement a simple drag-and-drop zone that uses `pdf-lib` to instantly merge two PDFs and trigger a local download.
3. [x] **Proof of Concept 2 (The AI Lane):** Instantiate `transformers.js` in a Web Worker, pass it a hardcoded string of text containing a name and an email, and log the NER extraction results to the console.
4. [x] **WASM Memory Profiling:** Implement strict memory profiling in the CI/CD pipeline to continuously monitor memory footprints and prevent WASM OOM crashes during heavy loads.
5. [ ] **Add Github Action workflow:** Create `.github/workflows/ci.yml` that runs linting, tests and memory checks.

By isolating the JS-native manipulation from the WebGPU-accelerated AI early on, you secure the two main pillars of the application before tackling the heavy Pyodide integrations.

---
