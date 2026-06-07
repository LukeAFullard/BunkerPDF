const fs = require('fs');
const filepath = 'src/components/pdf/InteractiveSmartHighlightModal.tsx';
let content = fs.readFileSync(filepath, 'utf-8');

// Move loadDocument to be declared before useEffect
const loadDocumentStr = `
  const loadDocument = async () => {
    setIsLoading(true);
    try {
      const bytes = await doc!.file.arrayBuffer();

      const engine = await getConfiguredLiteParse({ outputFormat: "json" });
      const result = await engine.parse(new Uint8Array(bytes.slice(0)));
      if (result && result.pages) {
        setTextItems(result.pages);
      }

      const loadingTask = loadPdfDocument(bytes.slice(0));
      const pdf = await loadingTask.promise;
      setPdfDoc(pdf);
      setTotalPages(pdf.numPages);
      setCurrentPage(1);
    } catch (err: any) {
      setError(err.message || "Failed to load document");
    } finally {
      setIsLoading(false);
    }
  };
`;

content = content.replace(loadDocumentStr.trim(), '');
const useEffectIndex = content.indexOf('useEffect(() => {\n    if (isOpen && doc)');
content = content.substring(0, useEffectIndex) + loadDocumentStr + '\n  ' + content.substring(useEffectIndex);

const renderPageStr = `
  const renderPage = async (pageNum: number, pdf: pdfjsLib.PDFDocumentProxy) => {
    setIsLoading(true);
    try {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }

      const page = await pdf.getPage(pageNum);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext('2d');
      if (!context) return;

      const viewportHeight = window.innerHeight * 0.6;
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const baseScale = viewportHeight / unscaledViewport.height;
      const scale = baseScale * zoomLevel;
      const viewport = page.getViewport({ scale });

      setPageDimensions({ width: viewport.width, height: viewport.height });

      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = Math.floor(viewport.width) + "px";
      canvas.style.height = Math.floor(viewport.height) + "px";

      const transform = outputScale !== 1
        ? [outputScale, 0, 0, outputScale, 0, 0]
        : undefined;

      const renderContext: any = {
        canvasContext: context,
        transform: transform as number[] | undefined,
        viewport: viewport,
      };

      renderTaskRef.current = page.render(renderContext);
      await renderTaskRef.current.promise;
    } catch (err: any) {
      if (err instanceof pdfjsLib.RenderingCancelledException) {
      } else {
        console.error("Error rendering page", err);
      }
    } finally {
      setIsLoading(false);
    }
  };
`;

content = content.replace(renderPageStr.trim(), '');
const useEffectRenderIndex = content.indexOf('useEffect(() => {\n    if (pdfDoc)');
content = content.substring(0, useEffectRenderIndex) + renderPageStr + '\n  ' + content.substring(useEffectRenderIndex);


fs.writeFileSync(filepath, content);
console.log("Fixed again 2");
