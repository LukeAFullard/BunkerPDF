with open("src/App.tsx", "r") as f:
    content = f.read()

# Replace handleResizePages
replacement_single = """  const handleResizePages = (doc: PDFDocument) => {
    setInputState({
      isOpen: true,
      title: "Resize Pages",
      message: "Select target size for all pages:",
      type: "select",
      options: [
        { label: "A4", value: "A4" },
        { label: "Letter", value: "Letter" },
      ],
      defaultValue: "A4",
      onConfirm: async (text) => {
        setInputState((prev) => ({ ...prev, isOpen: false }));
        if (!text) return;

        const sizeStr = text.trim().toLowerCase();
        if (sizeStr !== "a4" && sizeStr !== "letter") {
          setErrorState({
            isOpen: true,
            title: "Invalid Size",
            message: "Size must be 'A4' or 'Letter'.",
          });
          return;
        }

        let isCancelled = false;
        startProcessing(`Resizing pages to ${sizeStr.toUpperCase()}...`, true, () => {
          isCancelled = true;
          stopProcessing();
        });

        try {
          const resizedBytes = await resizePages(doc.file, sizeStr.toUpperCase());
          if (isCancelled) return;

          const standardBuffer = new Uint8Array(resizedBytes.length);
          standardBuffer.set(resizedBytes);
          const newFile = new File([standardBuffer], doc.name, {
            type: "application/pdf",
          });"""

import re
content = re.sub(r'  const handleResizePages = \(doc: PDFDocument\) => \{\n    setInputState\(\{\n      isOpen: true,\n      title: "Resize Pages",\n      message: "Enter target size \(A4 or Letter\):",\n      placeholder: "A4",\n      defaultValue: "A4",\n      onConfirm: async \(text\) => \{\n        setInputState\(\(prev\) => \(\{ \.\.\.prev, isOpen: false \}\)\);\n        if \(\!text\) return;\n\n        const sizeStr = text\.trim\(\)\.toLowerCase\(\);\n        if \(sizeStr \!== "a4" && sizeStr \!== "letter"\) \{\n          setErrorState\(\{\n            isOpen: true,\n            title: "Invalid Size",\n            message: "Size must be \'A4\' or \'Letter\'\.",\n          \}\);\n          return;\n        \}\n\n        let isCancelled = false;\n        startProcessing\(`Resizing pages to \$\{sizeStr\.toUpperCase\(\)\}\.\.\.`, true, \(\) => \{\n          isCancelled = true;\n          stopProcessing\(\);\n        \}\);\n\n        try \{\n          const resizedBytes = await resizePages\(doc\.file, sizeStr\.toUpperCase\(\)\);\n          if \(isCancelled\) return;\n\n          const standardBuffer = new Uint8Array\(resizedBytes\.length\);\n          standardBuffer\.set\(resizedBytes\);\n          const newFile = new File\(\[standardBuffer\], doc\.name, \{\n            type: "application/pdf",\n          \}\);', replacement_single, content)

# Replace handleBatchResize
replacement_batch = """  const handleBatchResize = () => {
    setIsBatchMenuOpen(false);
    setInputState({
      isOpen: true,
      title: "Batch Resize Pages",
      message: "Select target size for all pages across all open documents:",
      type: "select",
      options: [
        { label: "A4", value: "A4" },
        { label: "Letter", value: "Letter" },
      ],
      defaultValue: "A4",
      onConfirm: async (text) => {
        setInputState((prev) => ({ ...prev, isOpen: false }));
        if (!text) return;
        const sizeStr = text.toUpperCase().trim();
        if (sizeStr !== "A4" && sizeStr !== "LETTER") {
          setErrorState({
            isOpen: true,
            title: "Invalid Size",
            message: "Please enter either 'A4' or 'Letter'.",
          });
          return;
        }

        let isCancelled = false;
        startProcessing(`Batch Resizing to ${sizeStr}...`, true, () => {
          isCancelled = true;
          stopProcessing();
        });

        try {
          for (const doc of documents) {
            if (isCancelled) break;
            useProcessingStore.getState().updateStage(`Resizing ${doc.name}...`);
            const resizedBytes = await resizePages(doc.file, sizeStr as "A4" | "Letter");
            if (isCancelled) return;
            const standardBuffer = new Uint8Array(resizedBytes.length);
            standardBuffer.set(resizedBytes);
            const newFile = new File([standardBuffer], doc.name, {
              type: "application/pdf",
            });"""

