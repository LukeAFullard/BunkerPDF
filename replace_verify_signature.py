with open("src/App.tsx", "r") as f:
    content = f.read()

replacement = """      if (!result.has_signatures) {
        setErrorState({
          isOpen: true,
          title: "Signature Verification",
          message: "No digital signatures were found in this document.",
        });
      } else {
        const allSigned = result.signatures.every(sig => sig.is_signed);
        setErrorState({
          isOpen: true,
          title: "Signature Verification Complete",
          message: (
            <div>
              <p className={`mb-2 font-semibold ${allSigned ? 'text-green-700' : 'text-orange-700'}`}>
                {allSigned
                  ? "All signatures are Valid and match their respective fields."
                  : "Some signature fields are incomplete or unsigned."}
              </p>
              <p className="mb-2 text-gray-800 font-semibold">
                Found {result.signatures.length} signature field(s):
              </p>
              <ul className="list-disc pl-5 text-sm text-gray-700 max-h-40 overflow-y-auto">
                {result.signatures.map((sig, idx) => (
                  <li key={idx} className="break-all">
                    <span className="font-medium">{sig.field_name}:</span>{" "}
                    {sig.is_signed ? (
                      <span className="text-green-600 font-semibold">Valid Signature</span>
                    ) : (
                      <span className="text-orange-600 font-semibold">Missing Signature</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ),
        });
      }"""

import re
content = re.sub(r'      if \(\!result\.has_signatures\) \{\n        setErrorState\(\{\n          isOpen: true,\n          title: "Signature Verification",\n          message: "No digital signatures were found in this document\.",\n        \}\);\n      \} else \{\n        setErrorState\(\{\n          isOpen: true,\n          title: "Signature Verification Complete",\n          message: \(\n            <div>\n              <p className="mb-2 text-gray-800 font-semibold">\n                Found \{result\.signatures\.length\} signature field\(s\):\n              </p>\n              <ul className="list-disc pl-5 text-sm text-gray-700 max-h-40 overflow-y-auto">\n                \{result\.signatures\.map\(\(sig, idx\) => \(\n                  <li key=\{idx\} className="break-all">\n                    <span className="font-medium">\{sig\.field_name\}:</span>\{" "\}\n                    \{sig\.is_signed \? \(\n                      <span className="text-green-600 font-semibold">Signed</span>\n                    \) : \(\n                      <span className="text-orange-600 font-semibold">Unsigned</span>\n                    \)\}\n                  </li>\n                \)\)\}\n              </ul>\n            </div>\n          \),\n        \}\);\n      \}', replacement, content)

with open("src/App.tsx", "w") as f:
    f.write(content)
