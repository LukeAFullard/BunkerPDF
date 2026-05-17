import { useEffect, useState } from "react";
import { X, Play, Pause, Square } from "lucide-react";

interface AudioPlayerModalProps {
  isOpen: boolean;
  text: string | null;
  title?: string;
  onClose: () => void;
}

export function AudioPlayerModal({ isOpen, text, title = "Read Aloud", onClose }: AudioPlayerModalProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);

  const handleStop = () => {
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentWordIndex(0);
  };

  const handlePlay = () => {
    if (!text) return;

    if (isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
      setIsPlaying(true);
      return;
    }

    handleStop();

    const utterance = new SpeechSynthesisUtterance(text);

    utterance.onstart = () => {
      setIsPlaying(true);
      setIsPaused(false);
    };

    utterance.onend = () => {
      setIsPlaying(false);
      setIsPaused(false);
      setCurrentWordIndex(0);
    };

    utterance.onpause = () => {
      setIsPaused(true);
      setIsPlaying(false);
    };

    utterance.onresume = () => {
      setIsPaused(false);
      setIsPlaying(true);
    };

    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        setCurrentWordIndex(event.charIndex);
      }
    };

    window.speechSynthesis.speak(utterance);
  };

  const handlePause = () => {
    window.speechSynthesis.pause();
    setIsPaused(true);
    setIsPlaying(false);
  };

  useEffect(() => {
    if (isOpen && text) {
      // Use setTimeout to avoid synchronous setState inside useEffect warning
      const timerId = setTimeout(() => handlePlay(), 0);
      return () => {
        clearTimeout(timerId);
        handleStop();
      }
    } else {
      const timerId = setTimeout(() => handleStop(), 0);
      return () => clearTimeout(timerId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, text]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-opacity">
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden transform transition-all flex flex-col max-h-[80vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="p-6 flex flex-col flex-1 overflow-hidden">
          <div className="flex justify-between items-center mb-6">
            <h2 id="modal-title" className="text-xl font-semibold text-gray-800">
              {title}
            </h2>
            <button
              onClick={() => {
                handleStop();
                onClose();
              }}
              className="p-2 -mr-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="Close audio player"
            >
              <X size={20} />
            </button>
          </div>

          {text ? (
            <div className="flex-1 overflow-y-auto mb-6 p-4 bg-gray-50 rounded-lg text-sm text-gray-700 leading-relaxed">
              <span>{text.substring(0, currentWordIndex)}</span>
              <span className="bg-yellow-200 font-medium">
                {text.substring(currentWordIndex).split(' ')[0]}
              </span>
              <span>{text.substring(currentWordIndex).substring(text.substring(currentWordIndex).split(' ')[0].length)}</span>
            </div>
          ) : (
             <p className="text-gray-500 text-center mb-6">No text available.</p>
          )}

          <div className="flex justify-center gap-4 mt-auto">
             {!isPlaying ? (
              <button
                onClick={handlePlay}
                disabled={!text}
                className="flex items-center justify-center w-12 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
                aria-label="Play"
              >
                <Play className="ml-1" size={24} />
              </button>
             ) : (
               <button
                onClick={handlePause}
                className="flex items-center justify-center w-12 h-12 bg-yellow-500 hover:bg-yellow-600 text-white rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2"
                aria-label="Pause"
              >
                <Pause size={24} />
              </button>
             )}
            <button
              onClick={handleStop}
              disabled={!isPlaying && !isPaused && currentWordIndex === 0}
              className="flex items-center justify-center w-12 h-12 bg-red-100 hover:bg-red-200 text-red-600 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50"
              aria-label="Stop"
            >
              <Square size={20} fill="currentColor" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
