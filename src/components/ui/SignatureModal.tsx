import { useRef, useState, useEffect } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Upload, X, PenTool, Image as ImageIcon } from "lucide-react";
import { useDropzone } from "react-dropzone";

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (signatureImageBytes: Uint8Array) => void;
}

export function SignatureModal({ isOpen, onClose, onConfirm }: SignatureModalProps) {
  const sigCanvas = useRef<SignatureCanvas>(null);
  const [activeTab, setActiveTab] = useState<"draw" | "upload">("draw");
  const [uploadedImageBytes, setUploadedImageBytes] = useState<Uint8Array | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        setActiveTab("draw");
        setUploadedImageBytes(null);
        setUploadedImageUrl((prevUrl) => {
          if (prevUrl) {
            URL.revokeObjectURL(prevUrl);
          }
          return null;
        });
        sigCanvas.current?.clear();
      }, 0);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (uploadedImageUrl) {
        URL.revokeObjectURL(uploadedImageUrl);
      }
    };
  }, [uploadedImageUrl]);

  const onDrop = (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL('image/png');
          const base64Data = dataUrl.split(",")[1];
          const binaryString = atob(base64Data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          setUploadedImageBytes(bytes);
          setUploadedImageUrl(objectUrl);
        } else {
          URL.revokeObjectURL(objectUrl);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
      };
      img.src = objectUrl;
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
    },
    maxFiles: 1,
  });

  if (!isOpen) return null;

  const handleClear = () => {
    if (activeTab === "draw") {
      sigCanvas.current?.clear();
    } else {
      setUploadedImageBytes(null);
      if (uploadedImageUrl) {
        URL.revokeObjectURL(uploadedImageUrl);
      }
      setUploadedImageUrl(null);
    }
  };

  const handleConfirm = () => {
    if (activeTab === "draw") {
      if (sigCanvas.current?.isEmpty()) {
        alert("Please provide a signature first.");
        return;
      }

      const dataUrl = sigCanvas.current?.getTrimmedCanvas().toDataURL("image/png");
      if (dataUrl) {
        const base64Data = dataUrl.split(",")[1];
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        onConfirm(bytes);
      }
    } else {
      if (!uploadedImageBytes) {
        alert("Please upload an image first.");
        return;
      }
      onConfirm(uploadedImageBytes);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-800">Sign Document</h2>
        </div>

        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab("draw")}
            className={`flex-1 py-3 px-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              activeTab === "draw"
                ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            <PenTool size={16} />
            Draw
          </button>
          <button
            onClick={() => setActiveTab("upload")}
            className={`flex-1 py-3 px-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              activeTab === "upload"
                ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            <ImageIcon size={16} />
            Upload
          </button>
        </div>

        <div className="p-4">
          {activeTab === "draw" ? (
            <>
              <p className="text-sm text-gray-600 mb-2">Draw your signature below:</p>
              <div className="border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 flex justify-center">
                <SignatureCanvas
                  ref={sigCanvas}
                  canvasProps={{
                    width: 400,
                    height: 200,
                    className: "signature-canvas touch-none",
                  }}
                />
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-2">Upload an image of your signature:</p>
              {uploadedImageUrl ? (
                <div className="relative border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 flex justify-center items-center h-[204px]">
                  <img
                    src={uploadedImageUrl}
                    alt="Uploaded signature"
                    className="max-h-full max-w-full object-contain p-2"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClear();
                    }}
                    className="absolute top-2 right-2 p-1.5 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-lg bg-gray-50 flex flex-col justify-center items-center h-[204px] cursor-pointer transition-colors ${
                    isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:bg-gray-100"
                  }`}
                >
                  <input {...getInputProps()} />
                  <Upload className="w-8 h-8 text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600 font-medium">Click or drag image to upload</p>
                  <p className="text-xs text-gray-500 mt-1">Supports JPG, PNG, WEBP</p>
                </div>
              )}
            </>
          )}
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
