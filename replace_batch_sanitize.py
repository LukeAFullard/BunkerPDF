with open("src/App.tsx", "r") as f:
    content = f.read()

replacement = """  const handleBatchSanitize = () => {
    setIsBatchMenuOpen(false);
    setInputState({
      isOpen: true,
      title: "Batch Sanitize",
      message: (
        <ul className="list-disc pl-5 text-sm text-gray-700">
          <li>Remove all metadata (author, history, etc.) across all documents</li>
          <li>Flatten all annotations and interactive elements</li>
          <li>Remove any hidden text or scripts</li>
        </ul>
      ),
      type: "confirm",
      onConfirm: async () => {
        setInputState((prev) => ({ ...prev, isOpen: false }));
        let isCancelled = false;
        startProcessing("Batch Sanitizing...", true, () => {
          isCancelled = true;
          stopProcessing();
        });

        try {
          for (const doc of documents) {
            if (isCancelled) break;
            useProcessingStore.getState().updateStage(`Sanitizing ${doc.name}...`);
            const docBytes = new Uint8Array(await doc.file.arrayBuffer());
            const sanitizedResult = await sanitizePdf(docBytes);
            const sanitizedBytes = sanitizedResult.bytes;
            const standardBuffer = new Uint8Array(sanitizedBytes.length);
            standardBuffer.set(sanitizedBytes);
            const newFile = new File([standardBuffer], doc.name, {
              type: "application/pdf",
            });
            await updateDocumentFile(doc.id, newFile);
            addLog("Batch Sanitize", "Removed metadata and flattened form fields", doc.name);
          }
          if (!isCancelled) {
            useUIStore.getState().showFeedbackPrompt("Batch Sanitize");
          }
        } catch (e) {
          if (!isCancelled) {
            console.error(e);
            setErrorState({
              isOpen: true,
              title: "Batch Sanitize Error",
              message: "An error occurred during batch sanitization.",
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
content = re.sub(r'  const handleBatchSanitize = async \(\) => \{\n    setIsBatchMenuOpen\(false\);\n    let isCancelled = false;\n    startProcessing\("Batch Sanitizing\.\.\.", true, \(\) => \{\n      isCancelled = true;\n      stopProcessing\(\);\n    \}\);\n\n    try \{\n      for \(const doc of documents\) \{\n        if \(isCancelled\) break;\n        useProcessingStore\.getState\(\)\.updateStage\(`Sanitizing \$\{doc\.name\}\.\.\.`\);\n        const docBytes = new Uint8Array\(await doc\.file\.arrayBuffer\(\)\);\n        const sanitizedResult = await sanitizePdf\(docBytes\);\n        const sanitizedBytes = sanitizedResult\.bytes;\n        const standardBuffer = new Uint8Array\(sanitizedBytes\.length\);\n        standardBuffer\.set\(sanitizedBytes\);\n        const newFile = new File\(\[standardBuffer\], doc\.name, \{\n          type: "application/pdf",\n        \}\);\n        await updateDocumentFile\(doc\.id, newFile\);\n        addLog\("Batch Sanitize", "Removed metadata and flattened form fields", doc\.name\);\n      \}\n      if \(\!isCancelled\) \{\n        useUIStore\.getState\(\)\.showFeedbackPrompt\("Batch Sanitize"\);\n      \}\n    \} catch \(e\) \{\n      if \(\!isCancelled\) \{\n        console\.error\(e\);\n        setErrorState\(\{\n          isOpen: true,\n          title: "Batch Sanitize Error",\n          message: "An error occurred during batch sanitization\.",\n        \}\);\n      \}\n    \} finally \{\n      if \(\!isCancelled\) stopProcessing\(\);\n    \}\n  \};', replacement, content)

with open("src/App.tsx", "w") as f:
    f.write(content)
