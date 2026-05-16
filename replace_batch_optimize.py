with open("src/App.tsx", "r") as f:
    content = f.read()

replacement = """  const handleBatchOptimize = () => {
    setIsBatchMenuOpen(false);
    setInputState({
      isOpen: true,
      title: "Batch Optimize (Compress)",
      message: "Select compression level for all documents:",
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
        startProcessing(`Batch Optimizing (${level} compression)...`, true, () => {
          isCancelled = true;
          stopProcessing();
        });

        try {
          for (const doc of documents) {
            if (isCancelled) break;
            useProcessingStore.getState().updateStage(`Optimizing ${doc.name}...`);
            const optimizedBytes = await optimizePdf(doc.file);
            if (isCancelled) return;
            const standardBuffer = new Uint8Array(optimizedBytes.length);
            standardBuffer.set(optimizedBytes);
            const newFile = new File([standardBuffer], doc.name, {
              type: "application/pdf",
            });
            await updateDocumentFile(doc.id, newFile);
            addLog("Batch Optimize", `Optimized PDF to reduce file size (${level} compression)`, doc.name);
          }
          if (!isCancelled) {
            useUIStore.getState().showFeedbackPrompt("Batch Optimize");
          }
        } catch (e) {
          if (!isCancelled) {
            console.error(e);
            setErrorState({
              isOpen: true,
              title: "Batch Optimize Error",
              message: "An error occurred during batch optimization.",
            });
          }
        } finally {
          if (!isCancelled) stopProcessing();
        }
      },
      onCancel: () => setInputState((prev) => ({ ...prev, isOpen: false })),
    });
  };"""

import re
content = re.sub(r'  const handleBatchOptimize = async \(\) => \{\n    setIsBatchMenuOpen\(false\);\n    let isCancelled = false;\n    startProcessing\("Batch Optimizing\.\.\.", true, \(\) => \{\n      isCancelled = true;\n      stopProcessing\(\);\n    \}\);\n\n    try \{\n      for \(const doc of documents\) \{\n        if \(isCancelled\) break;\n        useProcessingStore\.getState\(\)\.updateStage\(`Optimizing \$\{doc\.name\}\.\.\.`\);\n        const optimizedBytes = await optimizePdf\(doc\.file\);\n        if \(isCancelled\) return;\n        const standardBuffer = new Uint8Array\(optimizedBytes\.length\);\n        standardBuffer\.set\(optimizedBytes\);\n        const newFile = new File\(\[standardBuffer\], doc\.name, \{\n          type: "application/pdf",\n        \}\);\n        await updateDocumentFile\(doc\.id, newFile\);\n        addLog\("Batch Optimize", "Optimized PDF to reduce file size", doc\.name\);\n      \}\n      if \(\!isCancelled\) \{\n        useUIStore\.getState\(\)\.showFeedbackPrompt\("Batch Optimize"\);\n      \}\n    \} catch \(e\) \{\n      if \(\!isCancelled\) \{\n        console\.error\(e\);\n        setErrorState\(\{\n          isOpen: true,\n          title: "Batch Optimize Error",\n          message: "An error occurred during batch optimization\.",\n        \}\);\n      \}\n    \} finally \{\n      if \(\!isCancelled\) stopProcessing\(\);\n    \}\n  \};', replacement, content)

with open("src/App.tsx", "w") as f:
    f.write(content)
