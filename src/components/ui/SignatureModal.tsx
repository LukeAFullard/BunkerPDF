import { useRef } from "react";
import SignatureCanvas from "react-signature-canvas";

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (signatureImageBytes: Uint8Array) => void;
}

export function SignatureModal({ isOpen, onClose, onConfirm }: SignatureModalProps) {
  const sigCanvas = useRef<SignatureCanvas>(null);

  if (!isOpen) return null;

  const handleClear = () => {
    sigCanvas.current?.clear();
  };

  const handleConfirm = () => {
    if (sigCanvas.current?.isEmpty()) {
      alert("Please provide a signature first.");
      return;
    }

    // Get the base64 string
    const dataUrl = sigCanvas.current?.getTrimmedCanvas().toDataURL("image/png");
    if (dataUrl) {
      // Convert base64 to Uint8Array
      const base64Data = dataUrl.split(",")[1];
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      onConfirm(bytes);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-800">Sign Document</h2>
        </div>
        <div className="p-4">
          <p className="text-sm text-gray-600 mb-2">Draw your signature below:</p>
          <div className="border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 flex justify-center">
            <SignatureCanvas
              ref={sigCanvas}
              canvasProps={{
                width: 400,
                height: 200,
                className: "signature-canvas",
              }}
            />
          </div>
        </div>
        <div className="p-4 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
          <button
            onClick={handleClear}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 rounded-lg"
          >
            Clear
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
