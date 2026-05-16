import { useEffect, useState, useRef } from "react";
import { X, Play, Pause, Square, FastForward, Rewind } from "lucide-react";

interface AudioPlayerModalProps {
  isOpen: boolean;
  audioUrl: string | null; // This is now actually a text blob URL
  title?: string;
  onClose: () => void;
}

export function AudioPlayerModal({ isOpen, audioUrl, title = "Read Aloud", onClose }: AudioPlayerModalProps) {
  const [text, setText] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined") {
      synthRef.current = window.speechSynthesis;
    }
  }, []);

  useEffect(() => {
    if (isOpen && audioUrl) {
      // Fetch the text from the blob URL
      fetch(audioUrl)
        .then((res) => res.text())
        .then((data) => {
          setText(data);
          startSpeaking(data);
        })
        .catch(console.error);
    } else if (!isOpen) {
      stopSpeaking();
      setText("");
    }

    return () => {
      stopSpeaking();
    };
  }, [isOpen, audioUrl]);

  const startSpeaking = (textToSpeak: string, newOffset: number = 0) => {
    if (!synthRef.current) return;

    synthRef.current.cancel(); // Clear queue

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utteranceRef.current = utterance;

    utterance.onstart = () => {
      setIsPlaying(true);
      setIsPaused(false);
      setCurrentWordIndex(newOffset);
    };

    utterance.onend = () => {
      setIsPlaying(false);
      setIsPaused(false);
    };

    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        setCurrentWordIndex(newOffset + event.charIndex);
      }
    };

    synthRef.current.speak(utterance);
  };

  const handlePlayPause = () => {
    if (!synthRef.current) return;

    if (isPaused) {
      synthRef.current.resume();
      setIsPaused(false);
      setIsPlaying(true);
    } else if (isPlaying) {
      synthRef.current.pause();
      setIsPaused(true);
      setIsPlaying(false);
    } else {
      startSpeaking(text);
    }
  };

  const stopSpeaking = () => {
    if (!synthRef.current) return;
    synthRef.current.cancel();
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentWordIndex(0);
  };

  const handleClose = () => {
    stopSpeaking();
    onClose();
  };

  // Skip forward/backward roughly by slicing text
  const handleSkip = (direction: 1 | -1) => {
    if (!synthRef.current || !text) return;

    synthRef.current.cancel();

    // Approximate a jump (e.g. 100 characters)
    let newIndex = currentWordIndex + (direction * 100);
    if (newIndex < 0) newIndex = 0;
    if (newIndex > text.length) newIndex = text.length;

    const remainingText = text.substring(newIndex);
    startSpeaking(remainingText, newIndex);
  };

  if (!isOpen) return null;

  // For highlighting, just show a chunk of text around the current index
  const startIdx = Math.max(0, currentWordIndex - 50);
  const endIdx = Math.min(text.length, currentWordIndex + 150);
  const visibleText = text.substring(startIdx, endIdx);

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
              onClick={handleClose}
              className="p-2 -mr-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="Close audio player"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex flex-col items-center gap-4">
            <div className="w-full h-32 p-3 bg-gray-50 rounded-lg overflow-hidden border border-gray-100 text-sm text-gray-700 leading-relaxed text-center flex flex-col justify-center relative">
              {text ? (
                <>
                  <span className="opacity-50">...</span>
                  <span>{visibleText}</span>
                  <span className="opacity-50">...</span>
                </>
              ) : (
                <span className="text-gray-400 italic">Loading text...</span>
              )}
            </div>

            <div className="flex items-center gap-4 mt-2">
              <button
                onClick={() => handleSkip(-1)}
                className="p-3 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                aria-label="Rewind"
              >
                <Rewind size={24} />
              </button>

              <button
                onClick={handlePlayPause}
                className="p-4 bg-blue-600 text-white hover:bg-blue-700 rounded-full transition-colors shadow-md flex items-center justify-center"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause size={28} /> : <Play size={28} className="ml-1" />}
              </button>

              <button
                onClick={stopSpeaking}
                className="p-3 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                aria-label="Stop"
              >
                <Square size={24} />
              </button>

              <button
                onClick={() => handleSkip(1)}
                className="p-3 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                aria-label="Fast forward"
              >
                <FastForward size={24} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