content = re.sub(r'  const handleBatchResize = \(\) => \{\n    setIsBatchMenuOpen\(false\);\n    setInputState\(\{\n      isOpen: true,\n      title: "Batch Resize Pages",\n      message: "Select target size for all pages across all open documents\. Enter \'A4\' or \'Letter\':",\n      placeholder: "A4",\n      onConfirm: async \(text\) => \{\n        setInputState\(\(prev\) => \(\{ \.\.\.prev, isOpen: false \}\)\);\n        if \(\!text\) return;\n        const sizeStr = text\.toUpperCase\(\)\.trim\(\);\n        if \(sizeStr \!== "A4" && sizeStr \!== "LETTER"\) \{\n          setErrorState\(\{\n            isOpen: true,\n            title: "Invalid Size",\n            message: "Please enter either \'A4\' or \'Letter\'\.",\n          \}\);\n          return;\n        \}\n\n        let isCancelled = false;\n        startProcessing\(`Batch Resizing to \$\{sizeStr\}\.\.\.`, true, \(\) => \{\n          isCancelled = true;\n          stopProcessing\(\);\n        \}\);\n\n        try \{\n          for \(const doc of documents\) \{\n            if \(isCancelled\) break;\n            useProcessingStore\.getState\(\)\.updateStage\(`Resizing \$\{doc\.name\}\.\.\.`\);\n            const resizedBytes = await resizePages\(doc\.file, sizeStr as "A4" \| "Letter"\);\n            if \(isCancelled\) return;\n            const standardBuffer = new Uint8Array\(resizedBytes\.length\);\n            standardBuffer\.set\(resizedBytes\);\n            const newFile = new File\(\[standardBuffer\], doc\.name, \{\n              type: "application/pdf",\n            \}\);', replacement_batch, content)

# Replace handleEncrypt
replacement_encrypt = """  const handleEncrypt = (doc: PDFDocument) => {
    setInputState({
      isOpen: true,
      title: "Protect PDF",
      message: "Enter a password to encrypt this PDF:",
      placeholder: "Secure password",
      type: "password",
      onConfirm: async (password) => {
        setInputState((prev) => ({ ...prev, isOpen: false }));
        if (!password) return;

        let isCancelled = false;
        startProcessing("Encrypting PDF...", true, () => {
          isCancelled = true;
          stopProcessing();
        });"""

content = re.sub(r'  const handleEncrypt = \(doc: PDFDocument\) => \{\n    setInputState\(\{\n      isOpen: true,\n      title: "Protect PDF",\n      message: "Enter a password to encrypt this PDF:",\n      placeholder: "Secure password",\n      onConfirm: async \(password\) => \{\n        setInputState\(\(prev\) => \(\{ \.\.\.prev, isOpen: false \}\)\);\n        if \(\!password\) return;\n\n        let isCancelled = false;\n        startProcessing\("Encrypting PDF\.\.\.", true, \(\) => \{\n          isCancelled = true;\n          stopProcessing\(\);\n        \}\);', replacement_encrypt, content)

# Replace handleUnlock
replacement_unlock = """  const handleUnlock = (doc: PDFDocument) => {
    setInputState({
      isOpen: true,
      title: "Unlock PDF",
      message: "Enter the password to unlock this PDF:",
      placeholder: "Password",
      type: "password",
      onConfirm: async (password) => {
        let isCancelled = false;
        if (!password) return;
        startProcessing("Unlocking document...", true, () => {
          isCancelled = true;
        });"""

content = re.sub(r'  const handleUnlock = \(doc: PDFDocument\) => \{\n    setInputState\(\{\n      isOpen: true,\n      title: "Unlock PDF",\n      message: "Enter the password to unlock this PDF:",\n      placeholder: "Password",\n      onConfirm: async \(password\) => \{\n        let isCancelled = false;\n        if \(\!password\) return;\n        startProcessing\("Unlocking document\.\.\.", true, \(\) => \{\n          isCancelled = true;\n        \}\);', replacement_unlock, content)

