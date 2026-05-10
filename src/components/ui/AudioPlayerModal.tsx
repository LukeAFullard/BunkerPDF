import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface AudioPlayerModalProps {
  isOpen: boolean;
  audioUrl: string | null;
  title?: string;
  onClose: () => void;
}

export function AudioPlayerModal({ isOpen, audioUrl, title = "Read Aloud", onClose }: AudioPlayerModalProps) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (isOpen && audioRef.current && audioUrl) {
      audioRef.current.play().catch(e => console.error("Auto-play prevented", e));
    } else if (!isOpen && audioRef.current) {
      audioRef.current.pause();
    }
  }, [isOpen, audioUrl]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-opacity">
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden transform transition-all"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 id="modal-title" className="text-xl font-semibold text-gray-800">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="p-2 -mr-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="Close audio player"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex flex-col items-center">
            {audioUrl ? (
              <audio
                ref={audioRef}
                src={audioUrl}
                controls
                className="w-full"
                aria-label="Audio playback controls"
              >
                Your browser does not support the audio element.
              </audio>
            ) : (
              <p className="text-gray-500">No audio available.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
