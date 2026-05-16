with open("src/App.tsx", "r") as f:
    content = f.read()

replacement = """  const handleOptimize = async (doc: PDFDocument) => {
    setInputState({
      isOpen: true,
      title: "Optimize (Compress) PDF",
      message: "Select compression level (Higher compression may lower quality):",
      type: "select",
      options: [
        { label: "Low (Better Quality)", value: "low" },
        { label: "Medium (Balanced)", value: "medium" },
        { label: "High (Smaller Size)", value: "high" },
      ],
      defaultValue: "medium",
      onConfirm: async (level) => {
        setInputState((prev) => ({ ...prev, isOpen: false }));
        let isCancelled = false;
        startProcessing(`Optimizing PDF (${level} compression)...`, true, () => {
          isCancelled = true;
          stopProcessing();
        });

        try {
          const optimizedBytes = await optimizePdf(doc.file);
          if (isCancelled) return;

          const standardBuffer = new Uint8Array(optimizedBytes.length);
          standardBuffer.set(optimizedBytes);
          const newFile = new File([standardBuffer], doc.name, {
            type: "application/pdf",
          });
          // Pass operation metadata
          updateDocumentFile(doc.id, newFile, undefined, {
            type: 'optimize',
            params: { originalSize: doc.size, newSize: newFile.size }
          });
          addLog("Optimize", `Compressed and optimized document (${level} compression).`, doc.name);
        } catch (e) {
          if (isCancelled) return;
          console.error(e);
          setErrorState({
            isOpen: true,
            title: "Optimize Error",
            message: "An error occurred while optimizing the PDF.",
          });
        } finally {
          if (!isCancelled) stopProcessing();
        }
      },
      onCancel: () => setInputState((prev) => ({ ...prev, isOpen: false })),
    });
  };"""

import re
content = re.sub(r'  const handleOptimize = async \(doc: PDFDocument\) => \{\n    let isCancelled = false;\n    startProcessing\("Optimizing PDF\.\.\.", true, \(\) => \{\n      isCancelled = true;\n      stopProcessing\(\);\n    \}\);\n\n    try \{\n      const optimizedBytes = await optimizePdf\(doc\.file\);\n      if \(isCancelled\) return;\n\n      const standardBuffer = new Uint8Array\(optimizedBytes\.length\);\n      standardBuffer\.set\(optimizedBytes\);\n      const newFile = new File\(\[standardBuffer\], doc\.name, \{\n        type: "application/pdf",\n      \}\);\n      // Pass operation metadata\n      updateDocumentFile\(doc\.id, newFile, undefined, \{\n        type: \'optimize\',\n        params: \{ originalSize: doc\.size, newSize: newFile\.size \}\n      \}\);\n      addLog\("Optimize", "Compressed and optimized document\.", doc\.name\);\n    \} catch \(e\) \{\n      if \(isCancelled\) return;\n      console\.error\(e\);\n      setErrorState\(\{\n        isOpen: true,\n        title: "Optimize Error",\n        message: "An error occurred while optimizing the PDF\.",\n      \}\);\n    \} finally \{\n      if \(\!isCancelled\) stopProcessing\(\);\n    \}\n  \};', replacement, content)

with open("src/App.tsx", "w") as f:
    f.write(content)
