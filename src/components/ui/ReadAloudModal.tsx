import { useEffect, useRef, useState } from "react";
import { X, Play, Pause, SkipForward, SkipBack } from "lucide-react";

interface ReadAloudModalProps {
  isOpen: boolean;
  text: string;
  title?: string;
  onClose: () => void;
}

export function ReadAloudModal({ isOpen, text, title = "Read Aloud", onClose }: ReadAloudModalProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const words = text.split(/\s+/);

  // Use utterance ref to be able to cancel it
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (!isOpen) {
      window.speechSynthesis.cancel();
      return;
    }

    if (text) {
      const utterance = new SpeechSynthesisUtterance(text);

      utterance.onboundary = (event) => {
        if (event.name === 'word') {
          // Approximate word index by character offset
          const textUpToBoundary = text.substring(0, event.charIndex);
          const wordsUpToBoundary = textUpToBoundary.trim().split(/\s+/).length;
          setCurrentWordIndex(Math.max(0, wordsUpToBoundary - 1));
        }
      };

      utterance.onend = () => {
        setIsPlaying(false);
        setCurrentWordIndex(words.length);
      };

      utteranceRef.current = utterance;
    }
  }, [isOpen, text, words.length]);

  const handleClose = () => {
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setCurrentWordIndex(0);
    onClose();
  };

  const togglePlayPause = () => {
    if (isPlaying) {
      window.speechSynthesis.pause();
      setIsPlaying(false);
    } else {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      } else {
        if (utteranceRef.current) {
          window.speechSynthesis.speak(utteranceRef.current);
        }
      }
      setIsPlaying(true);
    }
  };

  const skipForward = () => {
    // Rough skip forward (not natively well-supported, so we just restart from a new substring if needed, or just let it play)
    // For a robust implementation, we'd slice the text and restart.
    // For now, we'll just stop and start.
    window.speechSynthesis.cancel();
    setIsPlaying(false);
  };

  const skipBack = () => {
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setCurrentWordIndex(0);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-opacity">
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden transform transition-all flex flex-col max-h-[80vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
          <h2 id="modal-title" className="text-xl font-semibold text-gray-800 truncate pr-4">
            {title}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 -mr-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Close reader"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 text-lg leading-relaxed text-gray-700">
          {words.map((word, i) => (
            <span
              key={i}
              className={`mr-1 px-0.5 rounded transition-colors ${
                i === currentWordIndex ? "bg-yellow-200 text-black font-medium" : ""
              }`}
            >
              {word}
            </span>
          ))}
        </div>

        <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-center items-center gap-4">
          <button
            onClick={skipBack}
            className="p-3 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Stop and reset"
          >
            <SkipBack size={24} />
          </button>

          <button
            onClick={togglePlayPause}
            className="p-4 bg-blue-600 text-white hover:bg-blue-700 rounded-full transition-colors shadow-md hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause size={28} /> : <Play size={28} className="ml-1" />}
          </button>

          <button
            onClick={skipForward}
            className="p-3 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Stop"
          >
            <SkipForward size={24} />
          </button>
        </div>
      </div>
    </div>
  );
}