# Replace sanitize behavior
replacement_sanitize = """  const handleSanitize = async (doc: PDFDocument) => {
    setInputState({
      isOpen: true,
      title: "Sanitize PDF",
      message: (
        <ul className="list-disc pl-5 text-sm text-gray-700">
          <li>Remove all metadata (author, history, etc.)</li>
          <li>Flatten all annotations and interactive elements</li>
          <li>Remove any hidden text or scripts</li>
        </ul>
      ),
      type: "confirm",
      onConfirm: async () => {
        setInputState((prev) => ({ ...prev, isOpen: false }));
        let isCancelled = false;
        startProcessing("Sanitizing PDF...", true, () => {
          isCancelled = true;
          stopProcessing();
        });

        try {
          const arrayBuffer = await doc.file.arrayBuffer();
          const pdfBytes = new Uint8Array(arrayBuffer);

          const { fakeRedactions, bytes } = await sanitizePdf(pdfBytes);
          if (isCancelled) return;

          const standardBuffer = new Uint8Array(bytes.length);
          standardBuffer.set(bytes);
          const newFile = new File([standardBuffer], doc.name, {
            type: "application/pdf",
          });
          await updateDocumentFile(doc.id, newFile);
          addLog("Sanitize", "Sanitized document by removing metadata and scripts.", doc.name);

          setErrorState({
            isOpen: true,
            title: "Sanitize Complete",
            message: (
              <ul className="list-disc pl-5 text-sm text-gray-700">
                <li>Metadata stripped (author, history)</li>
                <li>Annotations and interactive elements flattened</li>
                <li>Hidden text/scripts removed</li>
                <li>Fake redactions verified: {fakeRedactions} found</li>
              </ul>
            ),
          });
        } catch (e) {
          if (isCancelled) return;
          console.error(e);
          setErrorState({
            isOpen: true,
            title: "Sanitize Error",
            message: "An error occurred while sanitizing the PDF.",
          });
        } finally {
          if (!isCancelled) stopProcessing();
        }
      },
      onCancel: () => setInputState((prev) => ({ ...prev, isOpen: false })),
    });
  };"""

content = re.sub(r'  const handleSanitize = async \(doc: PDFDocument\) => \{\n\n    let isCancelled = false;\n    startProcessing\("Sanitizing PDF\.\.\.", true, \(\) => \{\n      isCancelled = true;\n      stopProcessing\(\);\n    \}\);\n\n    try \{\n      const arrayBuffer = await doc\.file\.arrayBuffer\(\);\n      const pdfBytes = new Uint8Array\(arrayBuffer\);\n\n      const \{ fakeRedactions, bytes \} = await sanitizePdf\(pdfBytes\);\n      if \(isCancelled\) return;\n\n      const standardBuffer = new Uint8Array\(bytes\.length\);\n      standardBuffer\.set\(bytes\);\n      const newFile = new File\(\[standardBuffer\], doc\.name, \{\n        type: "application/pdf",\n      \}\);\n      await updateDocumentFile\(doc\.id, newFile\);\n      addLog\("Sanitize", "Sanitized document by removing metadata and scripts\.", doc\.name\);\n\n      setErrorState\(\{\n        isOpen: true,\n        title: "Sanitize Complete",\n        message: \(\n          <ul className="list-disc pl-5 text-sm text-gray-700">\n            <li>Metadata stripped \(author, history\)</li>\n            <li>Annotations and interactive elements flattened</li>\n            <li>Hidden text/scripts removed</li>\n            <li>Fake redactions verified: \{fakeRedactions\} found</li>\n          </ul>\n        \),\n      \}\);\n    \} catch \(e\) \{\n      if \(isCancelled\) return;\n      console\.error\(e\);\n      setErrorState\(\{\n        isOpen: true,\n        title: "Sanitize Error",\n        message: "An error occurred while sanitizing the PDF\.",\n      \}\);\n    \} finally \{\n      if \(\!isCancelled\) stopProcessing\(\);\n    \}\n  \};', replacement_sanitize, content)


with open("src/App.tsx", "w") as f:
    f.write(content)
